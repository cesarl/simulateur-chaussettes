import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHex } from '../../src/core/color';
import {
  motifRows,
  nearestFittingWidth,
  repeatWidth,
  samplePattern,
  seamMismatch,
  tileRowsForWidth,
} from '../../src/core/layout';
import { defaultDimensions, stitchAspect } from '../../src/core/sizes';
import type { LayoutSettings, SockDimensions, TileAsset, ZoneSettings } from '../../src/core/types';

const R = '#ff0000';
const G = '#00ff00';
const B = '#0000ff';
const W = '#ffffff';
const INK = '#112233';
const GAP = '#123456';

function makeTile(id: string, pixels: string[][], alpha?: number[][]): TileAsset {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rgb = hexToRgb(pixels[y]?.[x] ?? '#000000');
      const i = (y * width + x) * 4;
      rgba[i] = rgb.r;
      rgba[i + 1] = rgb.g;
      rgba[i + 2] = rgb.b;
      rgba[i + 3] = alpha?.[y]?.[x] ?? 255;
    }
  }
  return { id, name: id, source: 'png', width, height, rgba };
}

const quad = makeTile('a', [
  [R, G],
  [B, W],
]);

function layout(partial: Partial<LayoutSettings> = {}): LayoutSettings {
  return {
    kind: 'grille',
    tileIds: ['a'],
    tileStitches: 2,
    tileRows: 2,
    gapStitches: 0,
    gapRows: 0,
    gapColor: GAP,
    offsetStitches: 0,
    offsetRows: 0,
    rotation: 0,
    seed: 1,
    ...partial,
  };
}

function dims(partial: Partial<SockDimensions> = {}): SockDimensions {
  return {
    ...defaultDimensions('homme'),
    needles: 4,
    cuffRows: 0,
    legRows: 4,
    heelRows: 0,
    footRows: 0,
    toeRows: 0,
    ...partial,
  };
}

function zones(partial: Partial<ZoneSettings> = {}): ZoneSettings {
  return {
    cuffEnabled: false,
    cuffColor: '#000000',
    heelColor: '#000000',
    toeColor: '#000000',
    patternOnFoot: false,
    footColor: '#000000',
    heelHeightMm: 55,
    heelDepthMm: 72,
    heelSpread: 100,
    ...partial,
  };
}

function read(rgb: Uint8ClampedArray, width: number, col: number, row: number): string {
  const i = (row * width + col) * 3;
  return rgbToHex(rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0);
}

function gridOf(rgb: Uint8ClampedArray, width: number, height: number): string[][] {
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => read(rgb, width, col, row)),
  );
}

describe('proportions et raccord', () => {
  it('calcule les rangs qui gardent les proportions', () => {
    const aspect = stitchAspect(defaultDimensions('homme'));
    expect(tileRowsForWidth(24, aspect)).toBe(32);
    expect(tileRowsForWidth(10, 0.75)).toBe(13);
  });

  it('signale un raccord nul quand la répétition divise les aiguilles', () => {
    const needles = defaultDimensions('homme').needles;
    const fitting = layout({ tileStitches: 12, tileRows: 12, gapStitches: 0 });
    expect(repeatWidth(fitting)).toBe(12);
    expect(needles % 12).toBe(0);
    expect(seamMismatch(fitting, needles)).toBe(0);
    expect(seamMismatch(layout({ tileStitches: 10, gapStitches: 0 }), needles)).toBe(needles % 10);

    const fitted = nearestFittingWidth(layout({ tileStitches: 10, gapStitches: 0, kind: 'grille' }), 24);
    expect(24 % fitted).toBe(0);
    expect(fitted).toBe(12);
    expect(repeatWidth(layout({ kind: 'rotation-4', tileStitches: 5, gapStitches: 1 }))).toBe(12);
    expect(repeatWidth(layout({ kind: 'damier', tileStitches: 4, gapStitches: 0 }))).toBe(8);
  });
});

