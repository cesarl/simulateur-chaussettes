/**
 * Composition libre — calcul PUR (aucune dépendance au DOM ni à Three.js).
 *
 * Deuxième « source de motif » à côté du calepinage : des images (SVG de la bibliothèque, ou PNG/SVG
 * importés et enregistrés dans le projet) posées librement sur la chaussette déroulée, avec position,
 * rotation, taille, miroir, ordre des calques, et un fond.
 *
 * Repère : la zone motif déroulée (tige, puis pied si le motif continue sur le pied).
 *  - x en MAILLES (0..W, W = aiguilles), circulaire : ce qui dépasse à droite revient à gauche ;
 *  - y en RANGS de motif (0 = premier rang de la tige, sous le bord-côte).
 * Les calculs géométriques (rotation, proportions) se font en millimètres réels grâce à la jauge,
 * pour qu'une image tournée ou carrée ne soit pas déformée par des mailles plus larges que hautes.
 */

export type Hex = string;

/** Référence d'image : collection, embarquée dans le projet, ou bibliothèque publique. */
export type AssetRef =
  | { kind: 'collection'; collectionId: string; variation: string } // ex. { 'medina', 'VAR2' }
  | { kind: 'embarquee'; assetId: string }
  | { kind: 'bibliotheque'; imageId: string };

/** Image embarquée dans le fichier projet (jamais envoyée sur un serveur). */
export interface EmbeddedAsset {
  id: string;
  name: string;
  mime: 'image/svg+xml' | 'image/png';
  /** SVG : texte brut. PNG : data URL base64. */
  data: string;
  width: number;
  height: number;
}

export interface Layer {
  id: string;
  asset: AssetRef;
  /** Centre du calque (mailles, rangs de motif). */
  x: number;
  y: number;
  /** Largeur de l'image en mailles (la hauteur suit les proportions réelles de l'image). */
  widthStitches: number;
  /** Rotation libre en degrés, sens horaire. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** Répéter le calque tout autour de la jambe (frise) avec cet écart en mailles ; null = pas de répétition. */
  repeatAroundGap: number | null;
  hidden: boolean;
  locked: boolean;
}

export interface Composition {
  background: Hex;
  /** Du dessous vers le dessus. */
  layers: Layer[];
}

export const EMPTY_COMPOSITION: Composition = { background: '#f1e9dc', layers: [] };

export function assetKey(ref: AssetRef): string {
  if (ref.kind === 'collection') return `c:${ref.collectionId}/${ref.variation}`;
  if (ref.kind === 'bibliotheque') return `b:${ref.imageId}`;
  return `e:${ref.assetId}`;
}

/** Image pixelisée prête à échantillonner (SVG recoloré ou PNG décodé). Alpha < 128 = transparent. */
export interface RasterImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray | Uint8Array;
}

export interface Gauge {
  needles: number; // W
  rows: number; // H = rangs de motif
  stitchesPerCm: number;
  rowsPerCm: number;
}

// ------------------------------------------------------------------ géométrie d'un calque
export interface LayerFrame {
  cx: number; // centre en mailles
  cy: number; // centre en rangs
  halfW: number; // demi-largeur en mm
  halfH: number; // demi-hauteur en mm
  cos: number;
  sin: number;
  sx: number; // mm par maille
  sy: number; // mm par rang
}

export function layerFrame(layer: Layer, img: { width: number; height: number }, g: Gauge): LayerFrame {
  const sx = 10 / g.stitchesPerCm;
  const sy = 10 / g.rowsPerCm;
  const wMm = layer.widthStitches * sx;
  const hMm = (wMm * img.height) / Math.max(1, img.width);
  const a = (layer.rotation * Math.PI) / 180;
  return { cx: layer.x, cy: layer.y, halfW: wMm / 2, halfH: hMm / 2, cos: Math.cos(a), sin: Math.sin(a), sx, sy };
}

