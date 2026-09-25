/**
 * Moteur de calepinage multi-motifs — calcul PUR (aucune dépendance au DOM ni à Three.js).
 *
 * Deux sources de calepinage :
 *  1. PRÉRÉGLAGES au format du configurateur de carreaux de César (`config/calepinages.json`) :
 *     un bloc de `block_size = [colonnes, rangées]` cases ; chaque case indique le motif (1..N ou "any")
 *     et la rotation (0/90/180/270 ou "random"). Le bloc se répète sur toute la chaussette.
 *  2. CALEPINAGES GÉNÉRÉS : ordre des motifs (unique, à la suite, aléatoire…) × rotation
 *     (aucune, fixe, +90° à chaque carreau, aléatoire, rosace, miroir…).
 * Dans les deux cas : appareillage droit ou en quinconce, rotation globale, graine pour l'aléatoire.
 *
 * Conventions :
 *  - case (cx, cy) : cx vers la droite (tour de la jambe), cy vers le bas (du haut de la chaussette vers le pied) ;
 *  - rotation dans le sens des aiguilles d'une montre (comme `transform: rotate()` en CSS) ;
 *  - motifs numérotés à partir de 0 dans ce module (le JSON commence à 1) ;
 *  - l'aléatoire dépend seulement de (case, graine) : changer un autre réglage ne rebat pas les cartes ;
 *  - raccord : quand la largeur de la répétition divise le tour, l'aléatoire boucle aussi sur le tour
 *    (la colonne `tilesAround` = colonne 0) → pas de couture visible au dos.
 */

export type Rot = 0 | 90 | 180 | 270;

export interface Placement {
  tile: number; // index du motif (0-based)
  rot: Rot;
  flipX: boolean;
  flipY: boolean;
}

// ======================================================================================
// Préréglages
// ======================================================================================

export interface PresetCell {
  tile: number | 'any';
  rot: Rot | 'random';
}

export interface Preset {
  id: string;
  nom: string;
  famille: string;
  blockW: number;
  blockH: number;
  cells: PresetCell[]; // blockW × blockH, rangée par rangée
  /** Nombre de motifs différents attendus (plus grand numéro utilisé). 0 si seulement "any". */
  tilesUsed: number;
  aleatoire: boolean;
}

export interface NormalizeResult {
  presets: Preset[];
  warnings: string[];
}

function normRot(v: unknown, where: string, warnings: string[]): Rot | 'random' {
  if (v === 'random') return 'random';
  let n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) {
    warnings.push(`${where} : rotation « ${String(v)} » illisible → 0°`);
    return 0;
  }
  if (n > 360 && n % 10 === 0 && (n / 10) % 90 === 0) {
    warnings.push(`${where} : rotation ${n} lue comme ${n / 10}° (faute de frappe probable)`);
    n = n / 10;
  }
  let r = ((Math.round(n / 90) * 90) % 360 + 360) % 360;
  if (n % 90 !== 0) warnings.push(`${where} : rotation ${n} arrondie à ${r}°`);
  if (r !== 0 && r !== 90 && r !== 180 && r !== 270) r = 0;
  return r as Rot;
}

function famille(id: string): string {
  const s = id.toLowerCase();
  if (s.startsWith('ophis')) return 'Ophis';
  if (s.startsWith('iflip')) return 'Damier iflip';
  if (s.startsWith('damier') && s.endsWith('random')) return 'Damier, rotation aléatoire';
  if (s.startsWith('damier')) return 'Damier';
  if (s.startsWith('aleatoire')) return 'Aléatoire';
  if (s.startsWith('liane')) return 'Lianes';
  if (s.startsWith('rosace')) return 'Rosaces';
  return 'Compositions';
}

