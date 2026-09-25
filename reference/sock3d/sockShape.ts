/**
 * Forme 3D d'une chaussette portée — calcul PUR (aucune dépendance à Three.js ni au DOM).
 *
 * Méthode « loft » (comme en modélisation à partir de plans) :
 *  - deux PROFILS DE CÔTÉ réels : la ligne arrière (mollet → tendon d'Achille → talon → semelle → bout)
 *    et la ligne avant (tibia → pli de la cheville → dessus du pied → bout) ;
 *  - des LARGEURS de vue de face / de dessus (côté intérieur et extérieur séparés : le pied n'est pas
 *    symétrique, le gros orteil est à l'intérieur) ;
 *  - chaque anneau du tricot relie un point de la ligne arrière à un point de la ligne avant ; sa section
 *    est une super-ellipse (ronde sur la jambe, semelle plate sous le pied).
 * La silhouette de profil suit donc EXACTEMENT les profils anatomiques : pas de bosse parasite.
 *
 * Mesures : moyennes de l'enquête anthropométrique ANSUR II (US Army, 4 082 hommes / 1 986 femmes) :
 *   hommes — longueur de pied 271 mm, largeur au métatarse 102 mm, largeur du talon 72,5 mm,
 *   tour de cheville 229 mm, largeur bimalléolaire 75 mm, malléole externe à 73 mm du sol ;
 *   femmes — 246 / 93 / 67 / 216 / 67 / 63 mm.
 * Hauteurs du dessus du pied (≈ 26 % de la longueur à mi-pied, ≈ 34 mm au métatarse) : littérature
 * de conception de formes de chaussure.
 *
 * Correspondance avec la grille de mailles (convention du projet) :
 *  - colonne 0 = côté intérieur ; colonnes [0, W/2) = arrière (talon, semelle) ; [W/2, W) = avant ;
 *  - rang 0 = haut de la chaussette.
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
  /** Hauteur où monte le talon au milieu du dos, en mm au-dessus du sol (taille homme ; mise à l'échelle pour femme). */
  heelHeight?: number;
  /** Jusqu'où le talon s'étend sous le pied, en mm depuis l'arrière du talon (taille homme ; mise à l'échelle). */
  heelDepth?: number;
  /** Largeur du talon autour de la cheville : 1 = moitié arrière complète (défaut), < 1 = plus étroit. */
  heelSpread?: number;
}

/** Valeurs par défaut du talon (mm, taille homme). */
export const HEEL_DEFAULTS = { heelHeight: 55, heelDepth: 72, heelSpread: 1 } as const;

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

// ======================================================================================
// 1. Données anatomiques (homme, millimètres). Axe z : talon (0) → bout du pied ; y : hauteur.
// ======================================================================================

const FOOT_LENGTH_MM: Record<SockSize, number> = { homme: 271.2, femme: 246.3 };
/** Facteurs par taille pour les largeurs de jambe (tour de cheville / mollet ANSUR II). */
const LEG_SCALE: Record<SockSize, number> = { homme: 1, femme: 0.95 };

/** Profil ARRIÈRE : haut du mollet → Achille → talon arrondi → semelle → bout. */
const BACK_PROFILE: Array<[number, number]> = [
  [-20, 430], [-22, 360], [-18, 310], [-8, 260], [6, 205], [14, 160], [17, 120], [15, 90],
  [10, 62], [4, 42], [1, 28], [2, 16], [7, 7], [16, 2], [30, 0], [50, 0], [90, 0], [150, 0],
  [205, 0], [238, 0.5], [256, 3], [266, 7.5], [271.2, 13],
];
/** Profil AVANT : tibia → pli de cheville (arrondi) → dessus du pied → orteils → bout. */
const FRONT_PROFILE: Array<[number, number]> = [
  [98, 430], [96, 360], [93, 290], [90, 220], [88, 160], [88, 125], [90, 104], [96, 92],
  [106, 84], [122, 76], [140, 68], [165, 57], [190, 46], [212, 37], [232, 30], [250, 25],
  [262, 20], [268.5, 16.5], [271.2, 13],
];

