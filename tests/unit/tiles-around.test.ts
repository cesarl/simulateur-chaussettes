import { describe, expect, it } from 'vitest';
import {
  cellAtStitch,
  raccord,
  tileRowsFor,
  tileWidthForCount,
  type TileGeometry,
} from '../../src/core/calepinage';
import { migrateLegacyKind } from '../../src/core/presets';

describe('carreaux sur le tour (T36)', () => {
  it('5 carreaux sur 168 aiguilles → aucune colonne coupée (col 0 prolonge col 167)', () => {
    const needles = 168;
    const count = 5;
    const w = tileWidthForCount(needles, count);
    expect(w).toBeCloseTo(33.6, 6);

    const geo: TileGeometry = {
      needles,
      tileStitches: w,
      tileRows: tileRowsFor(w, 7.5, 10),
      gapStitches: 0,
      gapRows: 0,
      offsetStitches: 0,
      offsetRows: 0,
      appareil: 'droit',
    };
    const info = raccord(geo, migrateLegacyKind('grille'), count);
    expect(info.seamless).toBe(true);
    expect(info.tilesAround).toBe(5);

    // Bord droit de la colonne 167 (fin du tour) et bord gauche de la colonne 0 :
    // u passe de ~1 à ~0 en changeant de carreau (4 → 0), sans coupe au milieu d’un carreau.
    const left = cellAtStitch(geo, 167.999, 0.5);
    const right = cellAtStitch(geo, 0.001, 0.5);
    expect(left.gap).toBe(false);
    expect(right.gap).toBe(false);
    expect(left.u).toBeGreaterThan(0.99);
    expect(right.u).toBeLessThan(0.01);
    expect(left.cx).toBe(4);
    expect(right.cx).toBe(0);
  });
});
