/**
 * T54 — dock des calques : carreaux par collection et limite de 16 calques.
 */
import { describe, expect, it } from 'vitest';
import { collectionTiles, computeStackRgb, createMotifRgbCache } from '../../src/core/stackCompute';
import { newFondLayer, newMotifLayer, normalizeStack } from '../../src/core/layers';
import { BUILTIN_PRESETS } from '../../src/core/presets';
import {
  addImageLayer,
  addMotifLayer,
  defaultDesign,
  defaultMotifLayout,
  duplicateLayer,
  editingLayoutSettings,
  getState,
  MAX_LAYERS,
  MAX_LAYERS_MESSAGE,
  resetState,
  selectLayer,
} from '../../src/state';
import type { TileAsset } from '../../src/core/types';

function solidTile(id: string, name: string, rgb: [number, number, number]): TileAsset {
  const size = 8;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) rgba.set([...rgb, 255], i * 4);
  return { id, name, source: 'png', width: size, height: size, rgba };
}

describe('T54 — carreaux par collection', () => {
  const medina = solidTile('t1', 'medina-VAR1', [200, 40, 40]);
  const dunes = solidTile('t2', 'Dunes-VAR1', [40, 80, 200]);

  it('un calque de collection ne prend que les carreaux de sa collection', () => {
    expect(collectionTiles('medina', [medina, dunes]).map((t) => t.id)).toEqual(['t1']);
    expect(collectionTiles('dunes', [medina, dunes]).map((t) => t.id)).toEqual(['t2']);
  });

  it('repli sur tous les carreaux quand aucun nom ne correspond (comportement V6)', () => {
    expect(collectionTiles('medina', [dunes]).map((t) => t.id)).toEqual(['t2']);
    expect(collectionTiles('medina', []).map((t) => t.id)).toEqual([]);
  });

  it('deux calques Motif de collections différentes donnent deux couleurs', () => {
    const design = {
      ...defaultDesign(),
      quantize: { ...defaultDesign().quantize, paletteFromLayers: false, paletteMode: 'auto' as const, maxColors: 4 },
      layers: normalizeStack([
        newFondLayer('#ffffff'),
        newMotifLayer('motif-a', { kind: 'collection', collectionId: 'medina', colors: {}, paletteId: null }, defaultMotifLayout(), 'Medina'),
        newMotifLayer(
          'motif-b',
          { kind: 'collection', collectionId: 'Dunes', colors: {}, paletteId: null },
          { ...defaultMotifLayout(), tilesAround: 3 },
          'Dunes',
        ),
      ]),
    };
    const { rgb } = computeStackRgb({
      design,
      tiles: [medina, dunes],
      presets: BUILTIN_PRESETS,
      cache: createMotifRgbCache(),
    });
    expect(rgb).not.toBeNull();
    // Le calque du dessus (Dunes, bleu) couvre tout : sa couleur est la seule visible.
    expect([rgb![0], rgb![1], rgb![2]]).toEqual([40, 80, 200]);
  });

  it('editingLayoutSettings ne liste que les carreaux du Motif sélectionné', () => {
    resetState();
    const id = addMotifLayer(
      { kind: 'collection', collectionId: 'medina', colors: {}, paletteId: null },
      defaultMotifLayout(),
      'Medina',
      [medina, dunes],
    );
    expect(id).not.toBeNull();
    selectLayer(id);
    expect(editingLayoutSettings().tileIds).toEqual(['t1']);
  });
});

describe('T54 — 16 calques au maximum', () => {
  it('refuse l’ajout au-delà de 16 calques, avec message', () => {
    resetState();
    while (getState().design.layers.length < MAX_LAYERS) {
      const id = addMotifLayer({ kind: 'importes', tileIds: [] }, defaultMotifLayout(), 'Motif');
      expect(id).not.toBeNull();
    }
    expect(getState().design.layers).toHaveLength(MAX_LAYERS);

    expect(addMotifLayer({ kind: 'importes', tileIds: [] })).toBeNull();
    expect(addImageLayer({ kind: 'collection', collectionId: 'medina', variation: 'VAR1' })).toBeNull();
    expect(getState().error).toBe(MAX_LAYERS_MESSAGE);
    expect(getState().design.layers).toHaveLength(MAX_LAYERS);

    duplicateLayer(getState().design.layers[1]!.id);
    expect(getState().design.layers).toHaveLength(MAX_LAYERS);
  });

  it('identifiants de calques déterministes', () => {
    resetState();
    const first = addMotifLayer({ kind: 'importes', tileIds: [] });
    const second = addMotifLayer({ kind: 'importes', tileIds: [] });
    const image = addImageLayer({ kind: 'collection', collectionId: 'medina', variation: 'VAR1' });
    expect([first, second, image]).toEqual(['motif-2', 'motif-3', 'image-1']);
  });
});
