import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../../src/core/color';
import { quantize } from '../../src/core/quantize';
import type { QuantizeSettings } from '../../src/core/types';

const RED = '#ff0000';
const GREEN = '#00ff00';
const BLUE = '#0000ff';

function settings(partial: Partial<QuantizeSettings> = {}): QuantizeSettings {
  return {
    maxColors: 4,
    paletteMode: 'auto',
    palette: [],
    sampling: 'majoritaire',
    despeckle: false,
    maxFloat: 7,
    ...partial,
  };
}

function image(rows: string[][]): { rgb: Uint8ClampedArray; width: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = hexToRgb(rows[y]?.[x] ?? '#000000');
      const i = (y * width + x) * 3;
      rgb[i] = pixel.r;
      rgb[i + 1] = pixel.g;
      rgb[i + 2] = pixel.b;
    }
  }
  return { rgb, width };
}

function at(result: { palette: string[]; indices: Uint8Array }, width: number, col: number, row: number): string {
  return result.palette[result.indices[row * width + col] ?? 0] ?? '';
}

describe('réduction de couleurs', () => {
  const bands = image([
    [RED, RED, GREEN, GREEN, BLUE, BLUE],
    [RED, RED, GREEN, GREEN, BLUE, BLUE],
    [RED, RED, GREEN, GREEN, BLUE, BLUE],
    [RED, RED, GREEN, GREEN, BLUE, BLUE],
  ]);

  it('retrouve 3 couleurs pures quand N = 3, et 2 couleurs quand N = 2', () => {
    const three = quantize(bands.rgb, bands.width, settings({ maxColors: 3, paletteMode: 'auto' }));
    expect(three.palette).toHaveLength(3);
    expect(new Set(three.palette)).toEqual(new Set([RED, GREEN, BLUE]));
    expect(three.counts).toHaveLength(3);
    expect(three.counts.reduce((sum, count) => sum + count, 0)).toBe(24);
    expect([...three.counts]).toEqual([...three.counts].sort((a, b) => b - a));

    const two = quantize(bands.rgb, bands.width, settings({ maxColors: 2, paletteMode: 'auto' }));
    expect(two.palette).toHaveLength(2);
    expect(two.indices.every((index) => index < 2)).toBe(true);
    expect(two.counts.reduce((sum, count) => sum + count, 0)).toBe(24);
  });

  it('respecte la palette manuelle et reste identique d’un appel à l’autre', () => {
    const { rgb, width } = image([
      ['#f40000', '#00ee00'],
      ['#0000f0', '#f40000'],
    ]);
    const manual = settings({
      paletteMode: 'manuelle',
      palette: [RED, GREEN, BLUE],
      maxColors: 3,
    });
    const first = quantize(rgb, width, manual);
    const second = quantize(rgb, width, manual);
    expect(at(first, width, 0, 0)).toBe(RED);
    expect(at(first, width, 1, 0)).toBe(GREEN);
    expect(at(first, width, 0, 1)).toBe(BLUE);
    expect(second.palette).toEqual(first.palette);
    expect(Array.from(second.indices)).toEqual(Array.from(first.indices));
    expect(second.counts).toEqual(first.counts);

    const autoA = quantize(bands.rgb, bands.width, settings({ maxColors: 2 }));
    const autoB = quantize(bands.rgb, bands.width, settings({ maxColors: 2 }));
    expect(autoB.palette).toEqual(autoA.palette);
    expect(Array.from(autoB.indices)).toEqual(Array.from(autoA.indices));
  });

  it('retire une maille isolée et conserve une ligne de deux mailles', () => {
    const isolated = image([
      [BLUE, BLUE, BLUE],
      [BLUE, RED, BLUE],
      [BLUE, BLUE, BLUE],
    ]);
    const cleaned = quantize(isolated.rgb, isolated.width, settings({
      paletteMode: 'manuelle',
      palette: [BLUE, RED],
      despeckle: true,
    }));
    expect(at(cleaned, isolated.width, 1, 1)).toBe(BLUE);

    const kept = quantize(isolated.rgb, isolated.width, settings({
      paletteMode: 'manuelle',
      palette: [BLUE, RED],
      despeckle: false,
    }));
    expect(at(kept, isolated.width, 1, 1)).toBe(RED);

    const pair = image([
      [BLUE, BLUE, BLUE, BLUE],
      [BLUE, RED, RED, BLUE],
      [BLUE, BLUE, BLUE, BLUE],
    ]);
    const stable = quantize(pair.rgb, pair.width, settings({
      paletteMode: 'manuelle',
      palette: [BLUE, RED],
      despeckle: true,
    }));
    expect(at(stable, pair.width, 1, 1)).toBe(RED);
    expect(at(stable, pair.width, 2, 1)).toBe(RED);
  });
});
