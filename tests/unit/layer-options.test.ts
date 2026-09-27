/**
 * T55 — options du calque sélectionné : couleur du Fond, étendue d’un Motif (bande),
 * couleurs transparentes, réglages d’un calque Image.
 * L’effet visible (une maille blanche devient la couleur du Fond) est vérifié par `renderStack`.
 */
import { describe, expect, it } from 'vitest';
import {
  renderStack,
  setMotifBand,
  stackGauge,
  type MotifLayer,
  type StackLayer,
} from '../../src/core/layers';
import {
  addImageLayer,
  addMotifLayer,
  defaultMotifLayout,
  getState,
  patchImageLayer,
  replaceImageAsset,
  resetState,
  selectLayer,
  setFondColor,
  setMotifBounds,
  toggleLayerTransparentColor,
  undo,
} from '../../src/state';

function motifLayer(id: string): MotifLayer {
  const layer = getState().design.layers.find((l) => l.id === id);
  if (layer?.kind !== 'motif') throw new Error('calque Motif introuvable');
  return layer;
}

function layerOf(id: string): StackLayer {
  const layer = getState().design.layers.find((l) => l.id === id);
  if (!layer) throw new Error('calque introuvable');
  return layer;
}

describe('T55 — couleur du Fond', () => {
  it('change la couleur du calque Fond et se défait', () => {
    resetState();
    setFondColor('#123456');
    const fond = layerOf('fond');
    expect(fond.kind === 'fond' && fond.color).toBe('#123456');
    undo();
    const back = layerOf('fond');
    expect(back.kind === 'fond' && back.color).not.toBe('#123456');
  });
});

describe('T55 — étendue d’un Motif', () => {
  it('une bande est bornée à la zone motif et « toute la surface » revient à « tout »', () => {
    resetState();
    const id = addMotifLayer({ kind: 'importes', tileIds: [] }, defaultMotifLayout(), 'Motif bande');
    expect(id).not.toBeNull();
    const rows = stackGauge(getState().design.dimensions, getState().design.zones).rows;

    setMotifBounds(id!, setMotifBand(rows, { from: 40, to: 10 }));
    expect(motifLayer(id!).bounds).toEqual({ kind: 'bande', fromRow: 10, toRow: 40 });

    setMotifBounds(id!, setMotifBand(rows, { from: -30, to: rows + 90 }));
    expect(motifLayer(id!).bounds).toEqual({ kind: 'tout' });

    setMotifBounds(id!, { kind: 'bande', fromRow: 0, toRow: 12 });
    expect(motifLayer(id!).bounds).toEqual({ kind: 'bande', fromRow: 0, toRow: 12 });
    setMotifBounds(id!, { kind: 'tout' });
    expect(motifLayer(id!).bounds).toEqual({ kind: 'tout' });
  });

  it('hors de la bande, l’empilement montre le Fond', () => {
    const gauge = { needles: 4, rows: 6, stitchesPerCm: 7, rowsPerCm: 9 };
    const fond: StackLayer = { kind: 'fond', id: 'fond', name: 'Fond', hidden: false, locked: false, transparentColors: [], color: '#000000' };
    const motif: MotifLayer = {
      kind: 'motif',
      id: 'motif-1',
      name: 'Motif',
      hidden: false,
      locked: false,
      transparentColors: [],
      source: { kind: 'importes', tileIds: [] },
      layout: defaultMotifLayout(),
      bounds: { kind: 'bande', fromRow: 0, toRow: 2 },
    };
    const rgb = new Uint8ClampedArray(gauge.needles * gauge.rows * 3);
    rgb.fill(255);
    const { rgb: out } = renderStack({
      layers: [fond, motif],
      gauge,
      motifRgb: new Map([['motif-1', rgb]]),
      images: new Map(),
    });
    // rang 1 (dans la bande) = blanc du motif ; rang 3 (hors bande) = noir du Fond.
    expect([out[(1 * 4 + 0) * 3], out[(1 * 4 + 0) * 3 + 1]]).toEqual([255, 255]);
    expect([out[(3 * 4 + 0) * 3], out[(3 * 4 + 0) * 3 + 1]]).toEqual([0, 0]);
  });
});

