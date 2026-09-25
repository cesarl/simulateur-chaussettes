import { colorDistance, hexToRgb, normalizeHex, rgbToHex } from './color';
import type { Hex, QuantizeSettings } from './types';

/**
 * Réduction du motif à N couleurs.
 * Mode auto : k-means++ à graine fixe. Si l'image a déjà au plus N couleurs pures, on les garde.
 * Mode manuel : chaque maille prend la couleur de palette la plus proche (distance redmean).
 * Despeckle : une maille dont les 4 voisines (gauche/droite circulaires) partagent une autre
 * couleur prend cette couleur. Un seul passage, calculé sur la grille d'origine.
 * La palette renvoyée est triée par nombre de mailles décroissant.
 */

const KMEANS_SEED = 0x51ec0517;
const KMEANS_ITERATIONS = 16;

export interface QuantizeResult {
  palette: Hex[];
  indices: Uint8Array;
  counts: number[];
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function clampColors(maxColors: number): number {
  return Math.max(2, Math.min(8, Math.round(maxColors)));
}

function packPixel(rgb: Uint8ClampedArray, index: number): number {
  const offset = index * 3;
  return (((rgb[offset] ?? 0) << 16) | ((rgb[offset + 1] ?? 0) << 8) | (rgb[offset + 2] ?? 0)) >>> 0;
}

function unpack(packed: number): Hex {
  return rgbToHex((packed >> 16) & 255, (packed >> 8) & 255, packed & 255);
}

function despeckle(indices: Uint8Array, width: number, height: number): Uint8Array {
  const next = new Uint8Array(indices);
  if (width <= 0 || height <= 2) return next;
  for (let row = 1; row < height - 1; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const center = indices[index] ?? 0;
      const left = indices[row * width + ((col + width - 1) % width)] ?? 0;
      const right = indices[row * width + ((col + 1) % width)] ?? 0;
      const up = indices[(row - 1) * width + col] ?? 0;
      const down = indices[(row + 1) * width + col] ?? 0;
      if (left === right && right === up && up === down && left !== center) next[index] = left;
    }
  }
  return next;
}

function finalize(indices: Uint8Array, palette: readonly Hex[]): QuantizeResult {
  const counts = new Array<number>(palette.length).fill(0);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i] ?? 0;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  const order = palette.map((_, index) => index).filter((index) => (counts[index] ?? 0) > 0);
  order.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a - b);
  const remap = new Uint8Array(palette.length);
  order.forEach((oldIndex, newIndex) => {
    remap[oldIndex] = newIndex;
  });
  const remapped = new Uint8Array(indices.length);
  for (let i = 0; i < indices.length; i++) remapped[i] = remap[indices[i] ?? 0] ?? 0;
  return {
    palette: order.map((index) => normalizeHex(palette[index] ?? '#000000')),
    indices: remapped,
    counts: order.map((index) => counts[index] ?? 0),
  };
}