/** Demi-largeurs de la jambe selon la hauteur : [y, côté intérieur, côté extérieur]. */
const LEG_WIDTH: Array<[number, number, number]> = [
  [0, 36, 36], [40, 37.5, 37.5], [62, 38, 38.5], // malléole externe (~73 mm) plus basse
  [80, 39, 36.5], // malléole interne plus haute
  [110, 37, 36], [140, 38, 37], [180, 42, 41], [230, 49, 47], [290, 57, 55], [340, 60, 58], [430, 58, 56],
];
/** Demi-largeurs du pied selon z : [z, côté intérieur, côté extérieur]. */
const FOOT_WIDTH: Array<[number, number, number]> = [
  [0, 20, 20], [12, 31, 31], [35, 36, 36.5], // largeur du talon ≈ 72,5
  [80, 36, 38.5], [135, 39, 43], [170, 45, 50.5], [188, 49.5, 52], // largeur métatarsienne ≈ 102
  [210, 49, 48], [232, 45.5, 40], [250, 38, 30], [262, 29, 19], [268, 20, 9], [271.2, 9, -2],
];

/** Hauteurs (mm) des repères pour apparier les deux profils. */
const ANKLE_Y = 118; // début du coude (au-dessus des malléoles)
const HEEL_SOLE_Z = 62; // fin du talon, sous le pied
const CREASE_Z = 112; // fin du pli de cheville, devant
const TOE_Z = 226; // début de la pointe

// ======================================================================================
// 2. Courbes 2D (Catmull-Rom centripète, échantillonnées finement)
// ======================================================================================

interface Polyline {
  z: Float64Array;
  y: Float64Array;
  len: Float64Array; // longueur cumulée
}

function catmull(points: Array<[number, number]>, perSeg = 24): Polyline {
  const P = points;
  const zs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]!;
    const p1 = P[i]!;
    const p2 = P[i + 1]!;
    const p3 = P[Math.min(P.length - 1, i + 2)]!;
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      zs.push(f(p0[0], p1[0], p2[0], p3[0]));
      ys.push(f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  const last = P[P.length - 1]!;
  zs.push(last[0]);
  ys.push(last[1]);
  const len = new Float64Array(zs.length);
  for (let i = 1; i < zs.length; i++) len[i] = len[i - 1]! + Math.hypot(zs[i]! - zs[i - 1]!, ys[i]! - ys[i - 1]!);
  return { z: Float64Array.from(zs), y: Float64Array.from(ys), len };
}

function pointAtLen(c: Polyline, l: number): [number, number] {
  const n = c.len.length;
  const L = clamp(l, 0, c.len[n - 1]!);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c.len[m]! <= L) lo = m;
    else hi = m;
  }
  const t = (L - c.len[lo]!) / Math.max(1e-9, c.len[hi]! - c.len[lo]!);
  return [lerp(c.z[lo]!, c.z[hi]!, t), lerp(c.y[lo]!, c.y[hi]!, t)];
}

/** Longueur où la courbe passe pour la première fois sous la hauteur y (en descendant). */
function lenAtY(c: Polyline, y: number): number {
  for (let i = 1; i < c.y.length; i++) {
    if (c.y[i]! <= y) {
      const t = (c.y[i - 1]! - y) / Math.max(1e-9, c.y[i - 1]! - c.y[i]!);
      return lerp(c.len[i - 1]!, c.len[i]!, t);
    }
  }
  return c.len[c.len.length - 1]!;
}

/** Longueur où la courbe dépasse z (après son point le plus en arrière). */
function lenAtZ(c: Polyline, z: number, fromLen = 0): number {
  for (let i = 1; i < c.z.length; i++) {
    if (c.len[i]! < fromLen) continue;
    if (c.z[i]! >= z && c.z[i - 1]! < z) {
      const t = (z - c.z[i - 1]!) / Math.max(1e-9, c.z[i]! - c.z[i - 1]!);
      return lerp(c.len[i - 1]!, c.len[i]!, t);
    }
  }
  return c.len[c.len.length - 1]!;
}

function table3(t: Array<[number, number, number]>, x: number): [number, number] {
  if (x <= t[0]![0]) return [t[0]![1], t[0]![2]];
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i]!;
    const b = t[i + 1]!;
    if (x <= b[0]) {
      const u = (x - a[0]) / (b[0] - a[0]);
      const s = u * u * (3 - 2 * u) * 0.5 + u * 0.5; // mi-linéaire, mi-lissé : pas de marches
      return [lerp(a[1], b[1], s), lerp(a[2], b[2], s)];
    }
  }
  const l = t[t.length - 1]!;
  return [l[1], l[2]];
}

