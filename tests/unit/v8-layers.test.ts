/**
 * V8 — ajouts au cœur des calques (src/core/layers.ts) :
 * repères de rangs (bug du cadre décalé sous le talon), rendu partiel pendant un glisser,
 * remplacement de couleurs des images, palette unique (bug « Réduire à 6 » à tort),
 * le Fond remplace la « couleur du pied ».
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeGrid, gridFingerprint } from '../../src/core/grid';
import { samplePattern } from '../../src/core/layout';
import { quantize } from '../../src/core/quantize';
import { BUILTIN_PRESETS } from '../../src/core/presets';
import { MACHINE_LIMITS } from '../../src/core/sizes';
import type { RasterImage } from '../../src/core/composition';
import { decodePng } from '../../src/io/pngCodec';
import { defaultDesign } from '../../src/state';
import V1_DEFAULTS from '../../src/core/v1ShareDefaults.json';
import type { SockDesign, TileAsset } from '../../src/core/types';
import { analyzeStackPaletteGuard } from '../../src/core/stackPaletteGuard';
import {
  designV2ToShareJson,
  dirtyRowsForImage,
  dragImage,
  effectiveZones,
  faceGuides,
  fondVisible,
  gridRowToMotifRow,
  gridYToMotifY,
  migrateDesignV1,
  motifLayerRgb,
  motifRowToGridRow,
  motifYToGridY,
  newFondLayer,
  newImageLayer,
  newMotifLayer,
  normalizeStack,
  renderStack,
  resolveStackPalette,
  shareJsonToDesignV2,
  stackGauge,
  suggestStackPalette,
  TEMPLATE_LAYOUT,
  type ImageLayer,
  type SockDesignV2,
} from '../../src/core/layers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function pngTile(file: string, id: string): Promise<TileAsset> {
  const { width, height, rgba } = await decodePng(new Uint8Array(fs.readFileSync(path.join(root, file))));
  return { id, name: id, source: 'png', width, height, rgba };
}

/** Image de test : moitié gauche rouge, moitié droite verte, colonne du milieu en demi-teinte, coin transparent. */
function twoColorImage(w = 40, h = 20): RasterImage {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const c = x < w / 2 ? [220, 20, 30] : x === w / 2 ? [120, 110, 40] : [20, 180, 60];
      rgba.set([...c, x < 3 && y < 3 ? 0 : 255], o);
    }
  return { width: w, height: h, rgba };
}

function solidTile(id: string, rgb: [number, number, number]): TileAsset {
  const rgba = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) rgba.set([...rgb, 255], i * 4);
  return { id, name: id, source: 'png', width: 16, height: 16, rgba };
}

const d0 = defaultDesign();
/** Design V1 (V1–V6) reconstruit depuis les défauts figés. */
function v1Design(): SockDesign {
  const j = structuredClone(V1_DEFAULTS) as unknown as Omit<SockDesign, 'layout' | 'version' | 'pattern'> & { layout: Omit<SockDesign['layout'], 'tileIds'> };
  return { ...j, version: 1, layout: { ...j.layout, tileIds: [] }, pattern: { kind: 'carreaux' } } as SockDesign;
}
const dims = d0.dimensions; // homme : bord-côte 30, tige 180, talon 56, pied 200, pointe 50
const zones = { ...d0.zones, cuffEnabled: true, patternOnFoot: true };

