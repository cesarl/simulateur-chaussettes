/**
 * Garde-fous palette multi-calques (T58) — pur, sans DOM.
 */
import { rgbToHex } from './color';
import { layerKeyColors, dominantColors, type SockDesignV2, type StackLayer, type StackRenderInput } from './layers';
import type { MachineLimits } from './sizes';
import type { Hex, QuantizeSettings, StitchGrid, ZoneSettings } from './types';
import { Zone } from './types';

export interface StackPaletteColorEntry {
  hex: Hex;
  layerId: string;
  layerName: string;
}

export interface StackPaletteGuardResult {
  entries: StackPaletteColorEntry[];
  overLimit: boolean;
  /** Bandeau visible : palette « d’après les calques » et trop de couleurs. */
  showBanner: boolean;
  machineMax: number;
}

/** Couleurs de fil par calque visible (même ordre que `suggestStackPalette`, avec provenance). */
export function stackPaletteEntries(
  layers: readonly StackLayer[],
  input: Pick<StackRenderInput, 'motifRgb' | 'images' | 'keyColors'>,
  rendered?: Uint8ClampedArray,
  opts?: { requirePixelPresence?: boolean },
): StackPaletteColorEntry[] {
  const seen = new Set<string>();
  const filterByPixels = opts?.requirePixelPresence !== false && rendered;
  const visible = filterByPixels
    ? new Set(dominantColors(rendered!, 3, { minShare: 0, max: 4096 }))
    : null;
  const out: StackPaletteColorEntry[] = [];
  for (const l of layers) {
    if (l.hidden && l.kind !== 'fond') continue;
    const transparent = new Set(l.transparentColors.map((h) => h.toLowerCase()));
    for (const c of layerKeyColors(l, input)) {
      const h = c.toLowerCase();
      if (transparent.has(h) || seen.has(h) || (visible && !visible.has(h))) continue;
      seen.add(h);
      out.push({ hex: h, layerId: l.id, layerName: l.name });
    }
  }
  return out;
}

export function analyzeStackPaletteGuard(
  design: Pick<SockDesignV2, 'layers' | 'quantize'>,
  input: Pick<StackRenderInput, 'motifRgb' | 'images' | 'keyColors'>,
  rendered: Uint8ClampedArray | undefined,
  limits: MachineLimits,
): StackPaletteGuardResult {
  const entries = stackPaletteEntries(design.layers, input, rendered, { requirePixelPresence: false });
  const overLimit = entries.length > limits.maxColorsTotal;
  const showBanner = design.quantize.paletteFromLayers === true && overLimit;
  return {
    entries,
    overLimit,
    showBanner,
    machineMax: limits.maxColorsTotal,
  };
}

/** Les N couleurs les plus présentes dans le RVB empilé (maille = pixel). */
export function topStackColorsByPresence(rgb: Uint8ClampedArray, maxColors: number): Hex[] {
  const hist = new Map<string, number>();
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const hex = rgbToHex(rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0).toLowerCase();
    hist.set(hex, (hist.get(hex) ?? 0) + 1);
  }
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.slice(0, Math.max(1, maxColors)).map(([hex]) => hex);
}

/** Passe en palette manuelle avec les N fils les plus présents (N = limite machine). */
export function reduceStackPaletteQuantize(
  rgb: Uint8ClampedArray,
  limits: MachineLimits,
): Pick<QuantizeSettings, 'paletteFromLayers' | 'paletteMode' | 'palette' | 'maxColors'> {
  const palette = topStackColorsByPresence(rgb, limits.maxColorsTotal);
  const maxColors = Math.max(2, Math.min(8, palette.length));
  return {
    paletteFromLayers: false,
    paletteMode: 'manuelle',
    palette,
    maxColors,
  };
}

function isMotifZone(zone: number, zones: ZoneSettings): boolean {
  if (zone === Zone.Leg) return true;
  return zone === Zone.Foot && zones.patternOnFoot;
}

/** Index dans le RVB motif / tableau `owner` pour une maille de la grille complète. */
export function motifStitchIndexAtGridCell(
  grid: StitchGrid,
  zones: ZoneSettings,
  gridIndex: number,
): number | null {
  if (gridIndex < 0 || gridIndex >= grid.zone.length) return null;
  let motifCursor = 0;
  for (let i = 0; i <= gridIndex; i++) {
    const cell = grid.zone[i] ?? Zone.Empty;
    if (!isMotifZone(cell, zones)) continue;
    if (i === gridIndex) return motifCursor;
    motifCursor += 1;
  }
  return null;
}

export function layerNameFromOwner(
  owner: Int16Array | null,
  layers: readonly StackLayer[],
  motifIndex: number,
): string | null {
  if (!owner || motifIndex < 0 || motifIndex >= owner.length) return null;
  const layerIndex = owner[motifIndex] ?? -1;
  if (layerIndex < 0 || layerIndex >= layers.length) return null;
  return layers[layerIndex]?.name ?? null;
}

export function firstFloatLayerHint(
  floatMask: Uint8Array,
  grid: StitchGrid,
  zones: ZoneSettings,
  owner: Int16Array | null,
  layers: readonly StackLayer[],
): string | null {
  for (let i = 0; i < floatMask.length; i++) {
    if (!floatMask[i]) continue;
    const motifIndex = motifStitchIndexAtGridCell(grid, zones, i);
    if (motifIndex === null) continue;
    const name = layerNameFromOwner(owner, layers, motifIndex);
    if (name) return name;
  }
  return null;
}

export function firstIsolatedLayerHint(
  indices: Uint8Array,
  width: number,
  height: number,
  owner: Int16Array | null,
  layers: readonly StackLayer[],
): string | null {
  if (width <= 0 || height <= 2) return null;
  for (let row = 1; row < height - 1; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const center = indices[index] ?? 0;
      const left = indices[row * width + ((col + width - 1) % width)] ?? 0;
      const right = indices[row * width + ((col + 1) % width)] ?? 0;
      const up = indices[(row - 1) * width + col] ?? 0;
      const down = indices[(row + 1) * width + col] ?? 0;
      if (left === right && right === up && up === down && left !== center) {
        return layerNameFromOwner(owner, layers, index);
      }
    }
  }
  return null;
}
