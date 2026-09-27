/**
 * T71 — calque Dessin branché : projet v3 aller-retour + actions d’état.
 * Ne modifie pas v9-dessin.test.ts (cœur) : tests d’intégration application ici.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { encodeShare, decodeShare } from '../../src/io/shareLink';
import { parseProject, serializeProject } from '../../src/io/project';
import {
  addDessinLayer,
  clearDessinLayer,
  convertLayerToDessin,
  defaultDesign,
  getState,
  replaceDessinLayerColor,
  resetState,
  update,
} from '../../src/state';
import {
  decodeDessinCells,
  designFromShare,
  designV2ToShareJson,
  faceGuides,
  lineCells,
  newDessinLayer,
  newFondLayer,
  normalizeStack,
  paintDessin,
  renderStack,
  shareDefaultsFor,
  stackGauge,
  type DessinLayer,
  type SockDesignV2,
} from '../../src/core/layers';

const d0 = defaultDesign();
const g = stackGauge(d0.dimensions, d0.zones);
const W = g.needles;
const H = g.rows;

describe('T71 — Dessin dans le projet et l’état', () => {
  beforeEach(() => {
    resetState();
  });

  it('projet v3 avec un Dessin → sérialisé → relu → même rendu', async () => {
    const dos = faceGuides(W).find((f) => f.label === 'Dos')!.col;
    let dessin = newDessinLayer('dessin-1', W, H, 'Dessin 1');
    dessin = paintDessin(dessin, W, H, lineCells(dos, 0, dos, 40, W, 2, true), '#1d1d1b');
    const design: SockDesignV2 = {
      ...d0,
      layers: normalizeStack([newFondLayer('#f4f1ea'), dessin]),
    };
    const before = renderStack({
      layers: design.layers,
      gauge: g,
      motifRgb: new Map(),
      images: new Map(),
    });
    const json = await serializeProject(design, []);
    const parsed = await parseProject(json);
    expect(parsed.design.layers.some((l) => l.kind === 'dessin')).toBe(true);
    const after = renderStack({
      layers: parsed.design.layers,
      gauge: stackGauge(parsed.design.dimensions, parsed.design.zones),
      motifRgb: new Map(),
      images: new Map(),
    });
    expect(Buffer.from(after.rgb).equals(Buffer.from(before.rgb))).toBe(true);
  });

  it('lien #p=2. conserve un calque Dessin', async () => {
    let dessin = newDessinLayer('dessin-1', W, H);
    dessin = paintDessin(dessin, W, H, lineCells(10, 10, 20, 20, W, 1), '#aa3300');
    const design: SockDesignV2 = {
      ...d0,
      layers: normalizeStack([...d0.layers, dessin]),
    };
    const enc = await encodeShare({ design: designV2ToShareJson(design) }, shareDefaultsFor(2));
    const dec = await decodeShare(enc.hash, shareDefaultsFor);
    if (!dec.ok) throw new Error(dec.reason);
    const restored = designFromShare(dec.version, dec.design).design;
    expect(restored.layers.filter((l) => l.kind === 'dessin')).toHaveLength(1);
    const a = renderStack({
      layers: design.layers,
      gauge: g,
      motifRgb: new Map(),
      images: new Map(),
    });
    const b = renderStack({
      layers: restored.layers,
      gauge: stackGauge(restored.dimensions, restored.zones),
      motifRgb: new Map(),
      images: new Map(),
    });
    expect(Buffer.from(b.rgb).equals(Buffer.from(a.rgb))).toBe(true);
  });

  it('addDessinLayer crée et sélectionne ; clear vide les cases ; replace change la couleur', () => {
    const id = addDessinLayer();
    expect(id).toBeTruthy();
    expect(getState().selectedLayerId).toBe(id);
    const layer = getState().design.layers.find((l) => l.id === id);
    expect(layer?.kind).toBe('dessin');
    const painted = paintDessin(layer as DessinLayer, W, H, [[5, 5], [6, 5]], '#112233');
    update({
      design: {
        layers: getState().design.layers.map((l) => (l.id === id ? painted : l)),
      },
    });
    replaceDessinLayerColor(id!, '#112233', '#445566');
    const replaced = getState().design.layers.find((l) => l.id === id) as DessinLayer;
    expect(replaced.palette.map((c) => c.toLowerCase())).toEqual(['#445566']);
    expect(decodeDessinCells(replaced.cells, replaced.w, replaced.h)[5 * replaced.w + 5]).toBe(1);
    clearDessinLayer(id!);
    const cleared = getState().design.layers.find((l) => l.id === id) as DessinLayer;
    expect(cleared.cells).toBe('');
    expect(cleared.palette).toEqual([]);
  });

  it('convertLayerToDessin masque l’original, sélectionne la copie', () => {
    const motifId = getState().design.layers.find((l) => l.kind === 'motif')!.id;
    const design = getState().design;
    const gauge = stackGauge(design.dimensions, design.zones);
    const fakeRgb = new Uint8ClampedArray(gauge.needles * gauge.rows * 3);
    const fakeOwner = new Int16Array(gauge.needles * gauge.rows);
    const motifIndex = design.layers.findIndex((l) => l.id === motifId);
    for (let i = 0; i < fakeOwner.length; i++) {
      fakeOwner[i] = motifIndex;
      fakeRgb[i * 3] = 0x00;
      fakeRgb[i * 3 + 1] = 0x33;
      fakeRgb[i * 3 + 2] = 0x66;
    }
    const id = convertLayerToDessin(motifId, fakeRgb, fakeOwner);
    expect(id).toBeTruthy();
    const st = getState();
    expect(st.design.layers.find((l) => l.id === motifId)?.hidden).toBe(true);
    expect(st.design.layers.find((l) => l.id === id)?.kind).toBe('dessin');
    expect(st.selectedLayerId).toBe(id);
  });
});
