import { describe, expect, it } from 'vitest';
import {
  bumpCellNextTile,
  bumpCellRotate,
  cellFromPointer,
  cycleVariationsFirstToLast,
  bakePersoPreset,
  nextRot,
  parseCalepinagePerso,
  persoFingerprint,
  serializeCalepinagePerso,
  storedToOverrides,
  PERSO_PRESET_ID,
} from '../../src/core/motifPreviewEdit';
import { planPlacements } from '../../src/core/calepinage';
import { BUILTIN_PRESETS, resolvePreset, specFromCalepinageId } from '../../src/core/presets';
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

  it('serialize / parse / stored round-trip', () => {
    let map = new Map();
    map = bumpCellRotate(map, 0, 0);
    map = bumpCellNextTile(map, 1, 1);
    map = bumpCellNextTile(map, 1, 1);
    const perso = serializeCalepinagePerso(4, 90, map);
    expect(perso).not.toBeNull();
    expect(perso!.rotationGlobale).toBe(90);
    expect(perso!.overrides).toEqual([
      { cx: 0, cy: 0, rotAdd: 90, tileDelta: 0 },
      { cx: 1, cy: 1, rotAdd: 0, tileDelta: 2 },
    ]);
    const again = parseCalepinagePerso(JSON.parse(JSON.stringify(perso)));
    expect(again).toEqual(perso);
    expect(storedToOverrides(again!.overrides).get('0,0')).toEqual({ rotAdd: 90, tileDelta: 0 });
    expect(serializeCalepinagePerso(4, 0, new Map())).toBeNull();
    expect(parseCalepinagePerso(null)).toBeNull();
    expect(parseCalepinagePerso({ cells: 4, rotationGlobale: 0, overrides: 'x' })).toBeNull();
  });

  it('bakePersoPreset applique rot + tileDelta', () => {
    const base = specFromCalepinageId('g-unique', 1, 0);
    let map = new Map();
    map = bumpCellRotate(map, 0, 0);
    map = bumpCellNextTile(map, 0, 0);
    const perso = serializeCalepinagePerso(2, 0, map)!;
    const baked = bakePersoPreset(base, perso, 3, BUILTIN_PRESETS);
    expect(baked.id).toBe(PERSO_PRESET_ID);
    expect(baked.blockW).toBe(2);
    expect(baked.blockH).toBe(2);
    // Case (0,0) : tile 0 +1 = 1, rot 0 +90 = 90
    expect(baked.cells[0]).toEqual({ tile: 1, rot: 90 });
    const plan = planPlacements(
      { ...base, source: 'prereglage', presetId: PERSO_PRESET_ID, rotationGlobale: 0 },
      { tileCount: 3, preset: baked, tilesAround: 2 },
      2,
      2,
    );
    expect(plan[0]!.tile).toBe(1);
    expect(plan[0]!.rot).toBe(90);
    expect(resolvePreset({ ...base, source: 'prereglage', presetId: PERSO_PRESET_ID }, [baked])).toBe(
      baked,
    );
  });

  it('persoFingerprint stable', () => {
    const a = parseCalepinagePerso({
      cells: 4,
      rotationGlobale: 0,
      overrides: [{ cx: 0, cy: 0, rotAdd: 90, tileDelta: 1 }],
    });
    const b = parseCalepinagePerso({
      cells: 4,
      rotationGlobale: 0,
      overrides: [{ cx: 0, cy: 0, rotAdd: 90, tileDelta: 1 }],
    });
    expect(persoFingerprint(a)).toBe(persoFingerprint(b));
    expect(persoFingerprint(a)).toContain('rotAdd');
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
