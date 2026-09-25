/**
 * Calepinage maille par maille (multi-motifs).
 *
 * Branche le moteur `calepinage.ts` : plan des cases → case de la maille →
 * rotation/miroir → pixel du bon carreau. Tous les carreaux de `layout.tileIds`
 * sont utilisés (motif 1 = premier de la liste).
 *
 * Pixels transparents (alpha < 128) : couleur du premier pixel opaque du carreau,
 * sinon blanc cassé `#f4f1ea`. Sortie RVB, 3 octets par maille.
 */

import {
  cellAtStitch,
  fittingTileWidths,
  planPlacements,
  raccord,
  type CalepinageSpec,
  type Preset,
  type TileGeometry,
} from './calepinage';
import { hexToRgb } from './color';
import { BUILTIN_PRESETS, resolvePreset } from './presets';
import type { LayoutSettings, SockDimensions, TileAsset, ZoneSettings } from './types';

const SAMPLE = 3;
const TILE_BACKGROUND_FALLBACK = '#f4f1ea';

export function motifRows(dims: SockDimensions, zones: ZoneSettings): number {
  const leg = Math.max(0, dims.legRows);
  const foot = zones.patternOnFoot ? Math.max(0, dims.footRows) : 0;
  return leg + foot;
}

/** Rangs d'un carreau carré de `tileStitches` mailles, au rapport de maille. */
export function tileRowsForWidth(tileStitches: number, aspect: number): number {
  if (!(aspect > 0)) return Math.max(1, Math.round(tileStitches));
  return Math.max(1, Math.round(tileStitches / aspect));
}

export function geometryFromLayout(layout: LayoutSettings, needles: number): TileGeometry {
  return {
    needles,
    tileStitches: layout.tileStitches,
    tileRows: layout.tileRows,
    gapStitches: layout.gapStitches,
    gapRows: layout.gapRows,
    offsetStitches: layout.offsetStitches,
    offsetRows: layout.offsetRows,
    appareil: layout.calepinage.appareil,
  };
}

export function layoutRaccord(
  layout: LayoutSettings,
  needles: number,
  tileCount: number,
  preset: Preset | null = resolvePreset(layout.calepinage),
): ReturnType<typeof raccord> {
  return raccord(geometryFromLayout(layout, needles), layout.calepinage, tileCount, preset);
}

/** Largeur de répétition complète du calepinage sur le tour (mailles). */
export function repeatWidth(
  layout: LayoutSettings,
  needles = 168,
  tileCount = Math.max(1, layout.tileIds.length),
): number {
  return layoutRaccord(layout, needles, tileCount).repeatStitches;
}

/** Reste de division historique : 0 si le motif tombe juste sur le tour. */
export function seamMismatch(
  layout: LayoutSettings,
  needles: number,
  tileCount = Math.max(1, layout.tileIds.length),
  preset: Preset | null = resolvePreset(layout.calepinage),
): number {
  const info = layoutRaccord(layout, needles, tileCount, preset);
  if (info.seamless) return 0;
  if (info.repeatStitches <= 0) return Math.max(0, needles);
  return ((needles % info.repeatStitches) + info.repeatStitches) % info.repeatStitches;
}

/**
 * Largeur de carreau (mailles) la plus proche dont le raccord est parfait.
 * À distance égale, on garde la plus grande.
 */
export function nearestFittingWidth(
  layout: LayoutSettings,
  needles: number,
  tileCount = Math.max(1, layout.tileIds.length),
  preset: Preset | null = resolvePreset(layout.calepinage),
): number {
  const target = Math.max(1, layout.tileStitches);
  const geo = geometryFromLayout(layout, needles);
  const widths = fittingTileWidths(geo, layout.calepinage, tileCount, preset, target, 12);
  if (widths.length === 0) return target;
  let best = widths[0]!;
  let bestDistance = Math.abs(best - target);
  for (const width of widths) {
    const distance = Math.abs(width - target);
    if (distance < bestDistance || (distance === bestDistance && width > best)) {
      best = width;
      bestDistance = distance;
    }
  }
  return best;
}

interface ResolvedTile {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  bgR: number;
  bgG: number;
  bgB: number;
}

function resolveTile(tiles: readonly TileAsset[], id: string | undefined): ResolvedTile | null {
  const found = (id ? tiles.find((tile) => tile.id === id) : undefined) ?? tiles[0];
  if (!found || found.width < 1 || found.height < 1) return null;
  const fallback = hexToRgb(TILE_BACKGROUND_FALLBACK);
  let bgR = fallback.r;
  let bgG = fallback.g;
  let bgB = fallback.b;
  const pixelCount = found.width * found.height;
  for (let i = 0; i < pixelCount; i++) {
    const alpha = found.rgba[i * 4 + 3] ?? 0;
    if (alpha >= 128) {
      bgR = found.rgba[i * 4] ?? 0;
      bgG = found.rgba[i * 4 + 1] ?? 0;
      bgB = found.rgba[i * 4 + 2] ?? 0;
      break;
    }
  }
  return { width: found.width, height: found.height, rgba: found.rgba, bgR, bgG, bgB };
}

function pack(r: number, g: number, b: number): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

