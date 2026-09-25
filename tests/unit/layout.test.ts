import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHex } from '../../src/core/color';
import { migrateLegacyKind } from '../../src/core/presets';
import {
  layoutRaccord,
  motifRows,
  nearestFittingWidth,
  repeatWidth,
  samplePattern,
  seamMismatch,
  tileRowsForWidth,
} from '../../src/core/layout';
import { defaultDimensions, stitchAspect } from '../../src/core/sizes';
import type { LayoutSettings, SockDimensions, TileAsset, ZoneSettings } from '../../src/core/types';
import type { Rot } from '../../src/core/calepinage';

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

function layout(
  partial: Partial<LayoutSettings> & { kind?: string; rotation?: Rot; seed?: number } = {},
): LayoutSettings {
  const { kind, rotation, seed, calepinage, ...rest } = partial;
  return {
    calepinage: calepinage ?? migrateLegacyKind(kind ?? 'grille', seed ?? 1, rotation ?? 0),
    tileIds: ['a'],
    tileStitches: 2,
    tileRows: 2,
    gapStitches: 0,
    gapRows: 0,
    gapColor: GAP,
    offsetStitches: 0,
    offsetRows: 0,
    seam: 'dos',
    tilesAround: 6,
    tileSizeMode: 'around',
    ...rest,
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
    expect(repeatWidth(fitting, needles)).toBe(12);
    expect(needles % 12).toBe(0);
    expect(seamMismatch(fitting, needles)).toBe(0);
    expect(seamMismatch(layout({ tileStitches: 10, gapStitches: 0 }), needles)).not.toBe(0);

    const fitted = nearestFittingWidth(layout({ tileStitches: 10, gapStitches: 0, kind: 'grille' }), 24);
    expect(24 % fitted).toBe(0);
    expect(fitted).toBe(12);
    expect(repeatWidth(layout({ kind: 'rotation-4', tileStitches: 5, gapStitches: 1 }), 168, 1)).toBe(12);
    // damier V1 → suite (pas 1) : période = nombre de motifs (1 ici) × pitch
    expect(repeatWidth(layout({ kind: 'damier', tileStitches: 4, gapStitches: 0 }), 168, 1)).toBe(4);
    expect(layoutRaccord(fitting, needles, 1).seamless).toBe(true);
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
    expect(gridOf(rgb, 4, 4)[0]).toEqual([R, G, R, G]);
    // rangée de carreaux 1 (rangs 2–3) : décalage demi-case
    expect(read(rgb, 4, 0, 2)).toBe(G);
  });

  it('décale les colonnes impaires d’une demi-hauteur en quinconce vertical', () => {
    const rgb = samplePattern([quad], layout({ kind: 'quinconce-v' }), d, z, 'majoritaire');
    expect(read(rgb, 4, 0, 0)).toBe(R);
    expect(read(rgb, 4, 2, 0)).toBe(B);
  });

  it('applique les 4 rotations du bloc 2×2 (rosace)', () => {
    const rgb = samplePattern([quad], layout({ kind: 'rotation-4' }), d, z, 'majoritaire');
    // HG 90°, HD 180° sur la première rangée de cases
    expect(read(rgb, 4, 0, 0)).not.toBe(read(rgb, 4, 2, 0));
  });

  it('applique les miroirs du bloc 2×2', () => {
    const rgb = samplePattern([quad], layout({ kind: 'miroir-4' }), d, z, 'majoritaire');
    expect(read(rgb, 4, 0, 0)).toBe(R);
    expect(read(rgb, 4, 3, 0)).toBe(R); // miroir H de G→R? wait - flipX of col1
  });

  it('alterne deux carreaux en suite (ex-damier)', () => {
    const ink = makeTile('b', [
      [INK, INK],
      [INK, INK],
    ]);
    const rgb = samplePattern([quad, ink], layout({ kind: 'damier', tileIds: ['a', 'b'] }), d, z, 'majoritaire');
    expect(read(rgb, 4, 0, 0)).toBe(R);
    expect(read(rgb, 4, 2, 0)).toBe(INK);
  });

  it('la rotation aléatoire est reproductible et change avec la graine', () => {
    const settings = layout({ kind: 'rotation-aleatoire', tileStitches: 2, tileRows: 2, seed: 7 });
    const wide = dims({ needles: 8, legRows: 4 });
    const a = samplePattern([quad], settings, wide, zones(), 'majoritaire');
    const b = samplePattern([quad], settings, wide, zones(), 'majoritaire');
    expect(a).toEqual(b);
    const other = samplePattern(
      [quad],
      layout({ kind: 'rotation-aleatoire', tileStitches: 2, tileRows: 2, seed: 8 }),
      wide,
      zones(),
      'majoritaire',
    );
    expect(a).not.toEqual(other);
  });

  it('applique la rotation globale', () => {
    const rotated = samplePattern(
      [quad],
      layout({ rotation: 90 }),
      dims({ needles: 2, legRows: 2 }),
      z,
      'majoritaire',
    );
    expect(read(rotated, 2, 0, 0)).toBe(B);
  });

  it('remplit le joint avec sa couleur', () => {
    const rgb = samplePattern(
      [quad],
      layout({ tileStitches: 2, tileRows: 2, gapStitches: 1, gapRows: 0 }),
      dims({ needles: 3, legRows: 2 }),
      z,
      'majoritaire',
    );
    expect(read(rgb, 3, 2, 0)).toBe(GAP);
  });

  it('remplace la transparence par le fond du carreau', () => {
    const transparent = makeTile(
      't',
      [
        [R, G],
        [B, W],
      ],
      [
        [255, 0],
        [255, 255],
      ],
    );
    const rgb = samplePattern(
      [transparent],
      layout({ tileIds: ['t'], tileStitches: 2, tileRows: 2 }),
      dims({ needles: 2, legRows: 2 }),
      z,
      'majoritaire',
    );
    expect(read(rgb, 2, 1, 0)).toBe(R);
  });

  it('tient le budget sur une grande grille', () => {
    const noise = makeTile(
      'n',
      Array.from({ length: 32 }, (_, y) =>
        Array.from({ length: 32 }, (_, x) => rgbToHex((x * 7 + y * 13) % 256, y % 256, x % 256)),
      ),
    );
    const big = dims({ needles: 200, legRows: 600 });
    const started = performance.now();
    samplePattern(
      [noise],
      layout({ tileIds: ['n'], tileStitches: 20, tileRows: 20, kind: 'grille' }),
      big,
      z,
      'majoritaire',
    );
    expect(performance.now() - started).toBeLessThan(600);
  });
});
