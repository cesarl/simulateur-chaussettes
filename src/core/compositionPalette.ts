/**
 * Palette de fils pour le mode composition (T45) — PUR.
 * Couleurs des zones SVG utilisées + fond + réduction PNG (N réglable).
 */
import { assetKey, type Composition, type RasterImage } from './composition';
import type { Hex } from './types';
import { MACHINE_LIMITS } from './sizes';
import { normalizeHex } from './color';

export interface CompositionYarnInput {
  composition: Composition;
  /** Hex par assetKey pour les SVG de collection (couleurs de zones distinctes). */
  svgYarnHexes: ReadonlyMap<string, readonly Hex[]>;
  /** Images PNG (ou sans zones) déjà pixelisées — pour compter les couleurs exactes si ≤ N. */
  rasterImages: ReadonlyMap<string, RasterImage>;
  /** N pour la réduction des PNG (défaut 4). */
  pngMaxColors: number;
}

export interface CompositionYarnResult {
  /** Palette manuelle proposée (fond + SVG + couleurs PNG exactes si peu nombreuses). */
  palette: Hex[];
  /** true si on dépasse la limite machine. */
  overLimit: boolean;
  /** Mode conseillé pour quantize. */
  paletteMode: 'auto' | 'manuelle';
  maxColors: number;
}

function uniqueHex(list: Hex[]): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const h of list) {
    let n: string;
    try {
      n = normalizeHex(h);
    } catch {
      continue;
    }
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Couleurs exactes d’une image (ignore alpha < 128), plafonnées. */
export function exactColorsFromRaster(img: RasterImage, cap = 64): Hex[] {
  const seen = new Set<string>();
  const { width, height, rgba } = img;
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3] ?? 0;
    if (a < 128) continue;
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    seen.add(hex);
    if (seen.size >= cap) break;
  }
  return [...seen];
}

export function compositionYarnColors(input: CompositionYarnInput): CompositionYarnResult {
  const { composition, svgYarnHexes, rasterImages, pngMaxColors } = input;
  const hexes: Hex[] = [composition.background];
  let needsAutoPng = false;
  for (const layer of composition.layers) {
    if (layer.hidden) continue;
    const key = assetKey(layer.asset);
    const svgHex = svgYarnHexes.get(key);
    if (svgHex?.length) {
      hexes.push(...svgHex);
      continue;
    }
    const img = rasterImages.get(key);
    if (!img) continue;
    const exact = exactColorsFromRaster(img, 32);
    if (exact.length > 0 && exact.length <= pngMaxColors) {
      hexes.push(...exact);
    } else {
      needsAutoPng = true;
    }
  }
  const palette = uniqueHex(hexes);
  const maxColors = Math.max(
    2,
    Math.min(8, needsAutoPng ? Math.max(palette.length, pngMaxColors) : Math.max(2, palette.length)),
  );
  const overLimit = palette.length > MACHINE_LIMITS.maxColorsTotal || maxColors > MACHINE_LIMITS.maxColorsTotal;
  return {
    palette,
    overLimit,
    paletteMode: needsAutoPng && palette.length < 2 ? 'auto' : palette.length >= 2 ? 'manuelle' : 'auto',
    maxColors,
  };
}
