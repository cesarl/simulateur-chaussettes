/**
 * V7 — Modèle unifié en CALQUES (calcul PUR : ni DOM, ni Three.js).
 *
 * Une chaussette = une pile de calques, du dessous vers le dessus :
 *   0. « Fond » (toujours en bas, une couleur, ne se cache pas, ne se déplace pas) ;
 *   1…n. calques « Motif » (carreaux + calepinage : collection et couleurs, ou carreaux importés ;
 *        sur toute la surface ou limités à une bande de rangs) et calques « Image » (PNG / SVG posés
 *        librement : position, rotation, taille, miroir, frise).
 * Chaque calque peut être caché, réordonné, et rendre certaines de ses couleurs transparentes
 * (ex. le blanc d'un motif jaune et blanc laisse voir le calque du dessous).
 *
 * Tout le reste de la chaîne est inchangé : le résultat est un tableau RVB de la zone motif
 * (aiguilles × rangs de motif × 3), exactement comme `samplePattern` / `renderComposition`,
 * puis quantize → composeGrid → 3D / exports.
 *
 * Garanties (testées) :
 *  - un projet « carreaux » V1 migré (Fond + 1 Motif) donne EXACTEMENT la même grille ;
 *  - une composition V6 migrée (Fond + Images) donne EXACTEMENT les mêmes couleurs ;
 *  - les liens `#p=1.` déjà partagés s'ouvrent à l'identique (défauts V1 figés : v1ShareDefaults.json).
 *
 * À placer dans `src/core/layers.ts` (et `src/core/v1ShareDefaults.json`) en corrigeant les imports.
 */

import type { Preset } from './calepinage';
import { tileRowsFor, tileWidthForCount, seamColumn } from './calepinage';
import type { ZoneColors } from './collections';
import {
  assetKey,
  layerCorners,
  layerFrame,
  toLayerUV,
  type AssetRef,
  type Gauge,
  type Layer as ImagePlacement,
  type RasterImage,
} from './composition';
import { motifRows, samplePattern } from './layout';
import { rowRanges } from './grid';
import type {
  DecorSettings,
  Hex,
  LayoutSettings,
  QuantizeSettings,
  SockDesign,
  SockDimensions,
  TileAsset,
  ZoneSettings,
} from './types';
import V1_SHARE_DEFAULTS_JSON from './v1ShareDefaults.json';

// =================================================================== types
/** Réglages de calepinage d'un calque Motif (les carreaux viennent de `source`, pas de `tileIds`). */
export type MotifLayout = Omit<LayoutSettings, 'tileIds'>;

interface BaseLayer {
  id: string;
  /** Nom affiché dans la liste des calques. */
  name: string;
  hidden: boolean;
  locked: boolean;
  /** Couleurs du calque rendues transparentes (choisies parmi `layerKeyColors`). */
  transparentColors: Hex[];
}

export interface FondLayer extends BaseLayer {
  kind: 'fond';
  color: Hex;
}

export type MotifSource =
  /** Carreaux d'une collection (catalogue synchronisé ou « Mes collections »), recolorés. */
  | { kind: 'collection'; collectionId: string; colors: ZoneColors; paletteId: string | null }
  /** Carreaux importés à la main (PNG / SVG), par id de TileAsset. */
  | { kind: 'importes'; tileIds: string[] };

/** Étendue d'un calque Motif : toute la zone motif, ou une bande de rangs [fromRow, toRow). */
export type MotifBounds = { kind: 'tout' } | { kind: 'bande'; fromRow: number; toRow: number };

export interface MotifLayer extends BaseLayer {
  kind: 'motif';
  source: MotifSource;
  layout: MotifLayout;
  bounds: MotifBounds;
}

export interface ImageLayer extends BaseLayer {
  kind: 'image';
  asset: AssetRef;
  /** Centre (mailles, rangs de motif). */
  x: number;
  y: number;
  widthStitches: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  repeatAroundGap: number | null;
  /**
   * V8 — remplacement de couleurs : couleur principale de l'image → couleur de fil (nuancier).
   * Absent ou vide = image telle quelle. Quand il y a au moins un remplacement, chaque pixel est
   * d'abord rattaché à la couleur principale la plus proche (image « aplatie », idéale en jacquard).
   */
  recolor?: Record<Hex, Hex>;
}

export type StackLayer = FondLayer | MotifLayer | ImageLayer;

/** Modèle V2 (V7) : les calques remplacent layout / pattern / collection active. */
export interface SockDesignV2 {
  version: 2;
  name: string;
  dimensions: SockDimensions;
  zones: ZoneSettings;
  quantize: QuantizeSettings;
  decor: DecorSettings;
  /** Du dessous vers le dessus ; layers[0] est TOUJOURS le Fond. */
  layers: StackLayer[];
}

export const DEFAULT_FOND_COLOR: Hex = '#f1e9dc';

// =================================================================== fabrique
function base(id: string, name: string): BaseLayer {
  return { id, name, hidden: false, locked: false, transparentColors: [] };
}

export function newFondLayer(color: Hex = DEFAULT_FOND_COLOR): FondLayer {
  return { ...base('fond', 'Fond'), kind: 'fond', color };
}

export function newMotifLayer(id: string, source: MotifSource, layout: MotifLayout, name = 'Motif'): MotifLayer {
  return { ...base(id, name), kind: 'motif', source, layout: structuredClone(layout), bounds: { kind: 'tout' } };
}

/** Nouvelle image centrée sur le devant, largeur 1/4 du tour (mêmes règles que la composition V6). */
export function newImageLayer(id: string, asset: AssetRef, g: Gauge, name = 'Image'): ImageLayer {
  return {
    ...base(id, name),
    kind: 'image',
    asset,
    x: (g.needles * 3) / 4,
    y: g.rows / 4,
    widthStitches: Math.round(g.needles / 4),
    rotation: 0,
    flipX: false,
    flipY: false,
    repeatAroundGap: null,
  };
}

