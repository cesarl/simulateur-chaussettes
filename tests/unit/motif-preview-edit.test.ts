import { describe, expect, it } from 'vitest';
import {
  bumpCellNextTile,
  bumpCellRotate,
  cellFromPointer,
  cycleVariationsFirstToLast,
  nextRot,
} from '../../src/core/motifPreviewEdit';
import { specFromCalepinageId } from '../../src/core/presets';
import { GENERATED_PRESETS } from '../../src/core/calepinage';

describe('motifPreviewEdit', () => {
  it('nextRot tourne de 90°', () => {
    expect(nextRot(0)).toBe(90);
    expect(nextRot(270)).toBe(0);
  });

  it('bumpCellRotate / bumpCellNextTile', () => {
    let map = new Map();
    map = bumpCellRotate(map, 1, 2);
    expect(map.get('1,2')).toEqual({ rotAdd: 90, tileDelta: 0 });
    map = bumpCellNextTile(map, 1, 2);
    expect(map.get('1,2')).toEqual({ rotAdd: 90, tileDelta: 1 });
  });

  it('cellFromPointer', () => {
    expect(cellFromPointer(10, 10, 400, 4)).toEqual({ cx: 0, cy: 0 });
    expect(cellFromPointer(250, 150, 400, 4)).toEqual({ cx: 2, cy: 1 });
    expect(cellFromPointer(-1, 0, 400, 4)).toBeNull();
  });

  it('cycleVariationsFirstToLast', () => {
    expect(cycleVariationsFirstToLast(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
    expect(cycleVariationsFirstToLast(['a'])).toEqual(['a']);
  });
});

describe('specFromCalepinageId', () => {
  it('résout g-suite et legacy grille', () => {
    const suite = specFromCalepinageId('g-suite');
    expect(suite.source).toBe('genere');
    expect(suite.genere.ordre).toBe('suite');
    const grille = specFromCalepinageId('grille');
    expect(grille.source).toBe('genere');
    expect(grille.genere.ordre).toBe('unique');
  });

  it('damier = preset JSON (pas legacy suite)', () => {
    const d = specFromCalepinageId('damier');
    expect(d.source).toBe('prereglage');
    expect(d.presetId).toBe('damier');
  });

  it('tous les GENERATED_PRESETS sont résolus', () => {
    for (const g of GENERATED_PRESETS) {
      const s = specFromCalepinageId(g.id);
      expect(s.source).toBe('genere');
      expect(s.genere).toEqual(g.genere);
    }
  });
});