function nearestPaletteIndex(r: number, g: number, b: number, palette: readonly { r: number; g: number; b: number }[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index++) {
    const color = palette[index];
    if (!color) continue;
    const distance = colorDistance({ r, g, b }, color);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function quantizeManual(rgb: Uint8ClampedArray, usable: number, palette: readonly string[]): Uint8Array {
  const colors = palette.map((hex) => hexToRgb(hex));
  const indices = new Uint8Array(usable);
  for (let i = 0; i < usable; i++) {
    const offset = i * 3;
    indices[i] = nearestPaletteIndex(rgb[offset] ?? 0, rgb[offset + 1] ?? 0, rgb[offset + 2] ?? 0, colors);
  }
  return indices;
}

function quantizeAuto(rgb: Uint8ClampedArray, usable: number, colorCount: number): { palette: Hex[]; indices: Uint8Array } {
  const histogram = new Map<number, number>();
  for (let i = 0; i < usable; i++) {
    const packed = packPixel(rgb, i);
    histogram.set(packed, (histogram.get(packed) ?? 0) + 1);
  }
  if (histogram.size <= colorCount) {
    const palette: Hex[] = [];
    const indexOf = new Map<number, number>();
    for (const packed of histogram.keys()) {
      indexOf.set(packed, palette.length);
      palette.push(unpack(packed));
    }
    const indices = new Uint8Array(usable);
    for (let i = 0; i < usable; i++) indices[i] = indexOf.get(packPixel(rgb, i)) ?? 0;
    return { palette, indices };
  }

  const rand = mulberry32(KMEANS_SEED);
  const centers = new Float64Array(colorCount * 3);
  const first = Math.min(usable - 1, Math.floor(rand() * usable));
  centers[0] = rgb[first * 3] ?? 0;
  centers[1] = rgb[first * 3 + 1] ?? 0;
  centers[2] = rgb[first * 3 + 2] ?? 0;

  const nearest = new Float64Array(usable);
  for (let cluster = 1; cluster < colorCount; cluster++) {
    let sum = 0;
    for (let i = 0; i < usable; i++) {
      const r = rgb[i * 3] ?? 0;
      const g = rgb[i * 3 + 1] ?? 0;
      const b = rgb[i * 3 + 2] ?? 0;
      let best = Number.POSITIVE_INFINITY;
      for (let c = 0; c < cluster; c++) {
        const dr = r - (centers[c * 3] ?? 0);
        const dg = g - (centers[c * 3 + 1] ?? 0);
        const db = b - (centers[c * 3 + 2] ?? 0);
        const distance = dr * dr + dg * dg + db * db;
        if (distance < best) best = distance;
      }
      nearest[i] = best;
      sum += best;
    }
    let pick = usable - 1;
    if (sum <= 0) pick = Math.min(usable - 1, Math.floor(rand() * usable));
    else {
      let threshold = rand() * sum;
      for (let i = 0; i < usable; i++) {
        threshold -= nearest[i] ?? 0;
        if (threshold <= 0) {
          pick = i;
          break;
        }
      }
    }
    centers[cluster * 3] = rgb[pick * 3] ?? 0;
    centers[cluster * 3 + 1] = rgb[pick * 3 + 1] ?? 0;
    centers[cluster * 3 + 2] = rgb[pick * 3 + 2] ?? 0;
  }

  const assignment = new Uint8Array(usable);
  for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
    const sumR = new Float64Array(colorCount);
    const sumG = new Float64Array(colorCount);
    const sumB = new Float64Array(colorCount);
    const counts = new Uint32Array(colorCount);
    let changed = false;
    for (let i = 0; i < usable; i++) {
      const r = rgb[i * 3] ?? 0;
      const g = rgb[i * 3 + 1] ?? 0;
      const b = rgb[i * 3 + 2] ?? 0;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < colorCount; c++) {
        const dr = r - (centers[c * 3] ?? 0);
        const dg = g - (centers[c * 3 + 1] ?? 0);
        const db = b - (centers[c * 3 + 2] ?? 0);
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
      if (assignment[i] !== best) changed = true;
      assignment[i] = best;
      sumR[best] = (sumR[best] ?? 0) + r;
      sumG[best] = (sumG[best] ?? 0) + g;
      sumB[best] = (sumB[best] ?? 0) + b;
      counts[best] = (counts[best] ?? 0) + 1;
    }
    for (let c = 0; c < colorCount; c++) {
      const clusterCount = counts[c] ?? 0;
      if (clusterCount === 0) {
        let far = 0;
        let farDistance = -1;
        for (let i = 0; i < usable; i++) {
          const r = rgb[i * 3] ?? 0;
          const g = rgb[i * 3 + 1] ?? 0;
          const b = rgb[i * 3 + 2] ?? 0;
          let closest = Number.POSITIVE_INFINITY;
          for (let other = 0; other < colorCount; other++) {
            if (other === c) continue;
            const dr = r - (centers[other * 3] ?? 0);
            const dg = g - (centers[other * 3 + 1] ?? 0);
            const db = b - (centers[other * 3 + 2] ?? 0);
            const distance = dr * dr + dg * dg + db * db;
            if (distance < closest) closest = distance;
          }
          if (closest > farDistance) {
            farDistance = closest;
            far = i;
          }
        }
        centers[c * 3] = rgb[far * 3] ?? 0;
        centers[c * 3 + 1] = rgb[far * 3 + 1] ?? 0;
        centers[c * 3 + 2] = rgb[far * 3 + 2] ?? 0;
        changed = true;
      } else {
        centers[c * 3] = (sumR[c] ?? 0) / clusterCount;
        centers[c * 3 + 1] = (sumG[c] ?? 0) / clusterCount;
        centers[c * 3 + 2] = (sumB[c] ?? 0) / clusterCount;
      }
    }
    if (!changed && iteration > 0) break;
  }

  const palette = Array.from({ length: colorCount }, (_, c) => rgbToHex(centers[c * 3] ?? 0, centers[c * 3 + 1] ?? 0, centers[c * 3 + 2] ?? 0));
  return { palette, indices: assignment };
}

function dedupePalette(palette: readonly string[]): Hex[] {
  const unique: Hex[] = [];
  for (const color of palette) {
    const hex = normalizeHex(color);
    if (!unique.includes(hex)) unique.push(hex);
  }
  return unique;
}

/** Réduit les couleurs RVB (3 octets par maille) d'une image de largeur `width`. */
export function quantize(rgb: Uint8ClampedArray, width: number, settings: QuantizeSettings): QuantizeResult {
  const count = Math.floor(rgb.length / 3);
  const safeWidth = Math.max(0, Math.floor(width));
  const height = safeWidth > 0 ? Math.floor(count / safeWidth) : 0;
  const usable = safeWidth * height;
  if (usable === 0) return { palette: [], indices: new Uint8Array(0), counts: [] };

  const manual = settings.paletteMode === 'manuelle' ? dedupePalette(settings.palette) : [];
  const reduced = manual.length > 0
    ? { palette: manual, indices: quantizeManual(rgb, usable, manual) }
    : quantizeAuto(rgb, usable, Math.min(clampColors(settings.maxColors), usable));

  const indices = settings.despeckle ? despeckle(reduced.indices, safeWidth, height) : reduced.indices;
  return finalize(indices, reduced.palette);
}