/** Identifiant libre pour un nouveau calque (`motif-2`, `image-3`…). */
export function nextLayerId(layers: readonly StackLayer[], prefix: 'motif' | 'image'): string {
  const used = new Set(layers.map((l) => l.id));
  for (let i = 1; ; i++) if (!used.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

// =================================================================== invariants et édition
/**
 * Remet la pile en ordre : exactement un Fond, en bas, jamais caché ; ids uniques
 * (les doublons sont renommés). À appeler après toute lecture de fichier ou de lien.
 */
export function normalizeStack(layers: readonly StackLayer[]): StackLayer[] {
  const fonds = layers.filter((l): l is FondLayer => l.kind === 'fond');
  const fond: FondLayer = fonds[0] ? { ...fonds[0], hidden: false, id: 'fond' } : newFondLayer();
  const rest = layers.filter((l) => l.kind !== 'fond');
  const used = new Set<string>(['fond']);
  const out: StackLayer[] = [fond];
  for (const l of rest) {
    let id = l.id;
    if (!id || used.has(id)) id = nextLayerId([...out, ...rest.filter((r) => r !== l)], l.kind as 'motif' | 'image');
    used.add(id);
    out.push({ ...l, id });
  }
  return out;
}

export function updateStackLayer<T extends StackLayer>(layers: readonly StackLayer[], id: string, patch: Partial<T>): StackLayer[] {
  return layers.map((l) => (l.id === id ? ({ ...l, ...patch, kind: l.kind, id: l.id } as StackLayer) : l));
}

/** Ajoute au-dessus de tout. */
export function addStackLayer(layers: readonly StackLayer[], layer: MotifLayer | ImageLayer): StackLayer[] {
  return normalizeStack([...layers, layer]);
}

/** Supprime un calque (le Fond ne se supprime pas). */
export function removeStackLayer(layers: readonly StackLayer[], id: string): StackLayer[] {
  return layers.filter((l) => l.id !== id || l.kind === 'fond');
}

export function duplicateStackLayer(layers: readonly StackLayer[], id: string): StackLayer[] {
  const i = layers.findIndex((l) => l.id === id);
  const l = layers[i];
  if (!l || l.kind === 'fond') return [...layers];
  const copy = { ...structuredClone(l), id: nextLayerId(layers, l.kind), name: `${l.name} (copie)` } as StackLayer;
  const out = [...layers];
  out.splice(i + 1, 0, copy);
  return out;
}

/**
 * Change l'ordre. `toIndex` = position visée dans la pile (1 = juste au-dessus du Fond).
 * Le Fond reste en 0 quoi qu'on demande.
 */
export function moveStackLayer(layers: readonly StackLayer[], id: string, dir: 'monter' | 'descendre' | 'dessus' | 'dessous' | number): StackLayer[] {
  const i = layers.findIndex((l) => l.id === id);
  if (i <= 0) return [...layers];
  const out = [...layers];
  const [l] = out.splice(i, 1);
  const last = out.length;
  const j =
    typeof dir === 'number'
      ? Math.round(dir)
      : dir === 'monter'
        ? i + 1
        : dir === 'descendre'
          ? i - 1
          : dir === 'dessus'
            ? last
            : 1;
  out.splice(Math.min(last, Math.max(1, j)), 0, l!);
  return out;
}

/** Premier calque Motif visible (du dessous) : sert au décor « comme la chaussette » et au nom par défaut. */
export function primaryMotifLayer(layers: readonly StackLayer[]): MotifLayer | null {
  return (layers.find((l) => l.kind === 'motif' && !l.hidden) as MotifLayer | undefined) ?? null;
}

// =================================================================== géométrie commune
export function stackGauge(dims: SockDimensions, zones: ZoneSettings): Gauge {
  return { needles: dims.needles, rows: motifRows(dims, zones), stitchesPerCm: dims.stitchesPerCm, rowsPerCm: dims.rowsPerCm };
}

/** Vue « placement » d'un calque Image, pour réutiliser layerFrame / toLayerUV / layerCorners de V6. */
export function imagePlacement(l: ImageLayer): ImagePlacement {
  return {
    id: l.id,
    asset: l.asset,
    x: l.x,
    y: l.y,
    widthStitches: l.widthStitches,
    rotation: l.rotation,
    flipX: l.flipX,
    flipY: l.flipY,
    repeatAroundGap: l.repeatAroundGap,
    hidden: l.hidden,
    locked: l.locked,
  };
}

// =================================================================== pixels d'un calque Motif
/**
 * RVB plein cadre d'un calque Motif (sans la bande ni la transparence : elles sont appliquées à
 * l'empilement). `tiles` = carreaux déjà rasterisés de ce calque, dans l'ordre (motif 1, 2…).
 * Mettre en cache côté application : ne recalculer que si layout, carreaux, dimensions ou zones changent.
 */
export function motifLayerRgb(
  layer: MotifLayer,
  tiles: readonly TileAsset[],
  dims: SockDimensions,
  zones: ZoneSettings,
  sampling: QuantizeSettings['sampling'],
  presets: readonly Preset[],
): Uint8ClampedArray | null {
  if (tiles.length === 0) return null;
  return samplePattern(tiles, { ...layer.layout, tileIds: tiles.map((t) => t.id) }, dims, zones, sampling, presets);
}

// =================================================================== couleurs d'un calque
function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbHex(r: number, g: number, b: number): Hex {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Couleurs principales d'un tableau de pixels (RVB : channels 3, RVBA : channels 4, pixels alpha < 128 ignorés).
 * Garde les couleurs d'au moins `minShare` des pixels (défaut 0,5 %), au plus `max`, de la plus fréquente
 * à la moins fréquente. Ce sont les pastilles « rendre transparent » proposées à l'utilisateur.
 */
export function dominantColors(px: ArrayLike<number>, channels: 3 | 4, opts: { minShare?: number; max?: number } = {}): Hex[] {
  const counts = new Map<number, number>();
  let total = 0;
  for (let i = 0; i + channels - 1 < px.length; i += channels) {
    if (channels === 4 && px[i + 3]! < 128) continue;
    const k = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    total++;
  }
  const min = Math.max(1, (opts.minShare ?? 0.005) * total);
  return [...counts.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, opts.max ?? 16)
    .map(([k]) => rgbHex((k >> 16) & 255, (k >> 8) & 255, k & 255));
}

/**
 * Test « cette couleur est-elle transparente ? » : chaque pixel est rattaché à la couleur principale
 * la plus proche (les pixels d'anticrénelage suivent leur couleur), puis on regarde si celle-ci est
 * dans `transparent`. Résultat mis en cache par couleur.
 */
export function transparencyTest(keyColors: readonly Hex[], transparent: readonly Hex[]): ((r: number, g: number, b: number) => boolean) | null {
  const t = new Set(transparent.map((h) => h.toLowerCase()));
  if (t.size === 0) return null;
  const keys = keyColors.map((h) => ({ rgb: hexRgb(h), transparent: t.has(h.toLowerCase()) }));
  for (const h of t) if (!keyColors.some((k) => k.toLowerCase() === h)) keys.push({ rgb: hexRgb(h), transparent: true });
  const cache = new Map<number, boolean>();
  return (r, g, b) => {
    const k = (r << 16) | (g << 8) | b;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    let best = Infinity;
    let res = false;
    for (const c of keys) {
      const d = (c.rgb[0] - r) ** 2 + (c.rgb[1] - g) ** 2 + (c.rgb[2] - b) ** 2;
      if (d < best) {
        best = d;
        res = c.transparent;
      }
    }
    cache.set(k, res);
    return res;
  };
}

// =================================================================== empilement
export interface StackRenderInput {
  layers: readonly StackLayer[];
  gauge: Gauge;
  /** RVB plein cadre de chaque calque Motif (id → motifLayerRgb). Absent = calque ignoré. */
  motifRgb: ReadonlyMap<string, Uint8ClampedArray>;
  /** Images pixelisées, par assetKey. Absente = calque ignoré (chargement en cours). */
  images: ReadonlyMap<string, RasterImage>;
  /** Couleurs principales par calque (sinon calculées). Pour une collection : les couleurs de fil. */
  keyColors?: ReadonlyMap<string, readonly Hex[]>;
  /** Sur-échantillonnage des bords d'images (3 = comme la composition V6). */
  supersample?: number;
}

export interface StackRenderResult {
  rgb: Uint8ClampedArray;
  /** Index dans `layers` du calque visible à chaque maille (0 = Fond) : sélection au clic, statistiques. */
  owner: Int16Array;
}

type Prepared =
  | { kind: 'motif'; index: number; rgb: Uint8ClampedArray; from: number; to: number; isT: ((r: number, g: number, b: number) => boolean) | null }
  | { kind: 'image'; index: number; layer: ImagePlacement; img: RasterImage; frame: ReturnType<typeof layerFrame>; opaque: Uint8Array; rgba: ArrayLike<number> };

/**
 * Pixels « prêts » d'une image (masque d'opacité + couleurs remplacées), mis en cache par image et
 * par réglages : pendant un glisser, on ne refait pas ce travail à chaque mouvement de souris.
 */
const imagePixelCache = new WeakMap<RasterImage, Map<string, { opaque: Uint8Array; rgba: ArrayLike<number> }>>();

/** Nettoie une table de remplacement (clés/valeurs en minuscules, entrées identiques retirées). */
export function cleanRecolor(recolor: Record<Hex, Hex> | undefined): Record<Hex, Hex> {
  const out: Record<Hex, Hex> = {};
  for (const [k, v] of Object.entries(recolor ?? {})) {
    const a = k.toLowerCase();
    const b = String(v).toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(a) && /^#[0-9a-f]{6}$/.test(b) && a !== b) out[a] = b;
  }
  return out;
}

/** Associe chaque couleur à la couleur principale la plus proche (cache par couleur). */
function nearestKey(keyColors: readonly Hex[]): (r: number, g: number, b: number) => Hex | null {
  const keys = keyColors.map((h) => ({ h: h.toLowerCase(), rgb: hexRgb(h) }));
  const cache = new Map<number, Hex | null>();
  return (r, g, b) => {
    const k = (r << 16) | (g << 8) | b;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    let best = Infinity;
    let res: Hex | null = null;
    for (const c of keys) {
      const d = (c.rgb[0] - r) ** 2 + (c.rgb[1] - g) ** 2 + (c.rgb[2] - b) ** 2;
      if (d < best) {
        best = d;
        res = c.h;
      }
    }
    cache.set(k, res);
    return res;
  };
}

function imagePixels(
  img: RasterImage,
  keyColors: readonly Hex[],
  transparent: readonly Hex[],
  recolor: Record<Hex, Hex>,
): { opaque: Uint8Array; rgba: ArrayLike<number> } {
  const sig = `${keyColors.join(',')}|${[...transparent].map((h) => h.toLowerCase()).sort().join(',')}|${JSON.stringify(recolor)}`;
  let perImage = imagePixelCache.get(img);
  if (!perImage) imagePixelCache.set(img, (perImage = new Map()));
  const hit = perImage.get(sig);
  if (hit) return hit;
  const isT = transparent.length ? transparencyTest(keyColors, transparent) : null;
  const doRecolor = Object.keys(recolor).length > 0;
  const snap = doRecolor ? nearestKey(keyColors) : null;
  const opaque = new Uint8Array(img.width * img.height);
  const rgba = doRecolor ? new Uint8ClampedArray(img.rgba) : img.rgba;
  for (let p = 0, o = 0; p < opaque.length; p++, o += 4) {
    const r = img.rgba[o]!, g = img.rgba[o + 1]!, b = img.rgba[o + 2]!;
    opaque[p] = img.rgba[o + 3]! >= 128 && !(isT && isT(r, g, b)) ? 1 : 0;
    if (snap && opaque[p]) {
      const k = snap(r, g, b);
      const target = k ? (recolor[k] ?? k) : null;
      if (target) {
        const [tr, tg, tb] = hexRgb(target);
        (rgba as Uint8ClampedArray)[o] = tr;
        (rgba as Uint8ClampedArray)[o + 1] = tg;
        (rgba as Uint8ClampedArray)[o + 2] = tb;
      }
    }
  }
  const res = { opaque, rgba };
  if (perImage.size > 16) perImage.clear();
  perImage.set(sig, res);
  return res;
}

/** Couleurs principales d'un calque (pour les pastilles « rendre transparent » et la palette). */
export function layerKeyColors(layer: StackLayer, input: Pick<StackRenderInput, 'motifRgb' | 'images' | 'keyColors'>): Hex[] {
  const given = input.keyColors?.get(layer.id);
  if (given) return [...given];
  if (layer.kind === 'fond') return [layer.color];
  if (layer.kind === 'motif') {
    const rgb = input.motifRgb.get(layer.id);
    return rgb ? dominantColors(rgb, 3) : [];
  }
  const img = input.images.get(assetKey(layer.asset));
  return img ? dominantColors(img.rgba, 4) : [];
}

function prepare(input: StackRenderInput): Prepared[] {
  const { layers, gauge } = input;
  const out: Prepared[] = [];
  for (let index = 1; index < layers.length; index++) {
    const l = layers[index]!;
    if (l.hidden) continue;
    if (l.kind === 'motif') {
      const isT = l.transparentColors.length ? transparencyTest(layerKeyColors(l, input), l.transparentColors) : null;
      const rgb = input.motifRgb.get(l.id);
      if (!rgb || rgb.length < gauge.needles * gauge.rows * 3) continue;
      const from = l.bounds.kind === 'bande' ? Math.max(0, Math.round(Math.min(l.bounds.fromRow, l.bounds.toRow))) : 0;
      const to = l.bounds.kind === 'bande' ? Math.min(gauge.rows, Math.round(Math.max(l.bounds.fromRow, l.bounds.toRow))) : gauge.rows;
      if (to <= from) continue;
      out.push({ kind: 'motif', index, rgb, from, to, isT });
    } else if (l.kind === 'image') {
      const img = input.images.get(assetKey(l.asset));
      if (!img) continue;
      const recolor = cleanRecolor(l.recolor);
      const needKeys = l.transparentColors.length > 0 || Object.keys(recolor).length > 0;
      const { opaque, rgba } = imagePixels(img, needKeys ? layerKeyColors(l, input) : [], l.transparentColors, recolor);
      const placement = imagePlacement(l);
      out.push({ kind: 'image', index, layer: placement, img, frame: layerFrame(placement, img, gauge), opaque, rgba });
    }
  }
  return out.reverse(); // du dessus vers le dessous
}

/**
 * Couleur de chaque maille de la zone motif. Du dessus vers le dessous, le premier calque « plein »
 * gagne (hors bande, pixel alpha < 128 ou couleur transparente = on regarde dessous) ; le Fond est
 * toujours plein. Quand des images sont visibles, chaque maille est sur-échantillonnée (n × n) et
 * prend la couleur majoritaire (bords nets, jacquard), exactement comme la composition V6.
 */
export interface RenderStackOptions {
  /**
   * V8 — ne recalculer que les rangs [début, fin) (glisser d'une image : seuls les rangs touchés
   * changent). Le reste du résultat est pris dans `into`, qui est modifié en place et renvoyé.
   * Résultat identique, octet pour octet, à un rendu complet (testé).
   */
  rows?: [number, number];
  into?: StackRenderResult;
}

export function renderStack(input: StackRenderInput, opts: RenderStackOptions = {}): StackRenderResult {
  const { gauge } = input;
  const W = gauge.needles;
  const H = gauge.rows;
  const reuse = opts.into && opts.into.rgb.length === Math.max(0, W * H * 3) && opts.into.owner.length === Math.max(0, W * H);
  const rgb = reuse ? opts.into!.rgb : new Uint8ClampedArray(Math.max(0, W * H * 3));
  const owner = reuse ? opts.into!.owner : new Int16Array(Math.max(0, W * H));
  if (W < 1 || H < 1) return { rgb, owner };
  const y0 = reuse && opts.rows ? Math.max(0, Math.floor(opts.rows[0])) : 0;
  const y1 = reuse && opts.rows ? Math.min(H, Math.ceil(opts.rows[1])) : H;
  const fondLayer = input.layers[0];
  const fond = hexRgb(fondLayer?.kind === 'fond' ? fondLayer.color : DEFAULT_FOND_COLOR);
  const fondKey = (fond[0] << 16) | (fond[1] << 8) | fond[2];
  const stack = prepare(input);
  const n = stack.some((p) => p.kind === 'image') ? Math.max(1, input.supersample ?? 3) : 1;
  const votes = new Map<number, number>();
  const ownerVotes = new Map<number, number>();

  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const m = (y * W + x) * 3;
      // Contribution constante des calques Motif (par maille), calculée une fois.
      votes.clear();
      ownerVotes.clear();
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const sx = x + (i + 0.5) / n;
          const sy = y + (j + 0.5) / n;
          let key = fondKey;
          let who = 0;
          for (const p of stack) {
            if (p.kind === 'motif') {
              if (y < p.from || y >= p.to) continue;
              const r = p.rgb[m]!, g = p.rgb[m + 1]!, b = p.rgb[m + 2]!;
              if (p.isT && p.isT(r, g, b)) continue;
              key = (r << 16) | (g << 8) | b;
              who = p.index;
              break;
            }
            const uv = toLayerUV(p.frame, p.layer, sx, sy, W);
            if (!uv) continue;
            const px = Math.floor(uv[0] * p.img.width);
            const py = Math.floor(uv[1] * p.img.height);
            const q = py * p.img.width + px;
            if (!p.opaque[q]) continue;
            const o = q * 4;
            key = (p.rgba[o]! << 16) | (p.rgba[o + 1]! << 8) | p.rgba[o + 2]!;
            who = p.index;
            break;
          }
          votes.set(key, (votes.get(key) ?? 0) + 1);
          ownerVotes.set(who, (ownerVotes.get(who) ?? 0) + 1);
        }
      }
      let best = 0, bn = -1;
      for (const [k, c] of votes) if (c > bn) { best = k; bn = c; }
      let bo = 0, bon = -1;
      for (const [k, c] of ownerVotes) if (c > bon) { bo = k; bon = c; }
      rgb[m] = (best >> 16) & 255;
      rgb[m + 1] = (best >> 8) & 255;
      rgb[m + 2] = best & 255;
      owner[y * W + x] = bo;
    }
  }
  return { rgb, owner };
}