// ======================================================================================
// 3. Anneaux du tricot
// ======================================================================================

/** Un anneau : relie le point arrière B au point avant F (plan y-z), + largeurs. En mètres. */
export interface Ring {
  s: number; // abscisse le long du chemin des centres (m), 0 = haut du tissu
  bz: number; by: number; // point arrière
  fz: number; fy: number; // point avant
  med: number; lat: number; // demi-largeurs intérieur / extérieur
  xc: number; // décalage latéral du centre (asymétrie du pied)
  pBack: number; pFront: number; // exposants de super-ellipse (dos/semelle, devant/dessus)
  footness: number; // 0 = jambe, 1 = pied
}

export interface SockLayout {
  input: Required<SockShapeInput>;
  k: number; // échelle du pied (longueur / homme)
  rowH: number;
  sMin: number;
  sCuffEnd: number;
  sBendStart: number;
  sBendEnd: number;
  sToeStart: number;
  sTip: number;
  heelStart: number;
  heelEnd: number;
  frontSplit: number;
  topY: number;
  rings: Ring[]; // anneaux fins (échantillonnage dense), s croissant
}

const Z_SHIFT_MM = 52; // centre la jambe sur l'axe vertical (x = 0, z ≈ 0)

const layoutCache = new Map<string, SockLayout>();

export function sockLayout(raw: SockShapeInput): SockLayout {
  const input: Required<SockShapeInput> = { side: 'droite', ribWidth: 2, ...HEEL_DEFAULTS, ...raw };
  const key = JSON.stringify(input);
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const k = FOOT_LENGTH_MM[input.size] / FOOT_LENGTH_MM.homme;
  const kl = LEG_SCALE[input.size];
  const rowH = 0.01 / input.rowsPerCm;
  const mm = 0.001;
  const back = catmull(BACK_PROFILE.map(([z, y]) => [z * k, y * k] as [number, number]));
  const front = catmull(FRONT_PROFILE.map(([z, y]) => [z * k, y * k] as [number, number]));

  // Hauteur du haut de la chaussette : le coude commence à ANKLE_Y ; au-dessus, la tige (en rangs).
  const legMm = (input.cuffRows + input.legRows) * rowH * 1000;
  const topY = Math.min(420 * k, ANKLE_Y * k + legMm - 18 * k);

  // Repères sur chaque profil (longueurs d'arc)
  const bA = lenAtY(back, topY), fA = lenAtY(front, topY);
  const bB = lenAtY(back, ANKLE_Y * k), fB = lenAtY(front, ANKLE_Y * k);
  const heelLowest = lenAtY(back, 0.5);
  const bC = lenAtZ(back, HEEL_SOLE_Z * k, heelLowest), fC = lenAtZ(front, CREASE_Z * k, fB);
  const bD = lenAtZ(back, TOE_Z * k, bC), fD = lenAtZ(front, TOE_Z * k, fC);
  const bE = back.len[back.len.length - 1]!, fE = front.len[front.len.length - 1]!;
  const marks: Array<[number, number, number]> = [ // [nb d'anneaux fins, b, f]
    [0, bA, fA], [700, bB, fB], [500, bC, fC], [700, bD, fD], [260, bE, fE],
  ];

  const rings: Ring[] = [];
  for (let seg = 0; seg < marks.length - 1; seg++) {
    const [, b0, f0] = marks[seg]!;
    const [n, b1, f1] = marks[seg + 1]!;
    for (let i = 0; i < n; i++) {
      let t = i / n;
      if (seg === 3) t = Math.sin((t * Math.PI) / 2); // pointe : anneaux resserrés vers le bout
      const [bz, by] = pointAtLen(back, lerp(b0, b1, t));
      const [fz, fy] = pointAtLen(front, lerp(f0, f1, t));
      const cz = (bz + fz) / 2;
      const cy = (by + fy) / 2;
      // largeurs : jambe selon la hauteur, pied selon z, mélange dans le coude
      const footness = seg === 0 ? 0 : seg === 1 ? smooth(t) : 1;
      const [lm, ll] = table3(LEG_WIDTH, cy / k);
      const [pm, pl] = table3(FOOT_WIDTH, cz / k);
      const med = lerp(lm * kl, pm * k, footness);
      const lat = lerp(ll * kl, pl * k, footness);
      rings.push({
        s: 0,
        bz: (bz - Z_SHIFT_MM * k) * mm, by: by * mm,
        fz: (fz - Z_SHIFT_MM * k) * mm, fy: fy * mm,
        med: Math.max(0, med) * mm, lat: lat * mm, xc: 0,
        // talon arrondi dans le coude ; la semelle ne s'aplatit qu'une fois sous le pied
        pBack: seg <= 1 ? 2.1 : seg === 2 ? lerp(2.1, 3.4, smooth(t / 0.35)) : 3.4,
        pFront: lerp(2.05, 2.25, footness),
        footness,
      });
    }
  }
  const tipB = pointAtLen(back, bE);
  rings.push({ s: 0, bz: (tipB[0] - Z_SHIFT_MM * k) * mm, by: tipB[1] * mm, fz: (tipB[0] - Z_SHIFT_MM * k) * mm, fy: tipB[1] * mm, med: 0, lat: 0, xc: 0, pBack: 3.4, pFront: 2.25, footness: 1 });
  // le bout du pied est décalé vers l'intérieur (gros orteil) : on garde le centre de la section
  for (const r of rings) {
    const half = (r.med + r.lat) / 2;
    r.xc = (r.med - r.lat) / 2; // centre décalé
    r.med = half;
    r.lat = half;
  }
  // abscisse le long des centres
  let s = 0;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i]!;
    if (i > 0) {
      const p = rings[i - 1]!;
      s += Math.hypot((r.bz + r.fz - p.bz - p.fz) / 2, (r.by + r.fy - p.by - p.fy) / 2, r.xc - p.xc);
    }
    r.s = s;
  }
  const sB = rings[700]!.s;
  const sC = rings[1200]!.s;
  const sD = rings[1900]!.s;
  const sTip = rings[rings.length - 1]!.s;
  const L: SockLayout = {
    input, k, rowH,
    sMin: -0.03 * k,
    sCuffEnd: input.cuffRows * rowH,
    sBendStart: sB,
    sBendEnd: sC,
    sToeStart: sD,
    sTip,
    ...heelRange(rings, input, k),
    frontSplit: lerp(sB, sC, 0.45),
    topY: topY * mm,
    rings,
  };
  layoutCache.set(key, L);
  return L;
}

