/**
 * T51 — pile de calques : cache motifLayerRgb, undo/redo, équivalence projet V6.
 */
import { describe, expect, it } from 'vitest';
import { composeGrid, gridFingerprint } from '../../src/core/grid';
import {
  migrateDesignV1,
  newFondLayer,
  newMotifLayer,
  normalizeStack,
} from '../../src/core/layers';
import { createMotifRgbCache, computeStackRgb } from '../../src/core/stackCompute';
import { quantize } from '../../src/core/quantize';
import { BUILTIN_PRESETS } from '../../src/core/presets';
import { parseProject, serializeProject } from '../../src/io/project';
import {
  addMotifLayer,
  canUndo,
  defaultDesign,
  defaultDesignV1,
  defaultMotifLayout,
  getState,
  redo,
  resetState,
  undo,
} from '../../src/state';
import type { TileAsset } from '../../src/core/types';

function solidTile(id: string, rgb: [number, number, number]): TileAsset {
  const size = 8;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba.set([...rgb, 255], i * 4);
  }
  return { id, name: id, source: 'png', width: size, height: size, rgba };
}

function fingerprintStack(
  design: Parameters<typeof computeStackRgb>[0]['design'],
  tiles: TileAsset[],
): string {
  const cache = createMotifRgbCache();
  const { rgb } = computeStackRgb({ design, tiles, presets: BUILTIN_PRESETS, cache });
  const q = quantize(rgb!, design.dimensions.needles, design.quantize);
  return gridFingerprint(composeGrid(design.dimensions, design.zones, q.indices, q.palette));
}

describe('T51 — calques / cache / historique', () => {
  it('projet V6 migré puis relu : même empreinte de grille', async () => {
    const v1 = defaultDesignV1();
    const tile = solidTile('t1', [200, 40, 40]);
    v1.layout.tileIds = ['t1'];
    v1.name = 'V6-fixture';
    const migrated = migrateDesignV1(v1, {
      collectionId: null,
      zoneColors: null,
      paletteOptionId: null,
      tileIds: ['t1'],
    });
    migrated.quantize = { ...migrated.quantize, paletteFromLayers: false };
    const fpDirect = fingerprintStack(migrated, [tile]);

    const stored = await serializeProject(migrated, [tile]);
    const back = await parseProject(stored);
    expect(fingerprintStack(back.design, back.tiles)).toBe(fpDirect);
  });

  it('masquer / réordonner / transparence ne recalcule pas motifLayerRgb', () => {
    const tileA = solidTile('a', [220, 30, 30]);
    const tileB = solidTile('b', [30, 30, 220]);
    const layout = defaultMotifLayout();
    const design = {
      ...defaultDesign(),
      layers: normalizeStack([
        newFondLayer('#f1e9dc'),
        newMotifLayer('motif-1', { kind: 'importes', tileIds: ['a'] }, layout, 'A'),
        newMotifLayer('motif-2', { kind: 'importes', tileIds: ['b'] }, { ...layout, offsetStitches: 10 }, 'B'),
      ]),
    };
    const cache = createMotifRgbCache();
    computeStackRgb({ design, tiles: [tileA, tileB], presets: BUILTIN_PRESETS, cache });
    expect(cache.stats.motifRgbComputes).toBe(2);
    cache.resetStats();

    const hidden = {
      ...design,
      layers: design.layers.map((l) => (l.id === 'motif-2' ? { ...l, hidden: true } : l)),
    };
    computeStackRgb({ design: hidden, tiles: [tileA, tileB], presets: BUILTIN_PRESETS, cache });
    expect(cache.stats.motifRgbComputes).toBe(0);

    const reordered = {
      ...design,
      layers: normalizeStack([design.layers[0]!, design.layers[2]!, design.layers[1]!]),
    };
    computeStackRgb({ design: reordered, tiles: [tileA, tileB], presets: BUILTIN_PRESETS, cache });
    expect(cache.stats.motifRgbComputes).toBe(0);

    const transparent = {
      ...design,
      layers: design.layers.map((l) =>
        l.id === 'motif-1' ? { ...l, transparentColors: ['#dc1e1e'] } : l,
      ),
    };
    computeStackRgb({ design: transparent, tiles: [tileA, tileB], presets: BUILTIN_PRESETS, cache });
    expect(cache.stats.motifRgbComputes).toBe(0);
  });

  it('annuler / rétablir un ajout de calque', () => {
    resetState();
    expect(getState().design.layers).toHaveLength(2);
    addMotifLayer({ kind: 'importes', tileIds: [] }, defaultMotifLayout(), 'Extra');
    expect(getState().design.layers).toHaveLength(3);
    expect(canUndo()).toBe(true);
    undo();
    expect(getState().design.layers).toHaveLength(2);
    redo();
    expect(getState().design.layers).toHaveLength(3);
  });
});
