/**
 * Forme 3D d'une chaussette portée — calcul PUR (aucune dépendance à Three.js ni au DOM).
 *
 * Principe :
 *  - une ligne centrale (mollet → cheville → coude du talon → pied → pointe) ;
 *  - le long de cette ligne, des « anneaux » dont la section suit l'anatomie
 *    (mollet rond, tendon d'Achille étroit, cou-de-pied haut, semelle plate, pointe arrondie) ;
 *  - un talon en poche (bosse arrière) et une semelle posée à plat sur le sol ;
 *  - un ourlet roulé en haut, avec la paroi intérieure visible.
 *
 * La géométrie est ANATOMIQUE (le pied a une vraie longueur de pied), mais la hauteur de la tige
 * suit le nombre de rangs : raccourcir la tige abaisse le haut de la chaussette.
 *
 * Correspondance avec la grille de mailles (convention du projet) :
 *  - colonne 0 = côté intérieur de la jambe ; colonnes [0, W/2) = arrière (talon, semelle) ;
 *    [W/2, W) = avant (devant de jambe, dessus du pied) ;
 *  - rang 0 = haut de la chaussette.
 * Le talon forme un « coin » sur l'arrière : sa hauteur (en longueur de tissu) est maximale au milieu
 * du dos et s'annule sur les côtés, comme un vrai talon à rangs raccourcis. Devant, la tige et le pied
 * se raccordent sans interruption.
 */

export type SockSize = 'homme' | 'femme';

export interface SockShapeInput {
  needles: number;
  cuffRows: number; // 0 si pas de bord-côte
  legRows: number;
  heelRows: number;
  footRows: number;
  toeRows: number;
  rowsPerCm: number;
  size: SockSize;
  side?: 'droite' | 'gauche';
  /** Côtes du bord-côte : nombre de mailles endroit/envers (2 = côtes 2×2). */
  ribWidth?: number;
}

/** Positions clés le long de la ligne centrale (abscisse curviligne s, en mètres, 0 = haut). */
export interface SockLayout {
  input: Required<SockShapeInput>;
  k: number; // facteur d'échelle de la taille
  rowH: number; // hauteur d'un rang (m)
  sMin: number; // bas de la paroi intérieure de l'ourlet (négatif)
  sCuffEnd: number;
  sBendStart: number;
  sBendEnd: number;
  sToeStart: number;
  sTip: number;
  bendRadius: number;
  ankleY: number;
  heelStart: number; // s où commence le talon au milieu du dos
  heelEnd: number; // s où finit le talon (sous le pied) au milieu du dos
  frontSplit: number; // s où la tige rejoint le pied, devant
}

export interface SockMeshData {
  segments: number; // subdivisions sur le tour (sans la couture dupliquée)
  rings: number;
  positions: Float32Array; // (segments+1) × rings × 3
  normals: Float32Array;
  uvAtlas: Float32Array; // (u = tour, v = s normalisé) → atlas couleur
  uvStitch: Float32Array; // (colonne, rang) continus → détail de maille (répété 1× par maille)
  /** 0..1 : intensité du relief de maille (atténué à la pointe où la paramétrisation se referme). */
  knitMask: Float32Array;
  /** Variation de v (atlas) pour un rang : sert à dessiner les frontières de maille en chevron. */
  atlasPerRow: Float32Array;
  indices: Uint32Array;
}

const TAU = Math.PI * 2;

// ---------- utilitaires ----------
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Interpolation douce (Hermite monotone simplifiée) dans une table [x, y] triée. */
function curve(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i]!;
    const [x1, y1] = table[i + 1]!;
    if (x <= x1) return lerp(y0, y1, smooth((x - x0) / (x1 - x0)));
  }
  return last[1];
}