function readPacked(tile: ResolvedTile, su: number, sv: number): number {
  let px = Math.floor(su * tile.width);
  let py = Math.floor(sv * tile.height);
  if (px < 0) px = 0;
  else if (px >= tile.width) px = tile.width - 1;
  if (py < 0) py = 0;
  else if (py >= tile.height) py = tile.height - 1;
  const index = (py * tile.width + px) * 4;
  const alpha = tile.rgba[index + 3] ?? 0;
  if (alpha < 128) return pack(tile.bgR, tile.bgG, tile.bgB);
  return pack(tile.rgba[index] ?? 0, tile.rgba[index + 1] ?? 0, tile.rgba[index + 2] ?? 0);
}

function tileUVLocal(rot: number, fx: boolean, fy: boolean, u: number, v: number): [number, number] {
  const a = fx ? 1 - u : u;
  const b = fy ? 1 - v : v;
  if (rot === 90) return [b, 1 - a];
  if (rot === 180) return [1 - a, 1 - b];
  if (rot === 270) return [1 - b, a];
  return [a, b];
}

function majority(samples: Uint32Array): number {
  samples.sort();
  let best = samples[0] ?? 0;
  let bestCount = 1;
  let run = 1;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] === samples[i - 1]) {
      run += 1;
      if (run > bestCount) {
        bestCount = run;
        best = samples[i] ?? best;
      }
    } else {
      run = 1;
    }
  }
  return best;
}

function average(samples: Uint32Array): number {
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let i = 0; i < samples.length; i++) {
    const color = samples[i] ?? 0;
    red += (color >> 16) & 255;
    green += (color >> 8) & 255;
    blue += color & 255;
  }
  const count = samples.length;
  return pack(Math.round(red / count), Math.round(green / count), Math.round(blue / count));
}

function orderedTiles(tiles: readonly TileAsset[], tileIds: readonly string[]): ResolvedTile[] {
  const out: ResolvedTile[] = [];
  for (const id of tileIds) {
    const resolved = resolveTile(tiles, id);
    if (resolved) out.push(resolved);
  }
  if (out.length === 0) {
    const first = resolveTile(tiles, tiles[0]?.id);
    if (first) out.push(first);
  }
  return out;
}

/**
 * Couleur RVB de chaque maille de motif (tige, et pied si `patternOnFoot`).
 * `needles × rangsMotif × 3` octets.
 */
export function samplePattern(
  tiles: readonly TileAsset[],
  layout: LayoutSettings,
  dims: SockDimensions,
  zones: ZoneSettings,
  sampling: 'majoritaire' | 'moyenne',
  presets: readonly Preset[] = BUILTIN_PRESETS,
): Uint8ClampedArray {
  const width = Math.max(0, dims.needles);
  const height = motifRows(dims, zones);
  const rgb = new Uint8ClampedArray(width * height * 3);
  const fallback = hexToRgb(TILE_BACKGROUND_FALLBACK);
  if (width === 0 || height === 0) return rgb;

  const resolved = orderedTiles(tiles, layout.tileIds);
  const pitchX = layout.tileStitches + layout.gapStitches;
  const pitchY = layout.tileRows + layout.gapRows;
  if (
    resolved.length === 0 ||
    pitchX <= 0 ||
    pitchY <= 0 ||
    layout.tileStitches <= 0 ||
    layout.tileRows <= 0
  ) {
    for (let i = 0; i < rgb.length; i += 3) {
      rgb[i] = fallback.r;
      rgb[i + 1] = fallback.g;
      rgb[i + 2] = fallback.b;
    }
    return rgb;
  }

  const gap = hexToRgb(layout.gapColor);
  const gapPacked = pack(gap.r, gap.g, gap.b);
  const spec: CalepinageSpec = layout.calepinage;
  const preset = resolvePreset(spec, presets);
  const geo = geometryFromLayout(layout, width);
  const r = raccord(geo, spec, resolved.length, preset);
  const nx = r.tilesAround ?? Math.ceil(width / pitchX) + 2;
  const ny = Math.ceil((height + Math.abs(layout.offsetRows) + pitchY) / pitchY) + 2;
  const plan = planPlacements(
    spec,
    { tileCount: resolved.length, preset, tilesAround: r.tilesAround },
    nx,
    ny,
  );
  const samples = new Uint32Array(SAMPLE * SAMPLE);
  const combine = sampling === 'moyenne' ? average : majority;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let sampleIndex = 0;
      for (let sy = 0; sy < SAMPLE; sy++) {
        for (let sx = 0; sx < SAMPLE; sx++) {
          const hit = cellAtStitch(geo, col + (sx + 0.5) / SAMPLE, row + (sy + 0.5) / SAMPLE);
          if (hit.gap) {
            samples[sampleIndex] = gapPacked;
          } else {
            const cx = ((hit.cx % nx) + nx) % nx;
            const cy = ((hit.cy % ny) + ny) % ny;
            const p = plan[cy * nx + cx]!;
            const tile = resolved[p.tile % resolved.length]!;
            const [a, b] = tileUVLocal(p.rot, p.flipX, p.flipY, hit.u, hit.v);
            samples[sampleIndex] = readPacked(tile, a, b);
          }
          sampleIndex += 1;
        }
      }
      const color = combine(samples);
      const offset = (row * width + col) * 3;
      rgb[offset] = (color >> 16) & 255;
      rgb[offset + 1] = (color >> 8) & 255;
      rgb[offset + 2] = color & 255;
    }
  }
  return rgb;
}