describe('T55 — couleurs transparentes', () => {
  it('un clic rend la couleur transparente, un second la rétablit', () => {
    resetState();
    const id = addMotifLayer({ kind: 'importes', tileIds: [] }, defaultMotifLayout(), 'Motif');
    toggleLayerTransparentColor(id!, '#FFFFFF');
    expect(layerOf(id!).transparentColors).toEqual(['#ffffff']);
    toggleLayerTransparentColor(id!, '#ffffff');
    expect(layerOf(id!).transparentColors).toEqual([]);
  });

  it('le Fond n’a pas de couleur transparente', () => {
    resetState();
    toggleLayerTransparentColor('fond', '#ffffff');
    expect(layerOf('fond').transparentColors).toEqual([]);
  });

  it('la couleur transparente laisse voir le calque du dessous', () => {
    const gauge = { needles: 2, rows: 2, stitchesPerCm: 7, rowsPerCm: 9 };
    const fond: StackLayer = { kind: 'fond', id: 'fond', name: 'Fond', hidden: false, locked: false, transparentColors: [], color: '#39507f' };
    const motif: MotifLayer = {
      kind: 'motif',
      id: 'motif-1',
      name: 'Motif',
      hidden: false,
      locked: false,
      transparentColors: ['#ffffff'],
      source: { kind: 'importes', tileIds: [] },
      layout: defaultMotifLayout(),
      bounds: { kind: 'tout' },
    };
    // Motif : moitié blanche (transparente), moitié jaune.
    const rgb = new Uint8ClampedArray([255, 255, 255, 246, 176, 44, 255, 255, 255, 246, 176, 44]);
    const { rgb: out, owner } = renderStack({
      layers: [fond, motif],
      gauge,
      motifRgb: new Map([['motif-1', rgb]]),
      images: new Map(),
      keyColors: new Map([['motif-1', ['#ffffff', '#f6b02c']]]),
    });
    expect([out[0], out[1], out[2]]).toEqual([0x39, 0x50, 0x7f]);
    expect([out[3], out[4], out[5]]).toEqual([246, 176, 44]);
    expect([owner[0], owner[1]]).toEqual([0, 1]);
  });
});

describe('T55 — réglages d’un calque Image', () => {
  it('miroirs, frise et valeurs numériques passent par le calque', () => {
    resetState();
    const id = addImageLayer({ kind: 'collection', collectionId: 'medina', variation: 'VAR1' }, 'Image');
    expect(id).not.toBeNull();
    selectLayer(id);
    patchImageLayer(id!, { flipX: true, flipY: true, repeatAroundGap: 8, rotation: 90, widthStitches: 40 });
    const layer = layerOf(id!);
    expect(layer.kind === 'image' && layer.flipX).toBe(true);
    expect(layer.kind === 'image' && layer.flipY).toBe(true);
    expect(layer.kind === 'image' && layer.repeatAroundGap).toBe(8);
    expect(layer.kind === 'image' && layer.rotation).toBe(90);
    expect(layer.kind === 'image' && layer.widthStitches).toBe(40);
  });

  it('remplacer l’image ajoute l’image embarquée et pointe le calque dessus', () => {
    resetState();
    const id = addImageLayer({ kind: 'collection', collectionId: 'medina', variation: 'VAR1' }, 'Image');
    replaceImageAsset(id!, {
      id: 'A1',
      name: 'test.png',
      mime: 'image/png',
      data: 'data:image/png;base64,AA==',
      width: 4,
      height: 4,
    });
    const layer = layerOf(id!);
    expect(layer.kind === 'image' && layer.asset).toEqual({ kind: 'embarquee', assetId: 'A1' });
    expect(getState().embeddedAssets.map((a) => a.id)).toEqual(['A1']);
  });

  it('un patch Image ne touche pas un calque Motif', () => {
    resetState();
    const id = addMotifLayer({ kind: 'importes', tileIds: [] }, defaultMotifLayout(), 'Motif');
    patchImageLayer(id!, { rotation: 45 });
    expect(layerOf(id!).kind).toBe('motif');
  });
});