// ---------- anatomie (mètres, taille homme ; la taille femme est mise à l'échelle) ----------
// Demi-largeur (côté), demi-profondeur avant et arrière de la jambe en fonction de la hauteur au sol.
const LEG_A: Array<[number, number]> = [[0.08, 0.035], [0.12, 0.032], [0.17, 0.037], [0.25, 0.047], [0.33, 0.054], [0.42, 0.052]];
const LEG_BF: Array<[number, number]> = [[0.08, 0.031], [0.12, 0.028], [0.17, 0.032], [0.25, 0.039], [0.33, 0.044], [0.42, 0.044]];
const LEG_BB: Array<[number, number]> = [[0.08, 0.034], [0.12, 0.027], [0.17, 0.033], [0.25, 0.048], [0.33, 0.058], [0.42, 0.054]];
// Pied, en fonction de u ∈ [0,1] (0 = sortie du coude du talon, 1 = bout).
const FOOT_A: Array<[number, number]> = [[0, 0.036], [0.3, 0.042], [0.62, 0.052], [0.85, 0.05], [1, 0.044]];
const FOOT_BF: Array<[number, number]> = [[0, 0.036], [0.25, 0.032], [0.6, 0.02], [0.85, 0.016], [1, 0.015]];
const FOOT_Y: Array<[number, number]> = [[0, 0.052], [0.3, 0.048], [0.6, 0.034], [0.85, 0.026], [1, 0.024]];

const SIZE_SCALE: Record<SockSize, number> = { homme: 1, femme: 0.91 };
const FOOT_LENGTH = 0.27; // homme, talon → orteils (pointure ~43)
const HEEL_BACK = 0.048; // recul du talon derrière l'axe de la jambe

export function sockLayout(raw: SockShapeInput): SockLayout {
  const input: Required<SockShapeInput> = { side: 'droite', ribWidth: 2, ...raw };
  const k = SIZE_SCALE[input.size];
  const rowH = 0.01 / input.rowsPerCm;
  const ankleY = 0.1 * k;
  const bendRadius = 0.045 * k;
  const legLen = (input.cuffRows + input.legRows) * rowH;
  const sBendStart = legLen;
  const sBendEnd = sBendStart + (bendRadius * Math.PI) / 2;
  const toeLen = 0.05 * k;
  const footStraight = FOOT_LENGTH * k - HEEL_BACK * k - bendRadius - toeLen;
  const sToeStart = sBendEnd + footStraight;
  const sTip = sToeStart + toeLen;
  return {
    input,
    k,
    rowH,
    sMin: -0.03 * k,
    sCuffEnd: input.cuffRows * rowH,
    sBendStart,
    sBendEnd,
    sToeStart,
    sTip,
    bendRadius,
    ankleY,
    heelStart: sBendStart - 0.018 * k,
    heelEnd: sBendEnd + 0.045 * k,
    frontSplit: sBendStart + (sBendEnd - sBendStart) * 0.3,
  };
}

// ---------- correspondance tissu ↔ grille ----------
export const ZONE_RIM = -1;
export const ZONE_CUFF = 0;
export const ZONE_LEG = 1;
export const ZONE_HEEL = 2;
export const ZONE_FOOT = 3;
export const ZONE_TOE = 4;

/** Poids du talon selon l'angle autour de la jambe : 1 au milieu du dos, 0 sur les côtés et devant. */
export function heelWeight(phi: number): number {
  const p = ((phi % TAU) + TAU) % TAU;
  if (p >= Math.PI) return 0;
  return Math.pow(Math.sin(p), 0.55);
}

export interface FabricPoint {
  zone: number;
  row: number; // rang continu dans la grille (0 = haut), peut être fractionnaire
}