/** Calque visible sous une maille (clic dans la vue 2D) ; null hors zone. Les calques verrouillés renvoient quand même leur id. */
export function layerAtStitch(layers: readonly StackLayer[], owner: Int16Array, W: number, x: number, y: number): string | null {
  const xi = ((Math.floor(x) % W) + W) % W;
  const yi = Math.floor(y);
  const H = owner.length / W;
  if (yi < 0 || yi >= H) return null;
  return layers[owner[yi * W + xi]!]?.id ?? null;
}

/**
 * Palette suggérée pour la pile : Fond, puis les couleurs non transparentes de chaque calque visible,
 * du dessous vers le dessus, sans doublon, en ne gardant que celles réellement visibles dans `rgb`
 * (si fourni). Au-delà du maximum de couleurs de la machine, l'interface prévient.
 */
export function suggestStackPalette(input: Omit<StackRenderInput, 'gauge'>, rendered?: Uint8ClampedArray): Hex[] {
  const seen = new Set<string>();
  const visible = rendered ? new Set(dominantColors(rendered, 3, { minShare: 0 , max: 4096 })) : null;
  const out: Hex[] = [];
  for (const l of input.layers) {
    if (l.hidden && l.kind !== 'fond') continue;
    const t = new Set(l.transparentColors.map((h) => h.toLowerCase()));
    for (const c of layerKeyColors(l, input)) {
      const h = c.toLowerCase();
      if (t.has(h) || seen.has(h) || (visible && !visible.has(h))) continue;
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}

// =================================================================== poignées (gizmo) — Image
export type ImageHandle = 'deplacer' | 'tourner' | 'echelle';

export interface ImageGizmo {
  corners: Array<[number, number]>; // HG, HD, BD, BG (mailles, rangs)
  center: [number, number];
  /** Poignée de rotation : au-dessus du milieu du bord haut, à 12 % de la hauteur de l'image (min 6 rangs). */
  rotate: [number, number];
}

export function imageGizmo(l: ImageLayer, img: { width: number; height: number }, g: Gauge): ImageGizmo {
  const p = imagePlacement(l);
  const corners = layerCorners(p, img, g);
  const f = layerFrame(p, img, g);
  const off = Math.max(6 * f.sy, f.halfH * 2 * 0.12) + f.halfH; // mm depuis le centre
  // vecteur « haut » de l'image, tourné (sens horaire), en mm → mailles/rangs
  const ux = off * f.sin;
  const uy = -off * f.cos;
  return { corners, center: [l.x, l.y], rotate: [l.x + ux / f.sx, l.y + uy / f.sy] };
}

function wrapDx(dx: number, W: number): number {
  return ((((dx + W / 2) % W) + W) % W) - W / 2;
}

/**
 * Effet d'un glisser de souris sur une poignée (coordonnées en mailles / rangs, depuis le début du
 * glisser). Renvoie le patch à appliquer au calque TEL QU'IL ÉTAIT au début du glisser.
 *  - deplacer : translation (tour circulaire en x) ;
 *  - tourner : angle autour du centre, en mm réels ; `snapDeg` (ex. 15 avec Maj) arrondit ;
 *  - echelle : rapport des distances au centre, en mm réels (proportions gardées), largeur ≥ 2 mailles.
 */
export function dragImage(
  start: ImageLayer,
  g: Gauge,
  handle: ImageHandle,
  from: [number, number],
  to: [number, number],
  opts: { snapDeg?: number } = {},
): Partial<ImageLayer> {
  const W = g.needles;
  const sx = 10 / g.stitchesPerCm;
  const sy = 10 / g.rowsPerCm;
  if (handle === 'deplacer') {
    const x = start.x + wrapDx(to[0] - from[0], W);
    return { x: ((x % W) + W) % W, y: start.y + (to[1] - from[1]) };
  }
  const v = (p: [number, number]): [number, number] => [wrapDx(p[0] - start.x, W) * sx, (p[1] - start.y) * sy];
  const a = v(from);
  const b = v(to);
  if (handle === 'tourner') {
    const delta = ((Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0])) * 180) / Math.PI;
    let rot = start.rotation + delta;
    if (opts.snapDeg) rot = Math.round(rot / opts.snapDeg) * opts.snapDeg;
    rot = ((rot % 360) + 360) % 360;
    return { rotation: Math.round(rot * 10) / 10 };
  }
  const da = Math.hypot(a[0], a[1]);
  const db = Math.hypot(b[0], b[1]);
  if (da < 1e-6) return {};
  return { widthStitches: Math.max(2, Math.round(start.widthStitches * (db / da) * 10) / 10) };
}