describe('repères de rangs (cadre décalé sous le talon)', () => {
  it('les rangs de motif sautent le talon', () => {
    expect(motifRowToGridRow(dims, zones, 0)).toBe(30);
    expect(motifRowToGridRow(dims, zones, 179)).toBe(209);
    expect(motifRowToGridRow(dims, zones, 180)).toBe(30 + 180 + 56); // 1er rang du pied
    expect(gridRowToMotifRow(dims, zones, 266)).toBe(180);
    expect(gridRowToMotifRow(dims, zones, 220)).toBeNull(); // talon
    expect(gridRowToMotifRow(dims, zones, 10)).toBeNull(); // bord-côte
    expect(gridRowToMotifRow(dims, { ...zones, patternOnFoot: false }, 266)).toBeNull();
    for (const y of [0, 12.5, 179.9, 180, 250.25]) expect(gridYToMotifY(dims, zones, motifYToGridY(dims, zones, y))).toBeCloseTo(y, 9);
    expect(gridYToMotifY(dims, zones, 230)).toBe(180); // clic sur le talon → collé au pied
  });

  it('repères des faces', () => {
    expect(faceGuides(168)).toEqual([
      { col: 0, label: 'Intérieur' },
      { col: 42, label: 'Dos' },
      { col: 84, label: 'Extérieur' },
      { col: 126, label: 'Devant' },
    ]);
  });
});

describe('glisser fluide : rendu partiel identique au rendu complet', () => {
  it('déplacer / tourner une image, ne recalculer que les rangs touchés', () => {
    const g = stackGauge(dims, zones);
    const motif = newMotifLayer('motif-1', { kind: 'importes', tileIds: ['s'] }, TEMPLATE_LAYOUT);
    const motifRgb = new Map([['motif-1', motifLayerRgb(motif, [solidTile('s', [240, 200, 20])], dims, zones, 'majoritaire', BUILTIN_PRESETS)!]]);
    const img = twoColorImage();
    const images = new Map([['e:A', img]]);
    const start: ImageLayer = { ...newImageLayer('image-1', { kind: 'embarquee', assetId: 'A' }, g), x: 160, y: 170, widthStitches: 50 };
    let prev = start;
    let result = renderStack({ layers: normalizeStack([newFondLayer(), motif, start]), gauge: g, motifRgb, images });
    const moves: Array<Partial<ImageLayer>> = [
      dragImage(start, g, 'deplacer', [160, 170], [175, 210]), // passe sous le talon et fait le tour
      { ...dragImage(start, g, 'deplacer', [160, 170], [175, 210]), rotation: 33 },
      { x: 20, y: 40, rotation: 90, widthStitches: 30, flipX: true },
    ];
    for (const patch of moves) {
      const next: ImageLayer = { ...prev, ...patch };
      const layers = normalizeStack([newFondLayer(), motif, next]);
      const rows = dirtyRowsForImage(prev, next, img, g);
      expect(rows[1] - rows[0]).toBeLessThan(g.rows);
      result = renderStack({ layers, gauge: g, motifRgb, images }, { rows, into: result });
      const full = renderStack({ layers, gauge: g, motifRgb, images });
      expect(Buffer.from(result.rgb).equals(Buffer.from(full.rgb))).toBe(true);
      expect(Buffer.from(result.owner.buffer).equals(Buffer.from(full.owner.buffer))).toBe(true);
      prev = next;
    }
  });
});