/**
 * Étendue du talon au milieu du dos, sur l'abscisse s : il commence quand la ligne arrière descend
 * sous `heelHeight` et finit quand la semelle atteint `heelDepth` depuis l'arrière du talon.
 */
function heelRange(rings: Ring[], input: Required<SockShapeInput>, k: number) {
  const mm = 0.001;
  const hY = clamp(input.heelHeight, 15, 160) * k * mm;
  const hZ = clamp(input.heelDepth, 25, 160) * k * mm - Z_SHIFT_MM * k * mm; // repère décalé
  let start = rings[0]!.s;
  let i = 0;
  for (; i < rings.length; i++) {
    if (rings[i]!.by <= hY) {
      start = rings[i]!.s;
      break;
    }
  }
  // point le plus en arrière / le plus bas du talon, puis on avance sous le pied
  let j = i;
  while (j < rings.length - 1 && rings[j]!.by > 0.001) j++;
  let end = rings[j]!.s;
  for (let q = j; q < rings.length; q++) {
    if (rings[q]!.bz >= hZ) {
      end = rings[q]!.s;
      break;
    }
  }
  if (end < start + 0.005 * k) end = start + 0.005 * k;
  return { heelStart: start, heelEnd: end };
}

/** Anneau interpolé à l'abscisse s (≥ 0). */
function ringAt(L: SockLayout, s: number): Ring {
  const R = L.rings;
  if (s <= 0) return R[0]!;
  if (s >= L.sTip) return R[R.length - 1]!;
  let lo = 0;
  let hi = R.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (R[m]!.s <= s) lo = m;
    else hi = m;
  }
  const a = R[lo]!;
  const b = R[hi]!;
  const t = (s - a.s) / Math.max(1e-12, b.s - a.s);
  return {
    s,
    bz: lerp(a.bz, b.bz, t), by: lerp(a.by, b.by, t),
    fz: lerp(a.fz, b.fz, t), fy: lerp(a.fy, b.fy, t),
    med: lerp(a.med, b.med, t), lat: lerp(a.lat, b.lat, t), xc: lerp(a.xc, b.xc, t),
    pBack: lerp(a.pBack, b.pBack, t), pFront: lerp(a.pFront, b.pFront, t),
    footness: lerp(a.footness, b.footness, t),
  };
}