/** Écart horizontal circulaire ramené dans [-W/2, W/2). */
function wrapDx(dx: number, W: number): number {
  return ((((dx + W / 2) % W) + W) % W) - W / 2;
}

/**
 * Point (mailles, rangs) → coordonnées normalisées (u, v ∈ [0,1]) dans l'image du calque, ou null si
 * le point est hors de l'image. Gère le tour circulaire, la rotation (en mm réels) et les miroirs.
 */
export function toLayerUV(f: LayerFrame, layer: Layer, x: number, y: number, W: number): [number, number] | null {
  let dx = wrapDx(x - f.cx, W);
  if (layer.repeatAroundGap !== null) {
    const period = (f.halfW * 2) / f.sx + Math.max(0, layer.repeatAroundGap);
    dx = ((((dx + period / 2) % period) + period) % period) - period / 2;
  }
  const px = dx * f.sx;
  const py = (y - f.cy) * f.sy;
  // rotation inverse (sens horaire en affichage, y vers le bas)
  const lx = px * f.cos + py * f.sin;
  const ly = -px * f.sin + py * f.cos;
  if (Math.abs(lx) > f.halfW || Math.abs(ly) > f.halfH) return null;
  let u = (lx + f.halfW) / (2 * f.halfW);
  let v = (ly + f.halfH) / (2 * f.halfH);
  if (layer.flipX) u = 1 - u;
  if (layer.flipY) v = 1 - v;
  return [Math.min(0.999999, u), Math.min(0.999999, v)];
}

// ------------------------------------------------------------------ rendu en mailles
export interface RenderResult {
  rgb: Uint8ClampedArray; // W × H × 3
  /** Index du calque visible par maille (-1 = fond) : sert à la sélection et aux statistiques. */
  owner: Int16Array;
}

function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/**
 * Couleur de chaque maille de la zone motif. Chaque maille est sur-échantillonnée (n × n) et prend la
 * couleur majoritaire : bords nets, pas de demi-teintes (jacquard). Transparence PNG : alpha < 128 = vide.
 */
export function renderComposition(
  comp: Composition,
  images: Map<string, RasterImage>,
  g: Gauge,
  supersample = 3,
): RenderResult {
  const W = g.needles;
  const H = g.rows;
  const rgb = new Uint8ClampedArray(W * H * 3);
  const owner = new Int16Array(W * H).fill(-1);
  const bg = hexRgb(comp.background);
  const visible = comp.layers
    .map((l, i) => ({ l, i, img: images.get(assetKey(l.asset)) }))
    .filter((x): x is { l: Layer; i: number; img: RasterImage } => !x.l.hidden && !!x.img);
  const frames = visible.map((v) => layerFrame(v.l, v.img, g));
  const n = Math.max(1, supersample);
  const votes = new Map<number, number>();
  const ownerVotes = new Map<number, number>();

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      votes.clear();
      ownerVotes.clear();
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const sx = x + (i + 0.5) / n;
          const sy = y + (j + 0.5) / n;
          let c: [number, number, number] = bg;
          let who = -1;
          // du dessus vers le dessous : le premier pixel opaque gagne
          for (let k = visible.length - 1; k >= 0; k--) {
            const v = visible[k]!;
            const uv = toLayerUV(frames[k]!, v.l, sx, sy, W);
            if (!uv) continue;
            const px = Math.floor(uv[0] * v.img.width);
            const py = Math.floor(uv[1] * v.img.height);
            const o = (py * v.img.width + px) * 4;
            if (v.img.rgba[o + 3]! < 128) continue;
            c = [v.img.rgba[o]!, v.img.rgba[o + 1]!, v.img.rgba[o + 2]!];
            who = v.i;
            break;
          }
          const key = (c[0] << 16) | (c[1] << 8) | c[2];
          votes.set(key, (votes.get(key) ?? 0) + 1);
          ownerVotes.set(who, (ownerVotes.get(who) ?? 0) + 1);
        }
      }
      let best = 0, bn = -1;
      for (const [k, cnt] of votes) if (cnt > bn) { best = k; bn = cnt; }
      let bo = -1, bon = -1;
      for (const [k, cnt] of ownerVotes) if (cnt > bon) { bo = k; bon = cnt; }
      const o = (y * W + x) * 3;
      rgb[o] = (best >> 16) & 255;
      rgb[o + 1] = (best >> 8) & 255;
      rgb[o + 2] = best & 255;
      owner[y * W + x] = bo;
    }
  }
  return { rgb, owner };
}