describe('remplacement de couleurs d’une image', () => {
  it('rouge → bleu marine ; la demi-teinte suit la couleur la plus proche ; sans réglage, rien ne change', () => {
    const g = { needles: 40, rows: 20, stitchesPerCm: 10, rowsPerCm: 10 };
    const img = twoColorImage();
    const images = new Map([['e:A', img]]);
    const base: ImageLayer = { ...newImageLayer('image-1', { kind: 'embarquee', assetId: 'A' }, g), x: 20, y: 10, widthStitches: 40 };
    const keyColors = new Map([['image-1', ['#dc141e', '#14b43c']]]);
    const plain = renderStack({ layers: normalizeStack([newFondLayer('#ffffff'), base]), gauge: g, motifRgb: new Map(), images, keyColors });
    const colorsOf = (rgb: Uint8ClampedArray) => {
      const s = new Set<string>();
      for (let i = 0; i < rgb.length; i += 3) s.add(`${rgb[i]},${rgb[i + 1]},${rgb[i + 2]}`);
      return s;
    };
    expect(colorsOf(plain.rgb).has('220,20,30')).toBe(true);
    const recolored = renderStack({
      layers: normalizeStack([newFondLayer('#ffffff'), { ...base, recolor: { '#DC141E': '#1f3a5f' } }]),
      gauge: g,
      motifRgb: new Map(),
      images,
      keyColors,
    });
    const c = colorsOf(recolored.rgb);
    expect(c.has('220,20,30')).toBe(false);
    expect(c.has('31,58,95')).toBe(true);
    expect(c.has('20,180,60')).toBe(true);
    expect(c.has('120,110,40')).toBe(false); // demi-teinte rattachée à une couleur principale
    expect(c.has('255,255,255')).toBe(true); // le coin transparent laisse voir le Fond
    // l'image source n'est jamais modifiée
    expect([...img.rgba.subarray(3 * 4 * 40, 3 * 4 * 40 + 3)]).toEqual([220, 20, 30]);
  });

  it('lien V2 : le remplacement fait l’aller-retour ; un tableau vide ne coûte rien', () => {
    const g = stackGauge(dims, zones);
    const im: ImageLayer = { ...newImageLayer('image-1', { kind: 'embarquee', assetId: 'A' }, g), recolor: { '#dc141e': '#1f3a5f' } };
    const d: SockDesignV2 = { ...d0, layers: normalizeStack([newFondLayer(), im]) };
    expect(shareJsonToDesignV2(designV2ToShareJson(d))).toEqual(d);
    const empty = designV2ToShareJson({ ...d, layers: normalizeStack([newFondLayer(), { ...im, recolor: {} }]) }) as { layers: Array<Record<string, unknown>> };
    expect('recolor' in empty.layers[1]!).toBe(false);
  });
});

describe('palette : le garde-fou compte exactement ce qui est appliqué', () => {
  it('couleurs cachées sous un autre calque : plus de « Réduire à 6 » à tort', () => {
    const g = stackGauge(dims, zones);
    // Motif du dessous à 5 couleurs, entièrement recouvert par un Motif à 2 couleurs.
    const cols: Array<[number, number, number]> = [[10, 10, 10], [60, 60, 60], [110, 110, 110], [160, 160, 160], [210, 210, 210]];
    const bas = newMotifLayer('motif-1', { kind: 'importes', tileIds: [] }, TEMPLATE_LAYOUT);
    const haut = newMotifLayer('motif-2', { kind: 'importes', tileIds: [] }, TEMPLATE_LAYOUT);
    const rgbBas = new Uint8ClampedArray(g.needles * g.rows * 3);
    for (let i = 0; i < g.needles * g.rows; i++) rgbBas.set(cols[i % 5]!, i * 3);
    const rgbHaut = new Uint8ClampedArray(g.needles * g.rows * 3);
    for (let i = 0; i < g.needles * g.rows; i++) rgbHaut.set(i % 2 ? [240, 200, 20] : [30, 60, 160], i * 3);
    const motifRgb = new Map([['motif-1', rgbBas], ['motif-2', rgbHaut]]);
    const layers = normalizeStack([newFondLayer(), bas, haut]);
    const design = { layers, quantize: { ...d0.quantize, paletteFromLayers: true as const } };
    const { rgb, owner } = renderStack({ layers, gauge: g, motifRgb, images: new Map() });

    // V7 : le bandeau comptait 1 + 5 + 2 = 8 couleurs → « Réduire à 6 » alors que 2 seulement sont tricotées.
    expect(analyzeStackPaletteGuard(design, { motifRgb, images: new Map() }, rgb, MACHINE_LIMITS).showBanner).toBe(true);

    const res = resolveStackPalette({
      quantize: design.quantize,
      suggested: suggestStackPalette({ layers, motifRgb, images: new Map() }, rgb),
      primaryYarns: null,
      fondColor: '#f1e9dc',
      fondVisible: fondVisible(owner),
      machineMax: MACHINE_LIMITS.maxColorsTotal,
    });
    expect(res).toMatchObject({ source: 'calques', count: 2, overLimit: false, showMaxColors: false });
    expect(res.palette.sort()).toEqual(['#1e3ca0', '#f0c814']);
  });

  it('modes : manuelle gagne, fils de collection + Fond visible, auto plafonné, bandeau seulement au-delà', () => {
    const q = { ...d0.quantize, paletteFromLayers: false };
    const common = { suggested: [], fondColor: '#FF0000', machineMax: 6 };
    expect(resolveStackPalette({ ...common, quantize: { ...q, paletteMode: 'manuelle', palette: ['#111111', '#222222'] }, primaryYarns: ['#f7f7f7'], fondVisible: true })).toMatchObject({
      source: 'manuelle', palette: ['#111111', '#222222'], overLimit: false, showMaxColors: true,
    });
    expect(resolveStackPalette({ ...common, quantize: { ...q, paletteMode: 'auto' }, primaryYarns: ['#f7f7f7', '#4368b1'], fondVisible: true }).palette).toEqual(['#f7f7f7', '#4368b1', '#ff0000']);
    expect(resolveStackPalette({ ...common, quantize: { ...q, paletteMode: 'auto' }, primaryYarns: ['#f7f7f7', '#4368b1'], fondVisible: false }).palette).toEqual(['#f7f7f7', '#4368b1']);
    expect(resolveStackPalette({ ...common, quantize: { ...q, paletteMode: 'auto', maxColors: 8 }, primaryYarns: null, fondVisible: false })).toMatchObject({ source: 'auto', maxColors: 6, overLimit: false, showMaxColors: true });
    const seven = ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007'];
    expect(resolveStackPalette({ ...common, suggested: seven.slice(0, 6), quantize: { ...q, paletteFromLayers: true }, primaryYarns: null, fondVisible: true }).overLimit).toBe(false);
    expect(resolveStackPalette({ ...common, suggested: seven, quantize: { ...q, paletteFromLayers: true }, primaryYarns: null, fondVisible: true }).overLimit).toBe(true);
  });
});

