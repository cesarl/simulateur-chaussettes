import { describe, expect, it } from 'vitest';
import { cellAtStitch, seamColumn } from '../../src/core/calepinage';
import { geometryFromLayout } from '../../src/core/layout';
import { migrateLegacyKind } from '../../src/core/presets';
import type { LayoutSettings } from '../../src/core/types';

function baseLayout(partial: Partial<LayoutSettings> = {}): LayoutSettings {
  return {
    calepinage: migrateLegacyKind('grille'),
    tileIds: ['a'],
    tileStitches: 25,
    tileRows: 25,
    gapStitches: 0,
    gapRows: 0,
    gapColor: '#000000',
    offsetStitches: 0,
    offsetRows: 0,
    seam: 'dos',
    tilesAround: 6,
    tileSizeMode: 'free',
    ...partial,
  };
}

describe('position du raccord (T37)', () => {
  it('largeur 25 mailles, raccord dos → colonne coupée juste avant 42 (milieu du dos)', () => {
    const needles = 168;
    expect(seamColumn('dos', needles)).toBe(42);
    const geo = geometryFromLayout(baseLayout({ seam: 'dos', tileStitches: 25 }), needles);
    // Le début du motif (u≈0, cx du premier carreau utile) tombe sur la colonne de couture.
    const atSeam = cellAtStitch(geo, 42.01, 0.5);
    const justBefore = cellAtStitch(geo, 41.99, 0.5);
    expect(atSeam.u).toBeLessThan(0.05);
    // La colonne coupée (fin du carreau précédent) est juste avant 42, pas en 0.
    expect(justBefore.cx).not.toBe(atSeam.cx);
    const atZero = cellAtStitch(geo, 0.5, 0.5);
    expect(atZero.cx).not.toBe(0); // avec décalage dos, la colonne 0 n’est plus le début du motif
  });
});