/** Lit le JSON du configurateur (tableau de préréglages), corrige les petites anomalies et les signale. */
export function normalizePresets(raw: unknown): NormalizeResult {
  const warnings: string[] = [];
  const presets: Preset[] = [];
  if (!Array.isArray(raw)) return { presets, warnings: ['Le fichier de calepinages doit être un tableau.'] };
  const seen = new Set<string>();
  for (const item of raw as Array<Record<string, unknown>>) {
    const id = String(item.id ?? '').trim();
    const nom = String(item.nom ?? id);
    const bs = item.block_size as unknown;
    const matrix = item.matrix as unknown;
    if (!id || !Array.isArray(bs) || !Array.isArray(matrix)) {
      warnings.push(`Préréglage ignoré (format invalide) : ${id || '(sans id)'}`);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`${id} : identifiant en double, ignoré`);
      continue;
    }
    seen.add(id);
    let blockW = Math.max(1, Math.round(Number(bs[0])));
    let blockH = Math.max(1, Math.round(Number(bs[1])));
    const cellsRaw = matrix as Array<Record<string, unknown>>;
    const maxX = Math.max(...cellsRaw.map((c) => Number(c.x)));
    const maxY = Math.max(...cellsRaw.map((c) => Number(c.y)));
    if (maxX >= blockW || maxY >= blockH) {
      warnings.push(`${id} : des cases dépassent le bloc ${blockW}×${blockH} → bloc agrandi à ${Math.max(blockW, maxX + 1)}×${Math.max(blockH, maxY + 1)}`);
      blockW = Math.max(blockW, maxX + 1);
      blockH = Math.max(blockH, maxY + 1);
    }
    const cells: Array<PresetCell | undefined> = new Array(blockW * blockH);
    let tilesUsed = 0;
    let aleatoire = false;
    for (const c of cellsRaw) {
      const x = Math.round(Number(c.x));
      const y = Math.round(Number(c.y));
      const where = `${id} (${x},${y})`;
      let tile: number | 'any';
      if (c.tile === 'any' || c.tile === 'random') {
        tile = 'any';
        aleatoire = true;
      } else {
        const t = Math.round(Number(c.tile));
        if (!Number.isFinite(t) || t < 1) {
          warnings.push(`${where} : motif « ${String(c.tile)} » illisible → motif 1`);
          tile = 0;
        } else {
          tile = t - 1;
          tilesUsed = Math.max(tilesUsed, t);
        }
      }
      const rot = normRot(c.rot, where, warnings);
      if (rot === 'random') aleatoire = true;
      cells[y * blockW + x] = { tile, rot };
    }
    let missing = 0;
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) {
        cells[i] = { tile: 0, rot: 0 };
        missing++;
      }
    }
    if (missing) warnings.push(`${id} : ${missing} case(s) manquante(s) → motif 1 sans rotation`);
    presets.push({ id, nom, famille: famille(id), blockW, blockH, cells: cells as PresetCell[], tilesUsed, aleatoire });
  }
  return { presets, warnings };
}

// ======================================================================================
// Calepinages générés
// ======================================================================================

export type Ordre = 'unique' | 'suite' | 'aleatoire' | 'aleatoire-sans-voisin';
export type ModeRotation = 'aucune' | 'fixe' | 'suite-90' | 'aleatoire-90' | 'aleatoire-180' | 'rosace' | 'miroir';
export type Appareil = 'droit' | 'quinconce-h' | 'quinconce-v';

export interface GeneratedSpec {
  ordre: Ordre;
  /** Pour « suite » : de combien la séquence avance d'une rangée à la suivante (0 = colonnes, 1 = diagonale). */
  pasRangee: number;
  rotation: ModeRotation;
  rotationFixe: Rot;
}

export interface CalepinageSpec {
  source: 'prereglage' | 'genere';
  presetId: string | null;
  genere: GeneratedSpec;
  appareil: Appareil;
  rotationGlobale: Rot;
  graine: number;
}

export const DEFAULT_CALEPINAGE: CalepinageSpec = {
  source: 'genere',
  presetId: null,
  genere: { ordre: 'suite', pasRangee: 1, rotation: 'aucune', rotationFixe: 0 },
  appareil: 'droit',
  rotationGlobale: 0,
  graine: 1,
};