/** Pour un point du tissu (angle φ, abscisse s), la zone et le rang de la grille correspondants. */
export function fabricAt(L: SockLayout, phi: number, s: number): FabricPoint {
  const { cuffRows, legRows, heelRows, footRows, toeRows } = L.input;
  if (s < 0) return { zone: ZONE_RIM, row: cuffRows > 0 ? 0 : 0 };
  if (s < L.sCuffEnd) return { zone: ZONE_CUFF, row: (s / L.sCuffEnd) * cuffRows };
  // Les rangs gardent un espacement régulier (pas de compression) : la tige est répartie jusqu'au
  // raccord avant, le pied depuis ce raccord jusqu'à la pointe. Le talon « recouvre » ces rangs sur le
  // dos, avec des bords en diagonale comme un vrai talon (lignes de rangs raccourcis).
  const w = heelWeight(phi);
  const legEnd = lerp(L.frontSplit, L.heelStart, w);
  const footStart = lerp(L.frontSplit, L.heelEnd, w);
  const toeStart = L.sToeStart - 0.004 * L.k;
  const r0 = cuffRows;
  if (s < legEnd) return { zone: ZONE_LEG, row: r0 + ((s - L.sCuffEnd) / (L.frontSplit - L.sCuffEnd)) * legRows };
  const r1 = r0 + legRows;
  if (s < footStart) return { zone: ZONE_HEEL, row: r1 + ((s - legEnd) / (footStart - legEnd)) * heelRows };
  const r2 = r1 + heelRows;
  if (s < toeStart) return { zone: ZONE_FOOT, row: r2 + ((s - L.frontSplit) / (toeStart - L.frontSplit)) * footRows };
  const r3 = r2 + footRows;
  return { zone: ZONE_TOE, row: r3 + clamp((s - toeStart) / (L.sTip - toeStart), 0, 1) * toeRows };
}

// ---------- ligne centrale et sections ----------
interface Frame {
  cy: number;
  cz: number;
  ty: number;
  tz: number; // tangente (dans le plan y-z)
  a: number; // demi-largeur (x)
  bF: number; // demi-profondeur avant (+N)
  bB: number; // demi-profondeur arrière (−N)
  pB: number; // exposant de super-ellipse côté arrière (2 = rond, >2 = plus plat)
}

function legSection(y: number, k: number) {
  const h = y / k;
  return { a: curve(LEG_A, h) * k, bF: curve(LEG_BF, h) * k, bB: curve(LEG_BB, h) * k };
}

function frameAt(L: SockLayout, s: number): Frame {
  const k = L.k;
  const R = L.bendRadius;
  const yA = L.ankleY;
  if (s <= L.sBendStart) {
    const y = yA + (L.sBendStart - s);
    return { cy: y, cz: 0, ty: -1, tz: 0, ...legSection(y, k), pB: 2 };
  }
  const footLen = L.sTip - L.sBendEnd;
  if (s <= L.sBendEnd) {
    const al = (s - L.sBendStart) / R;
    const t = al / (Math.PI / 2);
    const leg = legSection(yA, k);
    const u0 = { a: curve(FOOT_A, 0) * k, bF: curve(FOOT_BF, 0) * k, y: curve(FOOT_Y, 0) * k };
    const cy = yA - R * Math.sin(al);
    const tt = smooth(t);
    return {
      cy,
      cz: R - R * Math.cos(al),
      ty: -Math.cos(al),
      tz: Math.sin(al),
      a: lerp(leg.a, u0.a, tt),
      bF: lerp(leg.bF, u0.bF, tt),
      // derrière : on garde de l'ampleur pour la poche du talon, puis la semelle rejoint le sol
      bB: lerp(leg.bB, Math.max(u0.y, 0.03 * k), tt),
      pB: lerp(2, 2.8, tt),
    };
  }
  const u = (s - L.sBendEnd) / footLen;
  const yEnd = curve(FOOT_Y, 0) * k;
  const cyRaw = curve(FOOT_Y, u) * k;
  // raccord continu avec la fin du coude
  const cy = cyRaw + (yA - R - yEnd) * (1 - smooth(u / 0.35));
  let a = curve(FOOT_A, u) * k;
  let bF = curve(FOOT_BF, u) * k;
  let bB = cy; // la semelle touche le sol (y = 0)
  if (s > L.sToeStart) {
    // pointe : profil arrondi qui se referme
    const t = (s - L.sToeStart) / (L.sTip - L.sToeStart);
    const f = Math.sqrt(Math.max(0, 1 - t * t));
    a *= lerp(1, f, 1);
    bF *= lerp(1, f, 0.9) ;
    bB *= f;
  }
  const dy = (curve(FOOT_Y, Math.min(1, u + 0.01)) - curve(FOOT_Y, Math.max(0, u - 0.01))) * k;
  const dz = 0.02 * footLen;
  const n = Math.hypot(dy, dz);
  return { cy, cz: R + (s - L.sBendEnd), ty: dy / n, tz: dz / n, a, bF, bB, pB: 2.8 };
}

