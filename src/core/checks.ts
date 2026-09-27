import { seamMismatch } from './layout';
import type { LayoutSettings, StitchGrid, ZoneSettings } from './types';
import { Zone } from './types';
import type { MachineLimits } from './sizes';

/**
 * Contrôles de fabrication, non bloquants.
 * Les mailles hors tricot ne comptent pas dans les couleurs.
 * Un flotté est une suite circulaire de mailles de motif de la même couleur.
 * La longueur max est acceptée ; au-delà, le flotté est signalé.
 */

export interface FabricationReport {
  totalColors: number;
  maxColorsTotal: number;
  totalOk: boolean;
  rowsOver: number;
  maxColorsPerRow: number;
  rowsOk: boolean;
  floatCount: number;
  maxFloat: number;
  floatsOk: boolean;
  /** 1 si la maille appartient à un flotté trop long. */
  floatMask: Uint8Array;
  seamMismatch: number;
  seamOk: boolean;
}

function isMotif(zone: number, zones: ZoneSettings): boolean {
  if (zone === Zone.Leg) return true;
  return zone === Zone.Foot && zones.patternOnFoot;
}

function countFloats(
  grid: StitchGrid,
  zones: ZoneSettings,
  maxFloat: number,
  mask: Uint8Array,
): number {
  let count = 0;
  const width = grid.width;
  for (let row = 0; row < grid.height; row++) {
    const motif = new Uint8Array(width);
    const color = new Uint8Array(width);
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (!isMotif(grid.zone[index] ?? Zone.Empty, zones)) continue;
      motif[col] = 1;
      color[col] = grid.colorIndex[index] ?? 0;
    }
    const same = (col: number, other: number): boolean =>
      motif[col] === 1 && motif[other] === 1 && color[col] === color[other];

    let origin = -1;
    for (let col = 0; col < width; col++) {
      if (!same(col, (col + width - 1) % width)) {
        origin = col;
        break;
      }
    }
    if (origin === -1) {
      if (motif[0] === 1 && width > maxFloat) {
        count += 1;
        for (let col = 0; col < width; col++) mask[row * width + col] = 1;
      }
      continue;
    }

    let col = origin;
    let guard = 0;
    while (guard < width) {
      if (motif[col] !== 1) {
        col = (col + 1) % width;
        guard += 1;
        if (col === origin) break;
        continue;
      }
      const paint = color[col] ?? 0;
      const start = col;
      let length = 0;
      while (motif[col] === 1 && color[col] === paint && length < width) {
        length += 1;
        col = (col + 1) % width;
        if (col === start) break;
      }
      if (length > maxFloat) {
        count += 1;
        let mark = start;
        for (let step = 0; step < length; step++) {
          mask[row * width + mark] = 1;
          mark = (mark + 1) % width;
        }
      }
      guard += length;
      if (col === origin) break;
    }
  }
  return count;
}

/**
 * Plages horizontales (non enveloppantes) de mailles marquées flotté trop long,
 * regroupées par couleur : un rectangle d’alerte par plage.
 */
export function floatRunSpans(
  mask: Uint8Array,
  colorIndex: Uint8Array,
  width: number,
  height: number,
): Array<{ row: number; col0: number; col1: number }> {
  const spans: Array<{ row: number; col0: number; col1: number }> = [];
  for (let row = 0; row < height; row++) {
    let col = 0;
    while (col < width) {
      const index = row * width + col;
      if (!mask[index]) {
        col += 1;
        continue;
      }
      const paint = colorIndex[index] ?? 0;
      const start = col;
      while (
        col < width &&
        mask[row * width + col] &&
        (colorIndex[row * width + col] ?? 0) === paint
      ) {
        col += 1;
      }
      spans.push({ row, col0: start, col1: col });
    }
  }
  return spans;
}

export function checkFabrication(
  grid: StitchGrid,
  layout: LayoutSettings,
  zones: ZoneSettings,
  limits: MachineLimits,
  maxFloat: number,
): FabricationReport {
  const used = new Set<number>();
  let rowsOver = 0;
  for (let row = 0; row < grid.height; row++) {
    const onRow = new Set<number>();
    for (let col = 0; col < grid.width; col++) {
      const index = row * grid.width + col;
      if ((grid.zone[index] ?? Zone.Empty) === Zone.Empty) continue;
      const color = grid.colorIndex[index] ?? 0;
      used.add(color);
      onRow.add(color);
    }
    if (onRow.size > limits.maxColorsPerRow) rowsOver += 1;
  }
  const floatMask = new Uint8Array(grid.width * grid.height);
  const floatCount = countFloats(grid, zones, maxFloat, floatMask);
  const mismatch = seamMismatch(layout, grid.width, Math.max(1, layout.tileIds.length));
  return {
    totalColors: used.size,
    maxColorsTotal: limits.maxColorsTotal,
    totalOk: used.size <= limits.maxColorsTotal,
    rowsOver,
    maxColorsPerRow: limits.maxColorsPerRow,
    rowsOk: rowsOver === 0,
    floatCount,
    maxFloat,
    floatsOk: floatCount === 0,
    floatMask,
    seamMismatch: mismatch,
    seamOk: mismatch === 0,
  };
}