describe('le Fond remplace la « couleur du pied »', () => {
  it('projet V1 sans motif sur le pied : même grille, le pied prend la couleur du Fond', async () => {
    const tiles = await Promise.all([
      pngTile('tests/fixtures/golden/exemple-damier.png', 'ex1'),
      pngTile('tests/fixtures/golden/exemple-etoile.png', 'ex2'),
    ]);
    const base = v1Design();
    const v1: SockDesign = {
      ...base,
      zones: { ...base.zones, patternOnFoot: false, footColor: '#7a1f3d' },
      layout: { ...base.layout, tileIds: ['ex1', 'ex2'] },
    };
    const rgb1 = samplePattern(tiles, v1.layout, v1.dimensions, v1.zones, 'majoritaire', BUILTIN_PRESETS);
    const q1 = quantize(rgb1, v1.dimensions.needles, v1.quantize);
    const fp1 = gridFingerprint(composeGrid(v1.dimensions, v1.zones, q1.indices, q1.palette));

    const v2 = migrateDesignV1(v1, { collectionId: null, zoneColors: null, paletteOptionId: null, tileIds: ['ex1', 'ex2'] });
    expect(v2.layers[0]).toMatchObject({ kind: 'fond', color: '#7a1f3d' });
    const g = stackGauge(v2.dimensions, v2.zones);
    const motif = v2.layers[1]!;
    const motifRgb = new Map([[motif.id, motifLayerRgb(motif as never, tiles, v2.dimensions, v2.zones, 'majoritaire', BUILTIN_PRESETS)!]]);
    const { rgb } = renderStack({ layers: v2.layers, gauge: g, motifRgb, images: new Map() });
    const q2 = quantize(rgb, v2.dimensions.needles, v2.quantize);
    const z = effectiveZones(v2);
    expect(z.footColor).toBe('#7a1f3d');
    expect(gridFingerprint(composeGrid(v2.dimensions, z, q2.indices, q2.palette))).toBe(fp1);

    // Changer le Fond change le pied
    const other = { ...v2, layers: [{ ...v2.layers[0]!, color: '#00ff00' }, ...v2.layers.slice(1)] } as SockDesignV2;
    expect(effectiveZones(other).footColor).toBe('#00ff00');
  });
});