// =================================================================== poignées (gizmo) — Motif
export interface MotifGizmo {
  /** Rectangle d'UN carreau de référence (le coin haut-gauche suit le décalage), mailles / rangs. */
  tile: { x: number; y: number; w: number; h: number };
  /** Bande occupée par le calque (toute la hauteur si « tout »). */
  band: { from: number; to: number };
}

export function motifGizmo(l: MotifLayer, g: Gauge): MotifGizmo {
  const L = l.layout;
  const pitchX = L.tileStitches + L.gapStitches;
  const pitchY = L.tileRows + L.gapRows;
  const x0 = L.offsetStitches + seamColumn(L.seam, g.needles);
  const band = l.bounds.kind === 'bande' ? { from: l.bounds.fromRow, to: l.bounds.toRow } : { from: 0, to: g.rows };
  // carreau de référence : celui qui contient le haut de la bande, au plus près du devant (3W/4)
  const front = (3 * g.needles) / 4;
  const kx = Math.round((front - x0) / pitchX - 0.5);
  const ky = Math.floor((band.from - L.offsetRows) / pitchY);
  return { tile: { x: x0 + kx * pitchX, y: L.offsetRows + ky * pitchY, w: L.tileStitches, h: L.tileRows }, band };
}

/** Glisser le motif : décale le calepinage (le raccord reste à sa position choisie). Valeurs réduites à une période. */
export function dragMotif(start: MotifLayer, d: [number, number]): Partial<MotifLayer> {
  const L = start.layout;
  const px = L.tileStitches + L.gapStitches;
  const py = L.tileRows + L.gapRows;
  const red = (v: number, p: number) => (p > 0 ? Math.round((((v % p) + p) % p) * 10) / 10 : v);
  return { layout: { ...L, offsetStitches: red(L.offsetStitches + d[0], px), offsetRows: red(L.offsetRows + d[1], py) } };
}