describe('calepinage', () => {
  const d = dims();
  const z = zones();

  it('répète le carreau en grille', () => {
    const rgb = samplePattern([quad], layout(), d, z, 'majoritaire');
    expect(motifRows(d, z)).toBe(4);
    expect(rgb.length).toBe(4 * 4 * 3);
    expect(gridOf(rgb, 4, 4)).toEqual([
      [R, G, R, G],
      [B, W, B, W],
      [R, G, R, G],
      [B, W, B, W],
    ]);
  });

  it('décale les rangées impaires d’une demi-largeur en quinconce horizontal', () => {
    const rgb = samplePattern([quad], layout({ kind: 'quinconce-h' }), d, z, 'majoritaire');
    expect(gridOf(rgb, 4, 4)).toEqual([
      [R, G, R, G],
      [B, W, B, W],
      [G, R, G, R],
      [W, B, W, B],
    ]);
  });

  it('décale les colonnes impaires d’une demi-hauteur en quinconce vertical', () => {
    const rgb = samplePattern([quad], layout({ kind: 'quinconce-v' }), d, z, 'majoritaire');
    expect(gridOf(rgb, 4, 4)).toEqual([
      [R, G, B, W],
      [B, W, R, G],
      [R, G, B, W],
      [B, W, R, G],
    ]);
  });

  it('tourne les quatre carreaux d’un bloc 2×2', () => {
    const rgb = samplePattern([quad], layout({ kind: 'rotation-4' }), d, z, 'majoritaire');
    expect(gridOf(rgb, 4, 4)).toEqual([
      [R, G, B, R],
      [B, W, W, G],
      [W, B, G, W],
      [G, R, R, B],
    ]);
  });

  it('miroite les quatre carreaux d’un bloc 2×2', () => {
    const rgb = samplePattern([quad], layout({ kind: 'miroir-4' }), d, z, 'majoritaire');
    expect(gridOf(rgb, 4, 4)).toEqual([
      [R, G, G, R],
      [B, W, W, B],
      [B, W, W, B],
      [R, G, G, R],
    ]);
  });

  it('alterne deux carreaux en damier', () => {
    const ink = makeTile('b', [
      [INK, INK],
      [INK, INK],
    ]);
    const rgb = samplePattern([quad, ink], layout({ kind: 'damier', tileIds: ['a', 'b'] }), d, z, 'majoritaire');
    expect(gridOf(rgb, 4, 4)).toEqual([
      [R, G, INK, INK],
      [B, W, INK, INK],
      [INK, INK, R, G],
      [INK, INK, B, W],
    ]);
  });

  it('reproduit la rotation aléatoire pour une même graine', () => {
    const wide = dims({ needles: 8, legRows: 8 });
    const settings = layout({ kind: 'rotation-aleatoire', tileStitches: 2, tileRows: 2, seed: 7 });
    const first = samplePattern([quad], settings, wide, zones(), 'majoritaire');
    const second = samplePattern([quad], settings, wide, zones(), 'majoritaire');
    expect(Array.from(second)).toEqual(Array.from(first));
    const other = samplePattern([quad], { ...settings, seed: 8 }, wide, zones(), 'majoritaire');
    expect(Array.from(other)).not.toEqual(Array.from(first));
  });

  it('pose une colonne de joint', () => {
    const rgb = samplePattern(
      [quad],
      layout({ tileStitches: 2, gapStitches: 1, gapRows: 0, gapColor: GAP }),
      dims({ needles: 3, legRows: 2 }),
      z,
      'majoritaire',
    );
    expect(gridOf(rgb, 3, 2)).toEqual([
      [R, G, GAP],
      [B, W, GAP],
    ]);
  });

  it('applique la rotation globale et le décalage', () => {
    const rotated = samplePattern([quad], layout({ rotation: 90 }), dims({ needles: 2, legRows: 2 }), z, 'majoritaire');
    expect(gridOf(rotated, 2, 2)).toEqual([
      [B, R],
      [W, G],
    ]);
    const shifted = samplePattern(
      [quad],
      layout({ offsetStitches: 1 }),
      dims({ needles: 2, legRows: 2 }),
      z,
      'majoritaire',
    );
    expect(gridOf(shifted, 2, 2)).toEqual([
      [G, R],
      [W, B],
    ]);
  });

  it('moyenne les échantillons d’une maille', () => {
    const rgb = samplePattern([quad], layout({ tileStitches: 1, tileRows: 1 }), dims({ needles: 1, legRows: 1 }), z, 'moyenne');
    expect(gridOf(rgb, 1, 1)).toEqual([['#808080']]);
  });

  it('remplace les pixels transparents par le fond du carreau', () => {
    const tile = makeTile('t', [[R, G]], [[0, 255]]);
    const rgb = samplePattern(
      [tile],
      layout({ tileIds: ['t'], tileStitches: 2, tileRows: 1 }),
      dims({ needles: 2, legRows: 1 }),
      z,
      'majoritaire',
    );
    expect(gridOf(rgb, 2, 1)).toEqual([[G, G]]);
    const blank = makeTile('e', [['#010101']], [[0]]);
    const fallback = samplePattern(
      [blank],
      layout({ tileIds: ['e'], tileStitches: 1, tileRows: 1 }),
      dims({ needles: 1, legRows: 1 }),
      z,
      'majoritaire',
    );
    expect(gridOf(fallback, 1, 1)).toEqual([['#f4f1ea']]);
  });

  it('n’échantillonne le pied que si le motif y continue', () => {
    const withFoot = dims({ legRows: 2, footRows: 2 });
    const off = samplePattern([quad], layout(), withFoot, zones({ patternOnFoot: false }), 'majoritaire');
    const on = samplePattern([quad], layout(), withFoot, zones({ patternOnFoot: true }), 'majoritaire');
    expect(off.length).toBe(4 * 2 * 3);
    expect(on.length).toBe(4 * 4 * 3);
  });

  it('échantillonne 200 × 600 mailles en moins de 400 ms', () => {
    const size = 32;
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = i % 251;
      rgba[i * 4 + 1] = (i * 3) % 251;
      rgba[i * 4 + 2] = (i * 7) % 251;
      rgba[i * 4 + 3] = 255;
    }
    const tile: TileAsset = { id: 'n', name: 'n', source: 'png', width: size, height: size, rgba };
    const large = dims({ needles: 200, legRows: 600 });
    const started = performance.now();
    const rgb = samplePattern(
      [tile],
      layout({ tileIds: ['n'], tileStitches: 20, tileRows: 20, kind: 'grille' }),
      large,
      zones(),
      'majoritaire',
    );
    const elapsed = performance.now() - started;
    expect(rgb.length).toBe(200 * 600 * 3);
    // Budget 200 ms, marge ×2 tolérée en CI.
    expect(elapsed).toBeLessThan(400);
  });
});