// ======================================================================================
// 4. Correspondance tissu ↔ grille
// ======================================================================================

export const ZONE_RIM = -1;
export const ZONE_CUFF = 0;
export const ZONE_LEG = 1;
export const ZONE_HEEL = 2;
export const ZONE_FOOT = 3;
export const ZONE_TOE = 4;

/** Poids du talon selon l'angle autour de la jambe : 1 au milieu du dos, 0 sur les côtés et devant. */
export function heelWeight(phi: number, spread = 1): number {
  const p = ((phi % TAU) + TAU) % TAU;
  if (p >= Math.PI) return 0;
  // spread < 1 : le talon se resserre vers le milieu du dos
  const sp = clamp(spread, 0.3, 1);
  const q = Math.PI / 2 + (p - Math.PI / 2) / sp;
  if (q <= 0 || q >= Math.PI) return 0;
  return Math.pow(Math.sin(q), 0.55);
}

export interface FabricPoint {
  zone: number;
  row: number; // rang continu dans la grille (0 = haut), peut être fractionnaire
}

/** Pour un point du tissu (angle φ, abscisse s), la zone et le rang de la grille correspondants. */
export function fabricAt(L: SockLayout, phi: number, s: number): FabricPoint {
  const { cuffRows, legRows, heelRows, footRows, toeRows } = L.input;
  if (s < 0) return { zone: ZONE_RIM, row: 0 };
  if (s < L.sCuffEnd) return { zone: ZONE_CUFF, row: (s / L.sCuffEnd) * cuffRows };
  // Espacement régulier des rangs ; le talon « recouvre » le dos en coin (bords en diagonale),
  // devant la tige et le pied se suivent sans trou.
  const w = heelWeight(phi, L.input.heelSpread);
  const legEnd = lerp(L.frontSplit, L.heelStart, w);
  const footStart = lerp(L.frontSplit, L.heelEnd, w);
  const toeStart = L.sToeStart - 0.004 * L.k;
  const r0 = cuffRows;
  if (s < legEnd) return { zone: ZONE_LEG, row: Math.min(r0 + legRows - 1e-3, r0 + ((s - L.sCuffEnd) / (L.frontSplit - L.sCuffEnd)) * legRows) };
  const r1 = r0 + legRows;
  if (s < footStart) return { zone: ZONE_HEEL, row: r1 + ((s - legEnd) / (footStart - legEnd)) * heelRows };
  const r2 = r1 + heelRows;
  if (s < toeStart) return { zone: ZONE_FOOT, row: Math.max(r2, r2 + ((s - L.frontSplit) / (toeStart - L.frontSplit)) * footRows) };
  const r3 = r2 + footRows;
  return { zone: ZONE_TOE, row: r3 + clamp((s - toeStart) / (L.sTip - toeStart), 0, 1) * toeRows };
}

/** Espacement d'un rang le long de s, par zone (pour le chevron). */
function rowSpacingAt(L: SockLayout, zone: number): number {
  const { cuffRows, legRows, footRows } = L.input;
  if (zone === ZONE_CUFF && cuffRows > 0) return L.sCuffEnd / cuffRows;
  if (zone === ZONE_FOOT || zone === ZONE_TOE) return (L.sToeStart - L.frontSplit) / Math.max(1, footRows);
  if (zone === ZONE_HEEL) return 0;
  return (L.frontSplit - L.sCuffEnd) / Math.max(1, legRows);
}

// ======================================================================================
// 5. Surface
// ======================================================================================

function superE(c: number, p: number) {
  return Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
}

function softFloor(y: number, floor = 0.0035, width = 0.0025) {
  if (y >= floor) return y;
  return floor - width * (1 - Math.exp(-(floor - y) / width));
}