/**
 * Agrandir / réduire le motif d'un facteur (poignée d'angle du carreau de référence).
 * Mode « carreaux sur le tour » : on garde un nombre ENTIER de carreaux sur le tour (2 à 12) → le
 * raccord tombe toujours juste. Mode libre : largeur × facteur (fractions admises), hauteur au rapport.
 */
export function scaleMotif(start: MotifLayer, factor: number, g: Gauge): Partial<MotifLayer> {
  const L = start.layout;
  if (!(factor > 0)) return {};
  if (L.tileSizeMode === 'around') {
    const n = Math.min(12, Math.max(2, Math.round(L.tilesAround / factor)));
    const tileStitches = tileWidthForCount(g.needles, n, L.gapStitches);
    const tileRows = Math.max(1, Math.round(tileRowsFor(tileStitches, g.stitchesPerCm, g.rowsPerCm)));
    return { layout: { ...L, tilesAround: n, tileStitches, tileRows } };
  }
  const tileStitches = Math.max(2, Math.round(L.tileStitches * factor * 10) / 10);
  const tileRows = Math.max(1, Math.round((L.tileRows * tileStitches) / L.tileStitches));
  return { layout: { ...L, tileStitches, tileRows } };
}

/** Règle la bande (poignées haut / bas) ; bornée à la zone motif, au moins 1 rang. `null` = toute la surface. */
export function setMotifBand(rows: number, band: { from: number; to: number } | null): MotifBounds {
  if (!band) return { kind: 'tout' };
  const a = Math.max(0, Math.min(rows - 1, Math.round(Math.min(band.from, band.to))));
  const b = Math.max(a + 1, Math.min(rows, Math.round(Math.max(band.from, band.to))));
  return a === 0 && b === rows ? { kind: 'tout' } : { kind: 'bande', fromRow: a, toRow: b };
}

// =================================================================== migration V1 → V2
export interface V1Context {
  /** Collection active du projet / lien V1 (null = carreaux importés). */
  collectionId: string | null;
  zoneColors: ZoneColors | null;
  paletteOptionId: string | null;
  /** Ids des carreaux importés (si pas de collection). */
  tileIds: string[];
}