/** Point de super-ellipse : exposant 2 = ellipse, plus grand = plus « carré ». */
function superE(c: number, p: number) {
  return Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
}

/** Position du tissu (tube principal) pour l'angle φ et l'abscisse s ≥ 0. */
function surfacePoint(L: SockLayout, phi: number, s: number, out: Float64Array) {
  const f = frameAt(L, s);
  // repère : X = côté intérieur (chaussette droite), N = avant, T = tangente
  const ny = f.tz;
  const nz = -f.ty;
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const back = sn > 0; // sin φ > 0 → moitié arrière
  const pSide = back ? f.pB : 2.15;
  const x = f.a * superE(c, pSide);
  let depth = (back ? f.bB : f.bF) * superE(sn, pSide); // positif = arrière
  // plis du tissu au pli de la cheville, devant (le tissu se tasse à l'intérieur du coude)
  const k0 = L.k;
  if (!back) {
    const env = Math.exp(-(((s - L.frontSplit) / (0.016 * k0)) ** 2));
    const fw = Math.pow(-sn, 3);
    const wav = Math.sin(((s - L.frontSplit) / (0.0085 * k0)) * Math.PI * 2 + c * 1.3);
    depth -= 0.0011 * k0 * env * fw * (0.6 + 0.4 * wav);
  }
  let px = x;
  let py = f.cy - depth * ny;
  let pz = f.cz - depth * nz;

  // poche du talon : bosse vers l'arrière et le bas, centrée sur le coude
  const k = L.k;
  const w = back ? Math.pow(sn, 1.6) : 0;
  const sMid = lerp(L.sBendStart, L.sBendEnd, 0.42);
  const g = Math.exp(-(((s - sMid) / (0.03 * k)) ** 2));
  pz -= 0.017 * k * g * w;
  py -= 0.004 * k * g * w;

  // malléoles (chevilles) : légers reliefs sur les côtés
  const mal = Math.exp(-(((s - (L.sBendStart - 0.006 * k)) / (0.012 * k)) ** 2));
  const sideW = Math.pow(Math.abs(c), 6) * (sn > -0.2 ? 1 : 0.5);
  px += Math.sign(c) * 0.0045 * k * mal * sideW;

  // bord-côte : côtes verticales (légère ondulation radiale) et serrage
  if (s < L.sCuffEnd) {
    const rw = L.input.ribWidth;
    const rib = Math.cos((phi * L.input.needles) / (2 * rw)) ;
    const amp = 0.00055 * k;
    const r = Math.hypot(px, depth) || 1;
    px += (px / r) * amp * rib;
    py -= (depth / r) * amp * rib * ny;
    pz -= (depth / r) * amp * rib * nz;
  }

  // contact avec le sol : la semelle s'écrase doucement à y = 0
  if (py < 0.004) py = 0.004 - softplus(0.004 - py, 0.0025);
  if (L.input.side === 'gauche') px = -px;
  out[0] = px;
  out[1] = py;
  out[2] = pz;
}

function softplus(x: number, width: number) {
  // ≈ x pour x petit, sature vers `width` : écrase doucement ce qui passe sous le sol
  return width * (1 - Math.exp(-x / width));
}

/** Ourlet : s < 0 → on roule le bord vers l'intérieur puis on descend le long de la paroi intérieure. */
function rimPoint(L: SockLayout, phi: number, s: number, out: Float64Array) {
  const top = new Float64Array(3);
  surfacePoint(L, phi, 0, top);
  const cx = 0;
  const cz = 0;
  let dx = top[0]! - cx;
  let dz = top[2]! - cz;
  const r = Math.hypot(dx, dz) || 1;
  dx /= r;
  dz /= r;
  const rho = 0.0022 * L.k; // rayon du roulé
  const rollLen = Math.PI * rho;
  const d = -s; // distance parcourue depuis le haut
  let radial: number;
  let y: number;
  if (d <= rollLen) {
    const beta = d / rho;
    radial = r - rho + rho * Math.cos(beta);
    y = top[1]! + rho * Math.sin(beta);
  } else {
    radial = r - 2 * rho;
    y = top[1]! - (d - rollLen);
  }
  out[0] = cx + dx * radial;
  out[1] = y;
  out[2] = cz + dz * radial;
}

