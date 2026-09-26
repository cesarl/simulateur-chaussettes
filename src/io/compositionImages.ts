/**
 * Cache des images pixelisées pour la composition (T45).
 * Clé = assetKey + couleurs (SVG) + taille cible.
 */
import { assetKey, type AssetRef, type RasterImage, type EmbeddedAsset } from '../core/composition';
import { recolorSvg, zoneHex, type Catalogue, type ZoneColors } from '../core/collections';
import { carreauxUrl } from './collectionTiles';
import { loadTileFromSvgText, loadTileFromUrl } from './tiles';
import { base64ToBytes, decodePng } from './pngCodec';

export interface CompositionImageRequest {
  ref: AssetRef;
  /** Couleurs de zones (collection) — ignoré pour embarqué. */
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
  return `${key}|${colorsKey(req.zoneColors)}|${side}`;
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