/** Préréglages « générés » prêts à l'emploi (proposés dans la galerie à côté de ceux du JSON). */
export const GENERATED_PRESETS: Array<{ id: string; nom: string; genere: GeneratedSpec; appareil?: Appareil }> = [
  { id: 'g-unique', nom: 'Un seul motif', genere: { ordre: 'unique', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 } },
  { id: 'g-suite', nom: 'À la suite (diagonale)', genere: { ordre: 'suite', pasRangee: 1, rotation: 'aucune', rotationFixe: 0 } },
  { id: 'g-colonnes', nom: 'À la suite (colonnes)', genere: { ordre: 'suite', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 } },
  { id: 'g-suite-rot90', nom: 'À la suite, +90° à chaque carreau', genere: { ordre: 'suite', pasRangee: 1, rotation: 'suite-90', rotationFixe: 0 } },
  { id: 'g-suite-rotalea', nom: 'À la suite, rotation aléatoire', genere: { ordre: 'suite', pasRangee: 1, rotation: 'aleatoire-90', rotationFixe: 0 } },
  { id: 'g-alea', nom: 'Aléatoire', genere: { ordre: 'aleatoire', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 } },
  { id: 'g-alea-voisins', nom: 'Aléatoire sans voisins identiques', genere: { ordre: 'aleatoire-sans-voisin', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 } },
  { id: 'g-alea-rot', nom: 'Aléatoire, rotation aléatoire', genere: { ordre: 'aleatoire', pasRangee: 0, rotation: 'aleatoire-90', rotationFixe: 0 } },
  { id: 'g-rosace', nom: 'Rosace (4 rotations)', genere: { ordre: 'suite', pasRangee: 1, rotation: 'rosace', rotationFixe: 0 } },
  { id: 'g-miroir', nom: 'Miroirs (4 symétries)', genere: { ordre: 'suite', pasRangee: 1, rotation: 'miroir', rotationFixe: 0 } },
  { id: 'g-quinconce', nom: 'À la suite, en quinconce', genere: { ordre: 'suite', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 }, appareil: 'quinconce-h' },
];

// ======================================================================================
// Hasard déterministe
// ======================================================================================