function pointAt(L: SockLayout, phi: number, s: number, out: Float64Array) {
  if (s < 0) rimPoint(L, phi, s, out);
  else surfacePoint(L, phi, s, out);
}

/** Espacement d'un rang le long de s, par zone (pour le chevron). */
function rowSpacingAt(L: SockLayout, zone: number): number {
  const { cuffRows, legRows, footRows } = L.input;
  if (zone === ZONE_CUFF && cuffRows > 0) return L.sCuffEnd / cuffRows;
  if (zone === ZONE_FOOT || zone === ZONE_TOE) return (L.sToeStart - L.frontSplit) / Math.max(1, footRows);
  if (zone === ZONE_HEEL) return 0;
  return (L.frontSplit - L.sCuffEnd) / Math.max(1, legRows);
}

/** Abscisses des anneaux : pas régulier, plus fin dans l'ourlet et le coude. */
function ringStations(L: SockLayout): number[] {
  const st: number[] = [];
  const k = L.k;
  const push = (a: number, b: number, step: number) => {
    const n = Math.max(1, Math.round((b - a) / step));
    for (let i = 0; i < n; i++) st.push(a + ((b - a) * i) / n);
  };
  push(L.sMin, 0, 0.0012 * k);
  push(0, L.sBendStart - 0.02 * k, 0.0014 * k);
  push(L.sBendStart - 0.02 * k, L.sBendEnd + 0.03 * k, 0.0009 * k);
  push(L.sBendEnd + 0.03 * k, L.sToeStart, 0.0014 * k);
  push(L.sToeStart, L.sTip, 0.0008 * k);
  st.push(L.sTip);
  return st;
}

/**
 * Construit le maillage complet.
 * @param segmentsPerStitch subdivisions par maille sur le tour (2 = bon compromis).
 */
export function buildSockMesh(input: SockShapeInput, segmentsPerStitch = 2): SockMeshData {
  const L = sockLayout(input);
  const W = L.input.needles;
  const segments = W * segmentsPerStitch;
  const stations = ringStations(L);
  const rings = stations.length;
  const cols = segments + 1;
  const n = cols * rings;
  const positions = new Float32Array(n * 3);
  const uvAtlas = new Float32Array(n * 2);
  const uvStitch = new Float32Array(n * 2);
  const knitMask = new Float32Array(n);
  const atlasPerRow = new Float32Array(n);
  const p = new Float64Array(3);
  const span = L.sTip - L.sMin;

  for (let j = 0; j < rings; j++) {
    const s = stations[j]!;
    for (let i = 0; i < cols; i++) {
      const phi = (TAU * i) / segments;
      pointAt(L, phi, s, p);
      const v = j * cols + i;
      positions[v * 3] = p[0]!;
      positions[v * 3 + 1] = p[1]!;
      positions[v * 3 + 2] = p[2]!;
      uvAtlas[v * 2] = i / segments;
      uvAtlas[v * 2 + 1] = 1 - (s - L.sMin) / span; // v = 1 en haut (convention texture)
      const fab = fabricAt(L, phi, s);
      uvStitch[v * 2] = (i / segments) * W;
      uvStitch[v * 2 + 1] = s < 0 ? s / L.rowH : fab.row;
      knitMask[v] = smooth((L.sTip - s) / (0.012 * L.k));
      atlasPerRow[v] = rowSpacingAt(L, fab.zone) / span;
    }
  }
  // la pointe se referme sur un point
  const tip = (rings - 1) * cols;
  let tx = 0, ty = 0, tz = 0;
  for (let i = 0; i < cols; i++) {
    tx += positions[(tip + i) * 3]!;
    ty += positions[(tip + i) * 3 + 1]!;
    tz += positions[(tip + i) * 3 + 2]!;
  }
  for (let i = 0; i < cols; i++) {
    positions[(tip + i) * 3] = tx / cols;
    positions[(tip + i) * 3 + 1] = ty / cols;
    positions[(tip + i) * 3 + 2] = tz / cols;
  }

  const normals = computeGridNormals(positions, cols, rings, segments);

  // triangles, orientés pour que la face avant regarde vers l'extérieur
  const indices = new Uint32Array((cols - 1) * (rings - 1) * 6);
  let o = 0;
  const flip = L.input.side === 'gauche';
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (!flip) {
        indices.set([a, c, b, b, c, d], o);
      } else {
        indices.set([a, b, c, b, d, c], o);
      }
      o += 6;
    }
  }
  return { segments, rings, positions, normals, uvAtlas, uvStitch, knitMask, atlasPerRow, indices };
}