/** Point du tube principal (s ≥ 0). Repère : +X = intérieur (pied droit), +Z = avant, +Y = haut. */
function surfacePoint(L: SockLayout, phi: number, s: number, out: Float64Array) {
  const r = ringAt(L, s);
  const k = L.k;
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const back = sn > 0;
  const p = back ? r.pBack : r.pFront;
  const cz = (r.bz + r.fz) / 2;
  const cy = (r.by + r.fy) / 2;
  let dz = r.fz - r.bz;
  let dy = r.fy - r.by;
  const h = Math.hypot(dz, dy) / 2;
  if (h > 1e-9) {
    dz /= 2 * h;
    dy /= 2 * h;
  } else {
    dz = 1;
    dy = 0;
  }
  let depth = h * superE(sn, p); // > 0 : vers l'arrière / la semelle
  const width = (c >= 0 ? r.med : r.lat) * superE(c, p);

  // plis du tissu au pli de la cheville, devant
  if (!back) {
    const env = Math.exp(-(((s - L.frontSplit) / (0.014 * k)) ** 2));
    const wav = Math.sin(((s - L.frontSplit) / (0.008 * k)) * TAU + c * 1.3);
    depth -= 0.0008 * k * env * Math.pow(-sn, 3) * (0.6 + 0.4 * wav);
  }

  let px = r.xc + width;
  let pz = cz - depth * dz;
  let py = cy - depth * dy;

  // malléoles : reliefs discrets (externe plus basse et plus en arrière que l'interne)
  const yAbs = cy / k;
  const latBump = Math.exp(-(((yAbs - 0.073) / 0.011) ** 2)) * Math.exp(-(((phi - Math.PI * 0.93) / 0.35) ** 2));
  const medBump = Math.exp(-(((yAbs - 0.085) / 0.011) ** 2)) * Math.exp(-(((Math.min(phi, TAU - phi) - 0.1) / 0.35) ** 2));
  px += (medBump - latBump) * 0.0032 * k * (1 - r.footness * 0.7);

  // bord-côte : côtes verticales
  if (s < L.sCuffEnd) {
    const rib = Math.cos((phi * L.input.needles) / (2 * L.input.ribWidth));
    const amp = 0.0005 * k;
    const rx = px - r.xc;
    const rd = depth;
    const n = Math.hypot(rx, rd) || 1;
    px += (rx / n) * amp * rib;
    pz -= (rd / n) * amp * rib * dz;
    py -= (rd / n) * amp * rib * dy;
  }

  py = softFloor(py);
  if (L.input.side === 'gauche') px = -px;
  out[0] = px;
  out[1] = py;
  out[2] = pz;
}

/** Ourlet : s < 0 → bord roulé vers l'intérieur puis paroi intérieure. */
function rimPoint(L: SockLayout, phi: number, s: number, out: Float64Array) {
  const top = new Float64Array(3);
  surfacePoint(L, phi, 0, top);
  const r0 = L.rings[0]!;
  const cx = L.input.side === 'gauche' ? -r0.xc : r0.xc;
  const cz = (r0.bz + r0.fz) / 2;
  let dx = top[0]! - cx;
  let dz = top[2]! - cz;
  const r = Math.hypot(dx, dz) || 1;
  dx /= r;
  dz /= r;
  const rho = 0.0022 * L.k;
  const rollLen = Math.PI * rho;
  const d = -s;
  let radial: number;
  let y: number;
  if (d <= rollLen) {
    const beta = d / rho;
    radial = r - rho + rho * Math.cos(beta);
    y = top[1]! + rho * Math.sin(beta);
  } else {
    // paroi intérieure : suit la surface extérieure à la même profondeur, décalée vers l'intérieur
    // (sinon elle traverse le tissu là où la jambe s'affine sous l'ourlet)
    const below = new Float64Array(3);
    surfacePoint(L, phi, d - rollLen, below);
    const rb = ringAt(L, d - rollLen);
    const bcx = L.input.side === 'gauche' ? -rb.xc : rb.xc;
    const bcz = (rb.bz + rb.fz) / 2;
    let ex = below[0]! - bcx;
    let ez = below[2]! - bcz;
    const rr = Math.hypot(ex, ez) || 1;
    ex /= rr;
    ez /= rr;
    out[0] = below[0]! - ex * 2 * rho;
    out[1] = below[1]!;
    out[2] = below[2]! - ez * 2 * rho;
    return;
  }
  out[0] = cx + dx * radial;
  out[1] = y;
  out[2] = cz + dz * radial;
}

