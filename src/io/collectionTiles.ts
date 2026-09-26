import {
  recolorSvg,
  zoneHex,
  isPngCollection,
  type Catalogue,
  type Collection,
  type NuancierColor,
  type ZoneColors,
} from '../core/collections';
import type { TileAsset } from '../core/types';
import { loadTileFromSvgText, loadTileFromUrl } from './tiles';

const CARREAUX_BASE = './carreaux/';

export function nuancierMap(cat: Catalogue): Map<string, NuancierColor> {
  return new Map(cat.nuancier.map((c) => [c.id, c]));
}

export function carreauxUrl(rel: string): string {
  const clean = rel.replace(/^\.?\//, '');
  return `${CARREAUX_BASE}${clean}`;
}

/** Récupère le texte SVG d’une variation (chemin relatif catalogue). */
export async function fetchSvgText(file: string): Promise<string> {
  const res = await fetch(carreauxUrl(file));
  if (!res.ok) throw new Error(`SVG introuvable : ${file}`);
  return res.text();
}

/** Recolore et rasterise toutes les variations d’une collection (PNG : tel quel). */
export async function tilesFromCollection(
  collection: Collection,
  colors: ZoneColors,
  nuancier: Map<string, NuancierColor>,
): Promise<TileAsset[]> {
  const hexByZone = zoneHex(colors, nuancier);
  const out: TileAsset[] = [];
  for (const variation of collection.variations) {
    if (/\.png$/i.test(variation.file)) {
      const tile = await loadTileFromUrl(carreauxUrl(variation.file));
      out.push({ ...tile, id: tile.id, name: `${collection.id}-${variation.name}` });
      continue;
    }
    const raw = await fetchSvgText(variation.file);
    const svg = variation.zones.length === 0 ? raw : recolorSvg(raw, hexByZone);
    const tile = await loadTileFromSvgText(svg, `${collection.id}-${variation.name}`);
    out.push(tile);
  }
  return out;
}

/** Data-URL SVG VAR1 recoloré pour vignette (PNG : URL directe). */
export async function collectionThumbDataUrl(
  collection: Collection,
  nuancier: Map<string, NuancierColor>,
): Promise<string> {
  const first = collection.variations[0];
  if (!first) return '';
  if (/\.png$/i.test(first.file)) return carreauxUrl(first.file);
  const raw = await fetchSvgText(first.file);
  const hexByZone = zoneHex(collection.couleursParDefaut, nuancier);
  const svg = isPngCollection(collection) || first.zones.length === 0 ? raw : recolorSvg(raw, hexByZone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
