import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colorDistance, hexToRgb, rgbToHex } from '../../src/core/color';
import { buildZoneMap, composeGrid, rowRanges } from '../../src/core/grid';
import { defaultDimensions, totalRows } from '../../src/core/sizes';
import { Zone, type ZoneSettings } from '../../src/core/types';

function zones(partial: Partial<ZoneSettings> = {}): ZoneSettings {
  return {
    cuffEnabled: true,
    cuffColor: '#112233',
    heelColor: '#445566',
    toeColor: '#778899',
    patternOnFoot: false,
    footColor: '#aabbcc',
    heelHeightMm: 55,
    heelDepthMm: 72,
    heelSpread: 100,
    ...partial,
  };
}

describe('couleurs', () => {
  it('convertit le hexadécimal et le RVB', () => {
    expect(hexToRgb('#b5462f')).toEqual({ r: 181, g: 70, b: 47 });
    expect(hexToRgb('#B5462F')).toEqual({ r: 181, g: 70, b: 47 });
    expect(rgbToHex(181, 70, 47)).toBe('#b5462f');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(15.4, 255.6, -2)).toBe('#0fff00');
  });

  it('mesure une distance perceptuelle nulle pour la même couleur', () => {
    const rouge = hexToRgb('#ff0000');
    const proche = hexToRgb('#fe0100');
    const bleu = hexToRgb('#0000ff');
    expect(colorDistance(rouge, rouge)).toBe(0);
    expect(colorDistance(rouge, proche)).toBeGreaterThan(0);
    expect(colorDistance(rouge, proche)).toBeLessThan(colorDistance(rouge, bleu));
  });
});

describe('grille de zones', () => {
  it('a une hauteur égale à la somme des zones', () => {
    const dims = defaultDimensions('homme');
    const z = zones();
    const ranges = rowRanges(dims, z);
    expect(ranges.cuff.end - ranges.cuff.start).toBe(dims.cuffRows);
    expect(ranges.leg.end - ranges.leg.start).toBe(dims.legRows);
    expect(ranges.heel.end - ranges.heel.start).toBe(dims.heelRows);
    expect(ranges.foot.end - ranges.foot.start).toBe(dims.footRows);
    expect(ranges.toe.end - ranges.toe.start).toBe(dims.toeRows);
    expect(ranges.toe.end).toBe(totalRows(dims, true));
    expect(ranges.cuff.start).toBe(0);
    expect(ranges.leg.start).toBe(ranges.cuff.end);
    expect(ranges.heel.start).toBe(ranges.leg.end);
    expect(ranges.foot.start).toBe(ranges.heel.end);
    expect(ranges.toe.start).toBe(ranges.foot.end);

    const grid = composeGrid(dims, z, null, []);
    expect(grid.width).toBe(dims.needles);
    expect(grid.height).toBe(totalRows(dims, true));
    expect(grid.zone.length).toBe(grid.width * grid.height);
    expect(grid.colorIndex.length).toBe(grid.width * grid.height);
  });

  it('place la ligne 0 dans la tige quand le bord-côte est absent', () => {
    const dims = defaultDimensions('femme');
    const z = zones({ cuffEnabled: false });
    const ranges = rowRanges(dims, z);
    expect(ranges.cuff.end - ranges.cuff.start).toBe(0);
    expect(ranges.leg.start).toBe(0);

    const map = buildZoneMap(dims, z);
    expect(map[0]).toBe(Zone.Leg);
    for (let c = 0; c < dims.needles; c++) expect(map[c]).toBe(Zone.Leg);

    const grid = composeGrid(dims, z, null, []);
    expect(grid.height).toBe(totalRows(dims, false));
    expect(grid.zone[0]).toBe(Zone.Leg);
    expect(grid.palette).not.toContain(z.cuffColor);
  });

  it('active exactement needles/2 mailles sur chaque rang de talon', () => {
    const dims = defaultDimensions('homme');
    const z = zones();
    const ranges = rowRanges(dims, z);
    const map = buildZoneMap(dims, z);
    const half = dims.needles / 2;

    for (let r = ranges.heel.start; r < ranges.heel.end; r++) {
      let active = 0;
      for (let c = 0; c < dims.needles; c++) {
        const zone = map[r * dims.needles + c];
        if (c < half) {
          expect(zone).toBe(Zone.Heel);
          active += 1;
        } else {
          expect(zone).toBe(Zone.Empty);
        }
      }
      expect(active).toBe(half);
    }

    for (let r = ranges.toe.start; r < ranges.toe.end; r++) {
      let active = 0;
      for (let c = 0; c < dims.needles; c++) {
        const zone = map[r * dims.needles + c];
        if (c < half) {
          expect(zone).toBe(Zone.Toe);
          active += 1;
        } else {
          expect(zone).toBe(Zone.Empty);
        }
      }
      expect(active).toBe(half);
    }
  });

  it('inclut les couleurs de zones sans doublon', () => {
    const dims = defaultDimensions('homme');
    const z = zones({
      cuffColor: '#aa0000',
      heelColor: '#00aa00',
      toeColor: '#0000aa',
      footColor: '#aa0000',
    });
    const grid = composeGrid(dims, z, null, ['#112233', '#AA0000']);
    for (const color of [z.cuffColor, z.heelColor, z.toeColor, z.footColor, '#112233']) {
      expect(grid.palette).toContain(color);
    }
    expect(new Set(grid.palette).size).toBe(grid.palette.length);
    expect(grid.palette.every((c) => c === c.toLowerCase())).toBe(true);

    const ranges = rowRanges(dims, z);
    const foot = ranges.foot.start * dims.needles;
    expect(grid.palette[grid.colorIndex[foot]!]).toBe(z.footColor);
    const heel = ranges.heel.start * dims.needles;
    expect(grid.palette[grid.colorIndex[heel]!]).toBe(z.heelColor);
  });

  it('peint les zones motif avec la palette fournie', () => {
    const dims = defaultDimensions('femme');
    dims.cuffRows = 1;
    dims.legRows = 2;
    dims.heelRows = 1;
    dims.footRows = 2;
    dims.toeRows = 1;
    dims.needles = 4;
    const z = zones({ patternOnFoot: true, cuffColor: '#010101', heelColor: '#020202', toeColor: '#030303' });
    const palette = ['#ff0000', '#00ff00'];
    // Motif : 2 rangs de tige (4) + 2 rangs de pied (4) = 16 mailles.
    const pattern = new Uint8Array([0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0]);
    const grid = composeGrid(dims, z, pattern, palette);

    const ranges = rowRanges(dims, z);
    const at = (row: number, col: number) => grid.palette[grid.colorIndex[row * grid.width + col]!]!;
    expect(at(ranges.leg.start, 0)).toBe('#ff0000');
    expect(at(ranges.leg.start, 1)).toBe('#00ff00');
    expect(at(ranges.foot.start, 0)).toBe('#ff0000');
    expect(at(ranges.foot.start, 2)).toBe('#00ff00');
    expect(grid.palette).not.toContain(z.footColor);
    expect(new Set(grid.palette).size).toBe(grid.palette.length);
  });
});

describe('pureté de src/core', () => {
  it('n’importe ni le DOM ni Three.js', () => {
    const files = readdirSync('src/core').filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(`src/core/${name}`, 'utf8');
      expect(source, name).not.toMatch(/from ['"]three/);
      expect(source, name).not.toMatch(/\b(document|window|HTMLCanvasElement|HTMLElement)\b/);
    }
  });
});