function pointAt(L: SockLayout, phi: number, s: number, out: Float64Array) {
  if (s < 0) rimPoint(L, phi, s, out);
  else surfacePoint(L, phi, s, out);
}

function ringStations(L: SockLayout): number[] {
  const st: number[] = [];
  const k = L.k;
  const push = (a: number, b: number, step: number) => {
    const n = Math.max(1, Math.round((b - a) / step));
    for (let i = 0; i < n; i++) st.push(a + ((b - a) * i) / n);
  };
  push(L.sMin, 0, 0.0012 * k);
  push(0, L.sBendStart - 0.02 * k, 0.0014 * k);
  push(L.sBendStart - 0.02 * k, L.sBendEnd + 0.02 * k, 0.0008 * k);
  push(L.sBendEnd + 0.02 * k, L.sToeStart, 0.0014 * k);
  // pointe : resserré vers le bout
  const n = 50;
  for (let i = 0; i < n; i++) st.push(L.sToeStart + (L.sTip - L.sToeStart) * Math.sin(((i / n) * Math.PI) / 2));
  st.push(L.sTip);
  return st;
}

export interface SockMeshData {
  segments: number;
  rings: number;
  positions: Float32Array;
  normals: Float32Array;
  uvAtlas: Float32Array;
  uvStitch: Float32Array;
  knitMask: Float32Array;
  atlasPerRow: Float32Array;
  indices: Uint32Array;
}

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
      uvAtlas[v * 2 + 1] = 1 - (s - L.sMin) / span;
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

  const normals = computeGridNormals(positions, cols, rings, segments, L);

  const indices = new Uint32Array((cols - 1) * (rings - 1) * 6);
  let o = 0;
  const flip = L.input.side === 'gauche';
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (!flip) indices.set([a, c, b, b, c, d], o);
      else indices.set([a, b, c, b, d, c], o);
      o += 6;
    }
  }
  return { segments, rings, positions, normals, uvAtlas, uvStitch, knitMask, atlasPerRow, indices };
}

/** Normales lisses calculées sur la grille paramétrique (couture et pointe gérées). */
function computeGridNormals(pos: Float32Array, cols: number, rings: number, segments: number, L: SockLayout): Float32Array {
  const nrm = new Float32Array(pos.length);
  const P = (i: number, j: number, c: number) => pos[(j * cols + (((i % segments) + segments) % segments)) * 3 + c]!;
  const poles: number[] = [];
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
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      const v = (j * cols + i) * 3;
      if (len < 1e-14) {
        poles.push(v);
        continue;
      }
      nrm[v] = nx / len;
      nrm[v + 1] = ny / len;
      nrm[v + 2] = nz / len;
    }
  }
  // orientation : vers l'extérieur sur la tige (loin de l'axe de la jambe)
  const jRef = Math.floor(rings * 0.25);
  const r0 = L.rings[0]!;
  const axZ = (r0.bz + r0.fz) / 2;
  let score = 0;
  for (let i = 0; i < segments; i += 5) {
    const v = (jRef * cols + i) * 3;
    score += pos[v]! * nrm[v]! + (pos[v + 2]! - axZ) * nrm[v + 2]!;
  }
  if (score < 0) for (let q = 0; q < nrm.length; q++) nrm[q] = -nrm[q]!;
  // pointe : moyenne des normales de l'anneau précédent
  for (const v of poles) {
    const j = Math.floor(v / 3 / cols);
    let ax = 0, ay = 0, az = 0;
    for (let q = 0; q < segments; q++) {
      const w = ((j - 1) * cols + q) * 3;
      ax += nrm[w]!;
      ay += nrm[w + 1]!;
      az += nrm[w + 2]!;
    }
    const l = Math.hypot(ax, ay, az) || 1;
    nrm[v] = ax / l;
    nrm[v + 1] = ay / l;
    nrm[v + 2] = az / l;
  }
  return nrm;
}
