/**
 * Cache des images pixelisées pour la composition (T45).
 * Clé = assetKey + couleurs (SVG) + taille cible.
 */
import { assetKey, type AssetRef, type RasterImage, type EmbeddedAsset } from '../core/composition';
import { recolorSvg, zoneHex, type Catalogue, type ZoneColors } from '../core/collections';
import { carreauxUrl } from './collectionTiles';
import { bibliothequeImageUrl, resolveBibliothequeFichier } from './bibliothequeImages';
import { loadTileFromSvgText, loadTileFromUrl } from './tiles';
import { base64ToBytes, decodePng } from './pngCodec';

export interface CompositionImageRequest {
  ref: AssetRef;
  /** Couleurs de zones (collection) — ignoré pour embarqué / bibliothèque. */
  zoneColors?: ZoneColors | null;
  catalogue?: Catalogue | null;
  assets?: readonly EmbeddedAsset[];
  /** Côté cible pour le cache (défaut 512). */
  targetSide?: number;
}

function colorsKey(colors: ZoneColors | null | undefined): string {
  if (!colors) return '';
  return Object.keys(colors)
    .sort()
    .map((k) => `${k}=${colors[k]}`)
    .join('&');
}

export function compositionCacheKey(req: CompositionImageRequest): string {
  const key = assetKey(req.ref);
  const side = req.targetSide ?? 512;
  if (req.ref.kind === 'embarquee') return `${key}|e|${side}`;
  if (req.ref.kind === 'bibliotheque') return `${key}|b|${side}`;
  if (req.ref.kind === 'partagee') return `${key}|s|${side}`;
  return `${key}|${colorsKey(req.zoneColors)}|${side}`;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPngBytes(bytes: Uint8Array): boolean {
  return PNG_SIG.every((b, i) => bytes[i] === b);
}

/**
 * Image `/api/images/:id` : l'URL n'a pas d'extension, on se fie au type renvoyé.
 */
async function loadPartageeRaster(imageId: string): Promise<RasterImage> {
  const res = await fetch(`/api/images/${encodeURIComponent(imageId)}`);
  if (!res.ok) throw new Error(`Image partagée introuvable : ${imageId}`);
  const mime = (res.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  const bytes = new Uint8Array(await res.arrayBuffer());
  const svg = mime === 'image/svg+xml' || (!isPngBytes(bytes) && bytes[0] === 0x3c);
  if (svg) {
    const tile = await loadTileFromSvgText(new TextDecoder().decode(bytes), imageId);
    return { width: tile.width, height: tile.height, rgba: tile.rgba };
  }
  const blob = new Blob([bytes], { type: 'image/png' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const tile = await loadTileFromUrl(objectUrl, 'png');
    return { width: tile.width, height: tile.height, rgba: tile.rgba };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const cache = new Map<string, RasterImage>();

export function clearCompositionImageCache(): void {
  cache.clear();
}

export function getCachedCompositionImage(key: string): RasterImage | undefined {
  return cache.get(key);
}

export async function loadCompositionImage(req: CompositionImageRequest): Promise<RasterImage> {
  const key = compositionCacheKey(req);
  const hit = cache.get(key);
  if (hit) return hit;

  let img: RasterImage;
  if (req.ref.kind === 'embarquee') {
    const ref = req.ref;
    const asset = (req.assets ?? []).find((a) => a.id === ref.assetId);
    if (!asset) throw new Error(`Image embarquée introuvable : ${ref.assetId}`);
    if (asset.mime === 'image/png') {
      const raw = asset.data.includes('base64,')
        ? base64ToBytes(asset.data.split('base64,')[1] ?? '')
        : base64ToBytes(asset.data);
      const decoded = await decodePng(raw);
      img = { width: decoded.width, height: decoded.height, rgba: decoded.rgba };
    } else {
      const tile = await loadTileFromSvgText(asset.data, asset.name);
      img = { width: tile.width, height: tile.height, rgba: tile.rgba };
    }
  } else if (req.ref.kind === 'bibliotheque') {
    const fichier = await resolveBibliothequeFichier(req.ref.imageId);
    if (!fichier) throw new Error(`Image bibliothèque introuvable : ${req.ref.imageId}`);
    const tile = await loadTileFromUrl(bibliothequeImageUrl(fichier));
    img = { width: tile.width, height: tile.height, rgba: tile.rgba };
  } else if (req.ref.kind === 'partagee') {
    img = await loadPartageeRaster(req.ref.imageId);
  } else {
    const ref = req.ref;
    const cat = req.catalogue;
    const collection = cat?.collections.find((c) => c.id === ref.collectionId);
    const variation = collection?.variations.find((v) => v.name === ref.variation);
    if (!collection || !variation) {
      throw new Error(`Variation introuvable : ${ref.collectionId}/${ref.variation}`);
    }
    if (/\.png$/i.test(variation.file)) {
      const tile = await loadTileFromUrl(carreauxUrl(variation.file));
      img = { width: tile.width, height: tile.height, rgba: tile.rgba };
    } else {
      const res = await fetch(carreauxUrl(variation.file));
      if (!res.ok) throw new Error(`SVG introuvable : ${variation.file}`);
      let svg = await res.text();
      if (req.zoneColors && cat) {
        const nuancier = new Map(cat.nuancier.map((c) => [c.id, c]));
        svg = recolorSvg(svg, zoneHex(req.zoneColors, nuancier));
      }
      const tile = await loadTileFromSvgText(svg, `${collection.id}-${variation.name}`);
      img = { width: tile.width, height: tile.height, rgba: tile.rgba };
    }
  }
  cache.set(key, img);
  return img;
}

/** Charge toutes les images visibles d’une composition. */
export async function loadCompositionImages(
  layers: ReadonlyArray<{ asset: AssetRef; hidden: boolean }>,
  opts: {
    zoneColors?: ZoneColors | null;
    catalogue?: Catalogue | null;
    assets?: readonly EmbeddedAsset[];
  },
): Promise<Map<string, RasterImage>> {
  const map = new Map<string, RasterImage>();
  for (const layer of layers) {
    if (layer.hidden) continue;
    const key = assetKey(layer.asset);
    if (map.has(key)) continue;
    const img = await loadCompositionImage({
      ref: layer.asset,
      zoneColors: opts.zoneColors,
      catalogue: opts.catalogue,
      assets: opts.assets,
    });
    map.set(key, img);
  }
  return map;
}