/** Normales lisses calculées sur la grille paramétrique (couture et pointe gérées). */
function computeGridNormals(pos: Float32Array, cols: number, rings: number, segments: number): Float32Array {
  const nrm = new Float32Array(pos.length);
  const P = (i: number, j: number, c: number) => pos[(j * cols + (((i % segments) + segments) % segments)) * 3 + c]!;
  // signe de référence : sur la tige, la normale doit s'éloigner de l'axe
  let sign = 1;
  const poles: Array<[number, number, number, number]> = [];
  for (let j = 0; j < rings; j++) {
    const jm = Math.max(0, j - 1);
    const jp = Math.min(rings - 1, j + 1);
    for (let i = 0; i < cols; i++) {
      const ax = P(i + 1, j, 0) - P(i - 1, j, 0);
      const ay = P(i + 1, j, 1) - P(i - 1, j, 1);
      const az = P(i + 1, j, 2) - P(i - 1, j, 2);
      const bx = P(i, jp, 0) - P(i, jm, 0);
      const by = P(i, jp, 1) - P(i, jm, 1);
      const bz = P(i, jp, 2) - P(i, jm, 2);
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      let len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) {
        // pointe (anneau réduit à un point) : normale = du centre de l'anneau précédent vers la pointe
        let cxm = 0, cym = 0, czm = 0;
        for (let q = 0; q < segments; q++) { cxm += P(q, jm, 0); cym += P(q, jm, 1); czm += P(q, jm, 2); }
        nx = P(i, j, 0) - cxm / segments;
        ny = P(i, j, 1) - cym / segments;
        nz = P(i, j, 2) - czm / segments;
        len = Math.hypot(nx, ny, nz) || 1;
        const v = (j * cols + i) * 3;
        poles.push([v, nx / len, ny / len, nz / len]);
        continue;
      }
      const v = (j * cols + i) * 3;
      nrm[v] = nx / len;
      nrm[v + 1] = ny / len;
      nrm[v + 2] = nz / len;
    }
  }
  // orientation : on teste un point du milieu de la tige
  const jRef = Math.floor(rings * 0.25);
  const iRef = 0;
  const v = (jRef * cols + iRef) * 3;
  const out = pos[v]! * nrm[v]! + pos[v + 2]! * nrm[v + 2]!; // axe de la jambe ≈ (0, y, 0)
  if (out < 0) sign = -1;
  if (sign < 0) for (let q = 0; q < nrm.length; q++) nrm[q] = -nrm[q]!;
  // la pointe est orientée géométriquement (vers l'avant), indépendamment du signe ci-dessus
  // (moyenne des normales de l'anneau précédent : sommet de dôme bien lisse)
  for (const [v, x, y, z] of poles) {
    const j = Math.floor(v / 3 / cols);
    let ax = 0, ay = 0, az = 0;
    for (let q = 0; q < segments; q++) {
      const w = ((j - 1) * cols + q) * 3;
      ax += nrm[w]!;
      ay += nrm[w + 1]!;
      az += nrm[w + 2]!;
    }
    const l = Math.hypot(ax, ay, az);
    if (l > 1e-9) {
      nrm[v] = ax / l;
      nrm[v + 1] = ay / l;
      nrm[v + 2] = az / l;
    } else {
      nrm[v] = x;
      nrm[v + 1] = y;
      nrm[v + 2] = z;
    }
  }
  return nrm;
}
