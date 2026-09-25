import { hexToRgb } from './color';
import type { LayoutKind, LayoutSettings, SockDimensions, TileAsset, ZoneSettings } from './types';

/**
 * Calepinage maille par maille.
 *
 * Le motif est un pavage infini. La maille (col, rang) lit la coordonnée
 * (col − décalage, rang − décalage). L'axe horizontal se referme sur la
 * chaussette : le pas du motif est pris modulo, et le raccord est le reste
 * de la division du nombre d'aiguilles par la période.
 *
 * Le joint est à droite et en bas de chaque carreau.
 * Quinconce horizontal : les rangées impaires sont décalées vers la droite
 * d'une demi-largeur (moitié du nombre de mailles du carreau).
 * Quinconce vertical : les colonnes impaires sont décalées vers le bas
 * d'une demi-hauteur.
 *
 * Pixels transparents (alpha < 128) : couleur du premier pixel opaque en
 * partant du coin haut-gauche, sinon blanc cassé `#f4f1ea`.
 * La sortie est du RVB, 3 octets par maille, rang par rang.
 */

const SAMPLE = 4;
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

function blockColumns(kind: LayoutKind): number {
  if (kind === 'rotation-4' || kind === 'miroir-4' || kind === 'damier') return 2;
  return 1;
}

/** Période horizontale du motif, en mailles (joint compris). */
export function repeatWidth(layout: LayoutSettings): number {
  const pitch = Math.max(0, layout.tileStitches) + Math.max(0, layout.gapStitches);
  return pitch * blockColumns(layout.kind);
}

/** Reste de la division : 0 si le motif tombe juste sur le tour. */
export function seamMismatch(layout: LayoutSettings, needles: number): number {
  const period = repeatWidth(layout);
  if (period <= 0) return Math.max(0, needles);
  return ((needles % period) + period) % period;
}

/**
 * Largeur de carreau (mailles) la plus proche dont la période divise `needles`.
 * À distance égale, on garde la plus grande.
 */
export function nearestFittingWidth(layout: LayoutSettings, needles: number): number {
  const target = Math.max(1, layout.tileStitches);
  if (needles <= 0) return target;
  const block = blockColumns(layout.kind);
  const gap = Math.max(0, layout.gapStitches);
  let best = target;
  let bestDistance = Number.POSITIVE_INFINITY;
  let found = false;
  for (let divisor = 1; divisor <= needles; divisor++) {
    if (needles % divisor !== 0) continue;
    if (divisor % block !== 0) continue;
    const width = divisor / block - gap;
    if (width < 1 || !Number.isInteger(width)) continue;
    const distance = Math.abs(width - target);
    if (!found || distance < bestDistance || (distance === bestDistance && width > best)) {
      found = true;
      bestDistance = distance;
      best = width;
    }
  }
  return best;
}

function positiveMod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function floorDiv(value: number, size: number): number {
  return Math.floor(value / size);
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

/** Un pas de mulberry32, mélangé avec la position du carreau. */
function randomQuarterTurns(seed: number, tileX: number, tileY: number): number {
  let state = (seed ^ Math.imul(tileX + 0x9e37, 0x7feb352d) ^ Math.imul(tileY + 0x85eb, 0x846ca68b)) >>> 0;
  state = (state + 0x6d2b79f5) | 0;
  let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) % 4;
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
): Uint8ClampedArray {
  const width = Math.max(0, dims.needles);
  const height = motifRows(dims, zones);
  const rgb = new Uint8ClampedArray(width * height * 3);
  const fallback = hexToRgb(TILE_BACKGROUND_FALLBACK);
  if (width === 0 || height === 0) return rgb;

  const tileStitches = layout.tileStitches;
  const tileRows = layout.tileRows;
  const pitchX = tileStitches + layout.gapStitches;
  const pitchY = tileRows + layout.gapRows;
  const primary = resolveTile(tiles, layout.tileIds[0]);
  const secondary = resolveTile(tiles, layout.tileIds[1] ?? layout.tileIds[0]);
  if (!primary || pitchX <= 0 || pitchY <= 0 || tileStitches <= 0 || tileRows <= 0) {
    for (let i = 0; i < rgb.length; i += 3) {
      rgb[i] = fallback.r;
      rgb[i + 1] = fallback.g;
      rgb[i + 2] = fallback.b;
    }
    return rgb;
  }

  const gap = hexToRgb(layout.gapColor);
  const shiftX = Math.floor(tileStitches / 2);
  const shiftY = Math.floor(tileRows / 2);
  const globalTurns = (layout.rotation / 90) | 0;
  const kind = layout.kind;
  const samples = new Uint32Array(SAMPLE * SAMPLE);
  const combine = sampling === 'moyenne' ? average : majority;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let x = col - layout.offsetStitches;
      let y = row - layout.offsetRows;
      if (kind === 'quinconce-h' && positiveMod(floorDiv(y, pitchY), 2) === 1) x -= shiftX;
      if (kind === 'quinconce-v' && positiveMod(floorDiv(x, pitchX), 2) === 1) y -= shiftY;

      const tileX = floorDiv(x, pitchX);
      const tileY = floorDiv(y, pitchY);
      const localX = positiveMod(x, pitchX);
      const localY = positiveMod(y, pitchY);
      const offset = (row * width + col) * 3;

      if (localX >= tileStitches || localY >= tileRows) {
        rgb[offset] = gap.r;
        rgb[offset + 1] = gap.g;
        rgb[offset + 2] = gap.b;
        continue;
      }

      let mirrorH = false;
      let mirrorV = false;
      let extraTurns = 0;
      let tile = primary;
      if (kind === 'rotation-4') {
        const bx = positiveMod(tileX, 2);
        const by = positiveMod(tileY, 2);
        extraTurns = bx + by * 2;
      } else if (kind === 'miroir-4') {
        mirrorH = positiveMod(tileX, 2) === 1;
        mirrorV = positiveMod(tileY, 2) === 1;
      } else if (kind === 'damier') {
        if ((positiveMod(tileX, 2) + positiveMod(tileY, 2)) % 2 === 1 && secondary) tile = secondary;
      } else if (kind === 'rotation-aleatoire') {
        extraTurns = randomQuarterTurns(layout.seed, tileX, tileY);
      }
      const turns = positiveMod(globalTurns + extraTurns, 4);

      const u0 = localX / tileStitches;
      const v0 = localY / tileRows;
      const du = 1 / tileStitches / SAMPLE;
      const dv = 1 / tileRows / SAMPLE;
      let sampleIndex = 0;
      for (let sy = 0; sy < SAMPLE; sy++) {
        for (let sx = 0; sx < SAMPLE; sx++) {
          let su = u0 + (sx + 0.5) * du;
          let sv = v0 + (sy + 0.5) * dv;
          if (mirrorH) su = 1 - su;
          if (mirrorV) sv = 1 - sv;
          if (turns === 1) {
            const nextU = sv;
            sv = 1 - su;
            su = nextU;
          } else if (turns === 2) {
            su = 1 - su;
            sv = 1 - sv;
          } else if (turns === 3) {
            const nextU = 1 - sv;
            sv = su;
            su = nextU;
          }
          samples[sampleIndex] = readPacked(tile, su, sv);
          sampleIndex += 1;
        }
      }

      const color = combine(samples);
      rgb[offset] = (color >> 16) & 255;
      rgb[offset + 1] = (color >> 8) & 255;
      rgb[offset + 2] = color & 255;
    }
  }
  return rgb;
}