/**
 * Projet ou lien V1 → V2, sans perte :
 *  - mode carreaux : Fond + UN calque Motif « tout » reprenant le calepinage à l'identique ;
 *  - mode composition (V6) : Fond (couleur de fond) + un calque Image par image, même ordre.
 */
export function migrateDesignV1(d: SockDesign, ctx: V1Context): SockDesignV2 {
  const common = {
    version: 2 as const,
    name: d.name,
    dimensions: structuredClone(d.dimensions),
    zones: structuredClone(d.zones),
    quantize: structuredClone(d.quantize),
    decor: structuredClone(d.decor),
  };
  if (d.pattern?.kind === 'composition') {
    const c = d.pattern.composition;
    const layers: StackLayer[] = [
      newFondLayer(c.background),
      ...c.layers.map(
        (l, i): ImageLayer => ({
          kind: 'image',
          id: l.id || `image-${i + 1}`,
          name: l.asset.kind === 'collection' ? `${l.asset.collectionId} ${l.asset.variation}` : `Image ${i + 1}`,
          hidden: l.hidden,
          locked: l.locked,
          transparentColors: [],
          asset: structuredClone(l.asset),
          x: l.x,
          y: l.y,
          widthStitches: l.widthStitches,
          rotation: l.rotation,
          flipX: l.flipX,
          flipY: l.flipY,
          repeatAroundGap: l.repeatAroundGap,
        }),
      ),
    ];
    return { ...common, layers: normalizeStack(layers) };
  }
  const { tileIds: _t, ...layout } = d.layout;
  const source: MotifSource = ctx.collectionId
    ? { kind: 'collection', collectionId: ctx.collectionId, colors: { ...(ctx.zoneColors ?? {}) }, paletteId: ctx.paletteOptionId }
    : { kind: 'importes', tileIds: [...(ctx.tileIds.length ? ctx.tileIds : d.layout.tileIds)] };
  // V8 : le pied uni prend la couleur du Fond (plus de « couleur du pied » séparée). Le Motif couvre
  // toute la tige, donc le Fond n'y est jamais visible : lui donner la couleur du pied est sans perte.
  const fondColor = !d.zones.patternOnFoot
    ? d.zones.footColor
    : d.quantize.paletteMode === 'manuelle' && d.quantize.palette[0]
      ? d.quantize.palette[0]
      : DEFAULT_FOND_COLOR;
  return {
    ...common,
    layers: [newFondLayer(fondColor), newMotifLayer('motif-1', source, layout, ctx.collectionId ? collectionLabel(ctx.collectionId) : 'Motif 1')],
  };
}

function collectionLabel(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : 'Motif';
}

/**
 * Lien `#p=1.` : `json` = résultat de decodeShare(hash, V1_SHARE_DEFAULTS) (défauts V1 FIGÉS, jamais les
 * défauts courants). Donne le design V2 et les carreaux SVG éventuellement embarqués dans le lien.
 */
export function v1ShareJsonToV2(json: unknown): { design: SockDesignV2; collectionId: string | null } {
  const r = (json ?? {}) as Record<string, any>;
  const col = (r.collection ?? {}) as { id?: unknown; colors?: unknown; paletteId?: unknown };
  const collectionId = typeof col.id === 'string' && col.id ? col.id : null;
  const colors =
    col.colors && typeof col.colors === 'object'
      ? (Object.fromEntries(Object.entries(col.colors as object).filter(([, v]) => typeof v === 'string')) as ZoneColors)
      : {};
  const v1: SockDesign = {
    version: 1,
    name: typeof r.name === 'string' ? r.name : 'modele',
    layout: { ...r.layout, tileIds: [] },
    dimensions: r.dimensions,
    zones: r.zones,
    quantize: r.quantize,
    decor: r.decor,
    pattern: r.pattern?.kind === 'composition' ? r.pattern : { kind: 'carreaux' },
  };
  const design = migrateDesignV1(v1, {
    collectionId,
    zoneColors: colors,
    paletteOptionId: typeof col.paletteId === 'string' ? col.paletteId : null,
    tileIds: [],
  });
  return { design, collectionId };
}

// =================================================================== lien de partage V2 (compact)
/**
 * Défauts FIGÉS. Un lien ne stocke que ce qui diffère des défauts : si ces défauts changeaient, les
 * liens déjà partagés changeraient de sens. Donc :
 *  - lien V1 : fusion sur `V1_SHARE_DEFAULTS` (copie exacte des défauts de l'application V1–V6) ;
 *  - lien V2 : fusion sur `shareDefaultsV2()`, construits à partir des mêmes valeurs figées.
 * On peut changer librement `defaultDesign()` de l'application ; JAMAIS ces valeurs. Si un jour il
 * le faut, créer une version 3 du lien.
 */
export const V1_SHARE_DEFAULTS = V1_SHARE_DEFAULTS_JSON as unknown as J;

const V1 = V1_SHARE_DEFAULTS_JSON as unknown as { name: string; layout: LayoutSettings; dimensions: SockDimensions; zones: ZoneSettings; quantize: QuantizeSettings; decor: DecorSettings };

/** Calepinage de référence des gabarits de calques Motif (figé). */
export const TEMPLATE_LAYOUT: MotifLayout = (() => {
  const { tileIds: _t, ...l } = { ...structuredClone(V1.layout), tileIds: [] as string[] };
  return l;
})();

function frozenDefaultsV2(): SockDesignV2 {
  return {
    version: 2,
    name: V1.name,
    dimensions: structuredClone(V1.dimensions),
    zones: structuredClone(V1.zones),
    quantize: structuredClone(V1.quantize),
    decor: structuredClone(V1.decor),
    layers: [newFondLayer()],
  };
}

export function shareDefaultsV2(): J {
  return designV2ToShareJson(frozenDefaultsV2());
}

/** Défauts à passer à decodeShare selon la version du lien. */
export function shareDefaultsFor(version: number): J {
  return version === 1 ? structuredClone(V1_SHARE_DEFAULTS) : shareDefaultsV2();
}

/** JSON fusionné (sortie de decodeShare) → design V2, quelle que soit la version du lien. */
export function designFromShare(version: number, json: unknown): { design: SockDesignV2; fromV1: boolean } {
  if (version === 1) return { design: v1ShareJsonToV2(json).design, fromV1: true };
  return { design: shareJsonToDesignV2(json), fromV1: false };
}