/** Hachage entier → [0, 1). Ne dépend que des arguments. */
export function hash01(a: number, b: number, seed: number, salt: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const ROTS: Rot[] = [0, 90, 180, 270];
const addRot = (a: Rot, b: Rot): Rot => ((a + b) % 360) as Rot;

// ======================================================================================
// Plan des cases
// ======================================================================================

export interface PlanContext {
  tileCount: number;
  preset?: Preset | null;
  /** Nombre de cases sur le tour quand il est entier (raccord parfait) ; sinon null. */
  tilesAround: number | null;
}

/**
 * Plan des placements pour nx × ny cases (rangée par rangée). La colonne se lit modulo nx :
 * passer nx = tilesAround quand il est entier donne un tour sans couture.
 */
export function planPlacements(spec: CalepinageSpec, ctx: PlanContext, nx: number, ny: number): Placement[] {
  const N = Math.max(1, ctx.tileCount);
  const out: Placement[] = new Array(nx * ny);
  const seed = spec.graine | 0;
  const wrap = ctx.tilesAround !== null && ctx.tilesAround === nx;

  const preset = spec.source === 'prereglage' ? ctx.preset ?? null : null;
  const noNeighbor = !preset && spec.genere.ordre === 'aleatoire-sans-voisin' && spec.genere.rotation !== 'rosace' && spec.genere.rotation !== 'miroir';
  const nnTiles = noNeighbor ? noNeighborTiles(N, nx, ny, seed, wrap) : null;
  for (let cy = 0; cy < ny; cy++) {
    for (let cx = 0; cx < nx; cx++) {
      let p: Placement;
      if (preset) {
        const cell = preset.cells[mod(cy, preset.blockH) * preset.blockW + mod(cx, preset.blockW)]!;
        const tile = cell.tile === 'any' ? Math.floor(hash01(cx, cy, seed, 1) * N) : cell.tile % N;
        const rot = cell.rot === 'random' ? ROTS[Math.floor(hash01(cx, cy, seed, 2) * 4)]! : cell.rot;
        p = { tile, rot, flipX: false, flipY: false };
      } else {
        p = generatedAt(spec.genere, N, cx, cy, seed);
        if (nnTiles) p.tile = nnTiles[cy * nx + cx]!;
      }
      p.rot = addRot(p.rot, spec.rotationGlobale);
      out[cy * nx + cx] = p;
    }
  }
  return out;
}

/**
 * Tirage aléatoire sans deux motifs identiques côte à côte (horizontalement, verticalement, et entre la
 * dernière et la première colonne quand le tour boucle). Rangée par rangée, avec quelques nouveaux
 * tirages de la rangée si elle ne peut pas se refermer. Déterministe (graine).
 */
function noNeighborTiles(N: number, nx: number, ny: number, seed: number, wrap: boolean): number[] {
  const out: number[] = new Array(nx * ny).fill(0);
  for (let cy = 0; cy < ny; cy++) {
    let best: number[] | null = null;
    for (let attempt = 0; attempt < 64 && !best; attempt++) {
      const row: number[] = [];
      let ok = true;
      for (let cx = 0; cx < nx; cx++) {
        const forbid = new Set<number>();
        if (cx > 0) forbid.add(row[cx - 1]!);
        if (cy > 0) forbid.add(out[(cy - 1) * nx + cx]!);
        if (wrap && cx === nx - 1 && nx > 1) forbid.add(row[0]!);
        const pool = [...Array(N).keys()].filter((t) => !forbid.has(t));
        if (!pool.length) {
          ok = false;
          row.push(Math.floor(hash01(cx, cy, seed, 11 + attempt) * N));
          continue;
        }
        row.push(pool[Math.floor(hash01(cx, cy, seed, 11 + attempt) * pool.length)]!);
      }
      if (ok || attempt === 63) best = row;
    }
    for (let cx = 0; cx < nx; cx++) out[cy * nx + cx] = best![cx]!;
  }
  return out;
}

function generatedAt(g: GeneratedSpec, N: number, cx: number, cy: number, seed: number): Placement {
  const grouped = g.rotation === 'rosace' || g.rotation === 'miroir';
  // pour rosace / miroir, un même motif occupe un bloc 2×2
  const bx = grouped ? Math.floor(cx / 2) : cx;
  const by = grouped ? Math.floor(cy / 2) : cy;
  let tile = 0;
  switch (g.ordre) {
    case 'unique':
      tile = 0;
      break;
    case 'suite':
      tile = mod(bx + by * g.pasRangee, N);
      break;
    case 'aleatoire':
      tile = Math.floor(hash01(bx, by, seed, 1) * N);
      break;
    case 'aleatoire-sans-voisin': // calculé rangée par rangée dans noNeighborTiles
      tile = Math.floor(hash01(bx, by, seed, 1) * N);
      break;
  }
  let rot: Rot = 0;
  let flipX = false;
  let flipY = false;
  switch (g.rotation) {
    case 'aucune':
      break;
    case 'fixe':
      rot = g.rotationFixe;
      break;
    case 'suite-90':
      rot = ROTS[mod(cx + cy, 4)]!;
      break;
    case 'aleatoire-90':
      rot = ROTS[Math.floor(hash01(cx, cy, seed, 2) * 4)]!;
      break;
    case 'aleatoire-180':
      rot = hash01(cx, cy, seed, 2) < 0.5 ? 0 : 180;
      break;
    case 'rosace': {
      // même convention que le préréglage « Rosace » du configurateur de carreaux :
      // HG 90°, HD 180°, BG 0°, BD 270° (un motif dessiné dans le coin haut-droit se referme au centre)
      const q = mod(cx, 2) + 2 * mod(cy, 2); // 0 HG, 1 HD, 2 BG, 3 BD
      rot = ([90, 180, 0, 270] as Rot[])[q]!;
      break;
    }
    case 'miroir':
      flipX = mod(cx, 2) === 1;
      flipY = mod(cy, 2) === 1;
      break;
  }
  return { tile, rot, flipX, flipY };
}

// ======================================================================================
// Géométrie : de la maille à la case, et de la case au pixel du motif
// ======================================================================================

export interface TileGeometry {
  needles: number;
  tileStitches: number; // largeur d'un carreau en mailles
  tileRows: number; // hauteur d'un carreau en rangs
  gapStitches: number;
  gapRows: number;
  offsetStitches: number;
  offsetRows: number;
  appareil: Appareil;
}

export interface Raccord {
  /** Nombre de cases sur le tour quand il est entier (sinon null) : sert à boucler l'aléatoire. */
  tilesAround: number | null;
  /** Le motif se raccorde sans couture au dos. */
  seamless: boolean;
  /** Largeur (en mailles) de la répétition complète du calepinage sur le tour. */
  repeatStitches: number;
  /** Explication lisible quand ça ne tombe pas juste. */
  message: string;
}

/** Plus petit commun multiple. */
function lcm(a: number, b: number): number {
  const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
  return (a / g(a, b)) * b;
}

/**
 * Analyse du raccord circulaire : la répétition horizontale du calepinage doit diviser le tour.
 * Période en cases : bloc du préréglage, nombre de motifs pour « à la suite », 2 pour rosace/miroir,
 * 4 pour « +90° à chaque carreau », 1 pour l'aléatoire (qui boucle alors sur le tour).
 */
export function raccord(geo: TileGeometry, spec: CalepinageSpec, tileCount: number, preset?: Preset | null): Raccord {
  const pitch = geo.tileStitches + geo.gapStitches;
  let period = 1;
  if (spec.source === 'prereglage' && preset) period = preset.blockW;
  else if (spec.source === 'genere') {
    const g = spec.genere;
    const grouped = g.rotation === 'rosace' || g.rotation === 'miroir';
    if (g.ordre === 'suite') period = Math.max(1, tileCount) * (grouped ? 2 : 1);
    if (grouped) period = lcm(period, 2);
    if (g.rotation === 'suite-90') period = lcm(period, 4);
  }
  if (spec.appareil === 'quinconce-v') period = lcm(period, 2);
  const repeatStitches = period * pitch;
  const around = pitch > 0 && geo.needles % pitch === 0 ? geo.needles / pitch : null;
  const seamless = around !== null && around % period === 0;
  let message = 'Le motif se raccorde parfaitement au dos.';
  if (around === null) message = `Un carreau (+ joint) fait ${pitch} mailles : ${geo.needles} aiguilles n'en contiennent pas un nombre entier.`;
  else if (!seamless) message = `${around} carreaux sur le tour, mais le calepinage se répète tous les ${period} carreaux : raccord décalé au dos.`;
  return { tilesAround: around, seamless, repeatStitches, message };
}

/** Largeurs de carreau (en mailles) proches de `target` pour lesquelles le raccord est parfait. */
export function fittingTileWidths(geo: TileGeometry, spec: CalepinageSpec, tileCount: number, preset: Preset | null, target: number, count = 3): number[] {
  const res: Array<[number, number]> = [];
  for (let w = 4; w <= geo.needles; w++) {
    const r = raccord({ ...geo, tileStitches: w }, spec, tileCount, preset);
    if (r.seamless) res.push([Math.abs(w - target), w]);
  }
  return res.sort((a, b) => a[0] - b[0]).slice(0, count).map(([, w]) => w);
}

export interface CellHit {
  cx: number;
  cy: number;
  u: number; // position dans la case [0,1) (hors joint)
  v: number;
  gap: boolean; // la maille tombe dans le joint
}

/**
 * Case couverte par le point (x, y) exprimé en mailles (x) et rangs (y), décalages inclus.
 * Quinconce : une rangée sur deux décalée d'une demi-case (ou une colonne sur deux pour « quinconce-v »).
 */
export function cellAtStitch(geo: TileGeometry, x: number, y: number): CellHit {
  const pw = geo.tileStitches + geo.gapStitches;
  const ph = geo.tileRows + geo.gapRows;
  let X = x - geo.offsetStitches;
  let Y = y - geo.offsetRows;
  let cy = Math.floor(Y / ph);
  if (geo.appareil === 'quinconce-h' && mod(cy, 2) === 1) X += pw / 2;
  let cx = Math.floor(X / pw);
  if (geo.appareil === 'quinconce-v') {
    if (mod(cx, 2) === 1) Y += ph / 2;
    cy = Math.floor(Y / ph);
  }
  const lx = X - cx * pw;
  const ly = Y - cy * ph;
  const gap = lx >= geo.tileStitches || ly >= geo.tileRows;
  return { cx, cy, u: Math.min(lx / geo.tileStitches, 0.999999), v: Math.min(ly / geo.tileRows, 0.999999), gap };
}

/**
 * Coordonnées dans l'image du motif (0..1) pour le point (u, v) de la case, selon rotation et miroirs.
 * Rotation horaire : le coin haut-gauche du motif passe en haut-droite à 90°.
 */
export function tileUV(p: Placement, u: number, v: number): [number, number] {
  let a = p.flipX ? 1 - u : u;
  let b = p.flipY ? 1 - v : v;
  switch (p.rot) {
    case 90:
      [a, b] = [b, 1 - a];
      break;
    case 180:
      [a, b] = [1 - a, 1 - b];
      break;
    case 270:
      [a, b] = [1 - b, a];
      break;
  }
  return [a, b];
}