// ------------------------------------------------------------------ édition
/** Calque sous le point (mailles, rangs), du dessus vers le dessous ; ignore les calques cachés ou verrouillés. */
export function hitTest(comp: Composition, images: Map<string, { width: number; height: number }>, g: Gauge, x: number, y: number): string | null {
  for (let k = comp.layers.length - 1; k >= 0; k--) {
    const l = comp.layers[k]!;
    const img = images.get(assetKey(l.asset));
    if (!img || l.hidden || l.locked) continue;
    if (toLayerUV(layerFrame(l, img, g), l, x, y, g.needles)) return l.id;
  }
  return null;
}

/** Coins du calque (mailles, rangs), dans l'ordre HG, HD, BD, BG — pour dessiner le cadre et les poignées. */
export function layerCorners(l: Layer, img: { width: number; height: number }, g: Gauge): Array<[number, number]> {
  const f = layerFrame(l, img, g);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => {
    const lx = a * f.halfW;
    const ly = b * f.halfH;
    const px = lx * f.cos - ly * f.sin;
    const py = lx * f.sin + ly * f.cos;
    return [f.cx + px / f.sx, f.cy + py / f.sy] as [number, number];
  });
}

/** Nouveau calque centré, largeur par défaut = 1/4 du tour, au-dessus des autres. */
export function addLayer(comp: Composition, asset: AssetRef, g: Gauge, id: string): Composition {
  const layer: Layer = {
    id,
    asset,
    x: (g.needles * 3) / 4, // milieu du devant (convention : colonne 3W/4 = devant)
    y: g.rows / 4,
    widthStitches: Math.round(g.needles / 4),
    rotation: 0,
    flipX: false,
    flipY: false,
    repeatAroundGap: null,
    hidden: false,
    locked: false,
  };
  return { ...comp, layers: [...comp.layers, layer] };
}

export function updateLayer(comp: Composition, id: string, patch: Partial<Layer>): Composition {
  return { ...comp, layers: comp.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

export function moveLayer(comp: Composition, id: string, dir: 'monter' | 'descendre' | 'dessus' | 'dessous'): Composition {
  const i = comp.layers.findIndex((l) => l.id === id);
  if (i < 0) return comp;
  const layers = [...comp.layers];
  const [l] = layers.splice(i, 1);
  const j = dir === 'monter' ? Math.min(layers.length, i + 1) : dir === 'descendre' ? Math.max(0, i - 1) : dir === 'dessus' ? layers.length : 0;
  layers.splice(j, 0, l!);
  return { ...comp, layers };
}

/** Images embarquées réellement utilisées (pour ne pas alourdir le fichier projet avec des images supprimées). */
export function usedEmbeddedAssets(comp: Composition, assets: EmbeddedAsset[]): EmbeddedAsset[] {
  const used = new Set(comp.layers.filter((l) => l.asset.kind === 'embarquee').map((l) => (l.asset as { assetId: string }).assetId));
  return assets.filter((a) => used.has(a.id));
}

/** Le lien de partage n'est possible que si aucune image embarquée n'est utilisée. */
export function isLinkShareable(comp: Composition): boolean {
  return comp.layers.every((l) => l.asset.kind === 'collection' || l.asset.kind === 'bibliotheque');
}