/** Gabarits : dans le lien, chaque calque n'enregistre que ce qui diffère de son gabarit. */
export function layerTemplate(kind: StackLayer['kind']): StackLayer {
  if (kind === 'fond') return newFondLayer();
  if (kind === 'motif') return newMotifLayer('', { kind: 'collection', collectionId: '', colors: {}, paletteId: null }, TEMPLATE_LAYOUT, '');
  return {
    ...base('', ''),
    kind: 'image',
    asset: { kind: 'collection', collectionId: '', variation: 'VAR1' },
    x: 0,
    y: 0,
    widthStitches: 42,
    rotation: 0,
    flipX: false,
    flipY: false,
    repeatAroundGap: null,
  };
}

type J = null | boolean | number | string | J[] | { [k: string]: J };
const isObj = (v: unknown): v is Record<string, J> => typeof v === 'object' && v !== null && !Array.isArray(v);

function diffJ(value: J, baseV: J): J | undefined {
  if (isObj(value) && isObj(baseV)) {
    const out: Record<string, J> = {};
    for (const k of Object.keys(value)) {
      const d = diffJ(value[k]!, baseV[k] as J);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return JSON.stringify(value) === JSON.stringify(baseV) ? undefined : value;
}
function mergeJ(baseV: J, patch: J | undefined): J {
  if (patch === undefined) return structuredClone(baseV);
  if (isObj(baseV) && isObj(patch)) {
    const out: Record<string, J> = structuredClone(baseV);
    for (const k of Object.keys(patch)) out[k] = mergeJ(baseV[k] as J, patch[k]);
    return out;
  }
  return structuredClone(patch);
}

/** Calques → forme compacte `{k:'m', …diff}` (k : f = fond, m = motif, i = image). */
export function packLayers(layers: readonly StackLayer[]): J[] {
  return layers.map((l) => {
    const d = diffJ(JSON.parse(JSON.stringify(l)) as J, JSON.parse(JSON.stringify(layerTemplate(l.kind))) as J);
    const o = isObj(d) ? d : {};
    delete o.kind;
    if (isObj(o.recolor) && Object.keys(o.recolor).length === 0) delete o.recolor;
    // la source d'un motif est une union : on la garde entière pour ne pas mélanger les champs
    if (l.kind === 'motif') o.source = JSON.parse(JSON.stringify(l.source)) as J;
    // idem pour l'image d'un calque Image (union collection / embarquée / bibliothèque)
    if (l.kind === 'image') o.asset = JSON.parse(JSON.stringify(l.asset)) as J;
    return { k: l.kind[0]!, ...o };
  });
}

export function unpackLayers(packed: unknown): StackLayer[] {
  if (!Array.isArray(packed)) return [newFondLayer()];
  const kinds: Record<string, StackLayer['kind']> = { f: 'fond', m: 'motif', i: 'image' };
  const out: StackLayer[] = [];
  for (const raw of packed) {
    if (!isObj(raw)) continue;
    const kind = kinds[String(raw.k)];
    if (!kind) continue;
    const { k: _k, ...rest } = raw;
    const l = mergeJ(JSON.parse(JSON.stringify(layerTemplate(kind))) as J, rest) as unknown as StackLayer;
    if (l.kind === 'motif') l.source = cleanSource(l.source);
    if (l.kind === 'image') l.asset = cleanAsset((rest as { asset?: unknown }).asset ?? l.asset);
    out.push({ ...l, kind } as StackLayer);
  }
  return normalizeStack(out);
}

function cleanAsset(a: unknown): AssetRef {
  const r = (isObj(a) ? a : {}) as Record<string, J>;
  if (r.kind === 'embarquee') return { kind: 'embarquee', assetId: String(r.assetId ?? '') };
  if (r.kind === 'bibliotheque') // V8 : le type 'bibliotheque' est ajouté à AssetRef en T64 (retirer alors ce transtypage).
    return { kind: 'bibliotheque', imageId: String(r.imageId ?? '') } as unknown as AssetRef;
  return { kind: 'collection', collectionId: String(r.collectionId ?? ''), variation: String(r.variation ?? 'VAR1') };
}

function cleanSource(s: MotifSource): MotifSource {
  if (s && s.kind === 'importes') return { kind: 'importes', tileIds: Array.isArray(s.tileIds) ? s.tileIds.map(String) : [] };
  const c = (s ?? {}) as Partial<Extract<MotifSource, { kind: 'collection' }>>;
  return { kind: 'collection', collectionId: String(c.collectionId ?? ''), colors: { ...(c.colors ?? {}) }, paletteId: c.paletteId ?? null };
}

/** Design V2 → JSON du lien (les calques en forme compacte). À diffuser contre `defaultShareJsonV2`. */
export function designV2ToShareJson(d: SockDesignV2): J {
  return JSON.parse(
    JSON.stringify({
      version: 2,
      name: d.name,
      dimensions: d.dimensions,
      zones: d.zones,
      quantize: d.quantize,
      decor: d.decor,
      layers: packLayers(d.layers),
    }),
  ) as J;
}

export function shareJsonToDesignV2(json: unknown): SockDesignV2 {
  const defaults = frozenDefaultsV2();
  const r = isObj(json) ? json : {};
  const pick = <T>(k: string, fallback: T): T => (isObj(r[k]) ? (mergeJ(JSON.parse(JSON.stringify(fallback)) as J, r[k]) as T) : structuredClone(fallback));
  return {
    version: 2,
    name: typeof r.name === 'string' ? r.name : defaults.name,
    dimensions: pick('dimensions', defaults.dimensions),
    zones: pick('zones', defaults.zones),
    quantize: pick('quantize', defaults.quantize),
    decor: pick('decor', defaults.decor),
    layers: Array.isArray(r.layers) ? unpackLayers(r.layers) : structuredClone(defaults.layers),
  };
}

// =================================================================== V8 — repères de la vue à plat
/**
 * Rang de motif (0 = premier rang sous le bord-côte, comme `y` des calques) → rang de la grille
 * complète. Les rangs de motif SAUTENT le talon : les rangs ≥ legRows sont sur le pied.
 * (Bug V7 : la vue 2D ajoutait seulement le bord-côte → cadre décalé de la hauteur du talon.)
 */
export function motifRowToGridRow(dims: SockDimensions, zones: ZoneSettings, motifRow: number): number {
  const r = rowRanges(dims, zones);
  const leg = r.leg.end - r.leg.start;
  return motifRow < leg ? r.leg.start + motifRow : r.foot.start + (motifRow - leg);
}

/** Rang de la grille → rang de motif ; null hors zone motif (bord-côte, talon, pointe, pied sans motif). */
export function gridRowToMotifRow(dims: SockDimensions, zones: ZoneSettings, gridRow: number): number | null {
  const r = rowRanges(dims, zones);
  if (gridRow >= r.leg.start && gridRow < r.leg.end) return gridRow - r.leg.start;
  if (zones.patternOnFoot && gridRow >= r.foot.start && gridRow < r.foot.end) return r.leg.end - r.leg.start + (gridRow - r.foot.start);
  return null;
}

/**
 * Même conversion pour une coordonnée continue (poignées, coins d'un cadre tourné) : en dessous de
 * la tige, on ajoute la hauteur du talon. Un cadre à cheval sur le talon est donc « coupé » à
 * l'affichage exactement comme l'image l'est dans la grille.
 */
export function motifYToGridY(dims: SockDimensions, zones: ZoneSettings, motifY: number): number {
  const r = rowRanges(dims, zones);
  const leg = r.leg.end - r.leg.start;
  return motifY < leg ? r.leg.start + motifY : r.foot.start + (motifY - leg);
}

export function gridYToMotifY(dims: SockDimensions, zones: ZoneSettings, gridY: number): number {
  const r = rowRanges(dims, zones);
  const leg = r.leg.end - r.leg.start;
  if (gridY < r.leg.end) return gridY - r.leg.start;
  if (gridY < r.foot.start) return leg; // sur le talon : collé au premier rang du pied
  return leg + (gridY - r.foot.start);
}

/** Centres des quatre faces (colonnes), pour les repères verticaux de la vue 2D. */
export function faceGuides(needles: number): Array<{ col: number; label: 'Intérieur' | 'Dos' | 'Extérieur' | 'Devant' }> {
  return [
    { col: 0, label: 'Intérieur' },
    { col: needles / 4, label: 'Dos' },
    { col: needles / 2, label: 'Extérieur' },
    { col: (3 * needles) / 4, label: 'Devant' },
  ];
}

// =================================================================== V8 — glisser fluide
/**
 * Rangs à recalculer quand une image passe de `before` à `after` (union des deux cadres, arrondie
 * vers l'extérieur, + 1 rang de marge pour le sur-échantillonnage). Frise : mêmes rangs, tout le tour.
 */
export function dirtyRowsForImage(
  before: ImageLayer | null,
  after: ImageLayer | null,
  img: { width: number; height: number },
  g: Gauge,
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const l of [before, after]) {
    if (!l) continue;
    for (const [, y] of layerCorners(imagePlacement(l), img, g)) {
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  if (!Number.isFinite(lo)) return [0, 0];
  return [Math.max(0, Math.floor(lo) - 1), Math.min(g.rows, Math.ceil(hi) + 1)];
}

// =================================================================== V8 — palette : une seule vérité
export type PaletteSource = 'calques' | 'fils-collection' | 'auto' | 'manuelle';

export interface PaletteResolution {
  source: PaletteSource;
  /** Palette imposée à `quantize` (vide en mode « auto » : la réduction choisit). */
  palette: Hex[];
  maxColors: number;
  /** Nombre de couleurs réellement tricotées dans la zone motif (celui que compare le garde-fou). */
  count: number;
  /** Au-delà du maximum de la machine : c'est LE seul critère du bandeau « Réduire à N couleurs ». */
  overLimit: boolean;
  /** Le réglage « Couleurs du motif » a-t-il un sens ? (non en mode « d'après les calques »). */
  showMaxColors: boolean;
}

/**
 * Palette effectivement utilisée par la réduction ET vérifiée par le garde-fou. En V7, le bandeau
 * comptait les couleurs de tous les calques (même cachées sous d'autres calques ou les couleurs
 * d'anticrénelage) alors que la palette appliquée ne gardait que les couleurs visibles : d'où des
 * « Réduire à 6 » avec 6 couleurs ou moins. Ici, les deux viennent du même calcul.
 *
 *  - calques : `suggestStackPalette(…, rendu)` (couleurs visibles, non transparentes) ;
 *  - manuelle : la palette choisie (un choix explicite gagne toujours) ;
 *  - fils-collection : fils de la collection du Motif principal (comportement V4–V6), + le Fond
 *    s'il est visible quelque part (sinon il serait « mangé » par le fil le plus proche) ;
 *  - auto : réduction automatique à `maxColors`, plafonnée au maximum machine.
 */
export function resolveStackPalette(args: {
  quantize: QuantizeSettings & { paletteFromLayers?: boolean };
  /** suggestStackPalette(…, rendu) — utilisé en mode calques. */
  suggested: readonly Hex[];
  /** Fils de la collection du Motif principal, ou null (pas de collection / collection PNG). */
  primaryYarns: readonly Hex[] | null;
  fondColor: Hex;
  /** Le Fond apparaît-il dans le rendu ? (au moins une maille dont owner = 0) */
  fondVisible: boolean;
  machineMax: number;
}): PaletteResolution {
  const { quantize: q, machineMax } = args;
  const uniq = (list: readonly Hex[]) => [...new Set(list.map((h) => h.toLowerCase()))];
  const done = (source: PaletteSource, palette: Hex[], maxColors: number, count: number): PaletteResolution => ({
    source,
    palette,
    maxColors,
    count,
    overLimit: count > machineMax,
    showMaxColors: source === 'auto' || source === 'manuelle',
  });
  if (q.paletteFromLayers) {
    const p = uniq(args.suggested);
    return done('calques', p, Math.min(8, Math.max(2, p.length)), p.length);
  }
  if (q.paletteMode === 'manuelle' && q.palette.length > 0) {
    const p = uniq(q.palette);
    return done('manuelle', p, q.maxColors, p.length);
  }
  if (args.primaryYarns && args.primaryYarns.length > 0) {
    const p = uniq(args.primaryYarns);
    const fond = args.fondColor.toLowerCase();
    if (args.fondVisible && !p.includes(fond)) p.push(fond);
    return done('fils-collection', p, Math.max(2, Math.min(8, p.length)), p.length);
  }
  const n = Math.min(q.maxColors, machineMax);
  return done('auto', [], n, n);
}

/** Le Fond est-il visible quelque part dans le rendu ? */
export function fondVisible(owner: Int16Array | null): boolean {
  if (!owner) return false;
  for (let i = 0; i < owner.length; i++) if (owner[i] === 0) return true;
  return false;
}

// =================================================================== V8 — le Fond remplace la « couleur du pied »
/**
 * Zones effectives passées à `composeGrid` : le pied sans motif prend la couleur du Fond.
 * (Le champ `zones.footColor` reste dans les fichiers pour la compatibilité, mais n'est plus réglable.)
 */
export function effectiveZones(d: Pick<SockDesignV2, 'zones' | 'layers'>): ZoneSettings {
  const fond = d.layers[0];
  return fond?.kind === 'fond' ? { ...d.zones, footColor: fond.color } : d.zones;
}
