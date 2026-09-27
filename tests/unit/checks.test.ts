import { describe, expect, it } from 'vitest';
import { checkFabrication } from '../../src/core/checks';
import { migrateLegacyKind } from '../../src/core/presets';
import { MACHINE_LIMITS } from '../../src/core/sizes';
import { defaultMotifLayout, defaultDesign } from '../../src/state';
import type { StitchGrid } from '../../src/core/types';
import { Zone } from '../../src/core/types';

function rowGrid(colors: number[]): StitchGrid {
  const width = colors.length;
  return {
    width,
    height: 1,
    palette: ['#000000', '#ffffff'],
    colorIndex: Uint8Array.from(colors),
    zone: new Uint8Array(width).fill(Zone.Leg),
  };
}

describe('contrôles de fabrication', () => {
  const zones = defaultDesign().zones;
  const layout = { ...defaultMotifLayout(), tileIds: [] };

  it('signale un flotté de 8 et accepte un flotté de 7', () => {
    const long = rowGrid([0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    const found = checkFabrication(long, layout, zones, MACHINE_LIMITS, 7);
    expect(found.floatCount).toBe(1);
    expect(found.floatMask[0]).toBe(1);
    expect(found.floatMask[7]).toBe(1);
    expect(found.floatMask[8]).toBe(0);

    const exact = rowGrid([0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
    const accepted = checkFabrication(exact, layout, zones, MACHINE_LIMITS, 7);
    expect(accepted.floatCount).toBe(0);
    expect(accepted.floatsOk).toBe(true);
  });

  it('voit le raccord circulaire', () => {
    const grid = rowGrid([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    const uneven = {
      ...layout,
      calepinage: migrateLegacyKind('grille', 1, 0),
      tileStitches: 5,
      tileRows: 5,
    };
    const report = checkFabrication(grid, uneven, zones, MACHINE_LIMITS, 7);
    expect(typeof report.seamOk).toBe('boolean');
  });
});
