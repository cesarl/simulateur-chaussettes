/**
 * V7 — modèle en calques (reference/layers/layers.ts).
 * Filets de sécurité : les deux liens réels de César et les empreintes T41 doivent donner
 * EXACTEMENT la même grille après migration en calques. Ne jamais modifier les valeurs attendues.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeGrid, gridFingerprint } from '../../src/core/grid';
import { motifRows, samplePattern } from '../../src/core/layout';
import { quantize } from '../../src/core/quantize';
import { defaultDimensions, MACHINE_LIMITS } from '../../src/core/sizes';
import { normalizePresets, type Preset } from '../../src/core/calepinage';
import { applyGeneratedPreset, BUILTIN_PRESETS } from '../../src/core/presets';
import { renderComposition, type Composition, type RasterImage } from '../../src/core/composition';
import { decodePng } from '../../src/io/pngCodec';
import { decodeShareHash } from '../../src/io/shareState';
import { defaultDesign, defaultDesignV1, layoutFromTilesAround } from '../../src/state';
import type { SockDesign, TileAsset } from '../../src/core/types';
import { decodeShare, encodeShare } from '../../src/io/shareLink';
import {
  addStackLayer,
  designFromShare,
  designV2ToShareJson,
  dominantColors,
  dragImage,
  dragMotif,
  duplicateStackLayer,
  imageGizmo,
  layerAtStitch,
  migrateDesignV1,
  motifGizmo,
  motifLayerRgb,
  moveStackLayer,
  newFondLayer,
  newImageLayer,
  newMotifLayer,
  normalizeStack,
  removeStackLayer,
  renderStack,
  scaleMotif,
  setMotifBand,
  shareDefaultsFor,
  stackGauge,
  suggestStackPalette,
  TEMPLATE_LAYOUT,
  type ImageLayer,
  type MotifLayer,
  type SockDesignV2,
  type StackLayer,
} from '../../src/core/layers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ------------------------------------------------------------------ outils
async function pngTile(file: string, id: string): Promise<TileAsset> {
  const { width, height, rgba } = await decodePng(new Uint8Array(fs.readFileSync(path.join(root, file))));
  return { id, name: id, source: 'png', width, height, rgba };
}

function fingerprintV1(d: SockDesign, tiles: TileAsset[], presets: readonly Preset[]): string {
  const layout = { ...d.layout, tileIds: tiles.map((t) => t.id) };
  const rgb = samplePattern(tiles, layout, d.dimensions, d.zones, d.quantize.sampling, presets);
  const q = quantize(rgb, d.dimensions.needles, d.quantize);
  return gridFingerprint(composeGrid(d.dimensions, d.zones, q.indices, q.palette));
}

function renderV2(d: SockDesignV2, tilesByLayer: Map<string, TileAsset[]>, presets: readonly Preset[], images = new Map<string, RasterImage>()) {
  const motifRgb = new Map<string, Uint8ClampedArray>();
  for (const l of d.layers) {
    if (l.kind !== 'motif') continue;
    const rgb = motifLayerRgb(l, tilesByLayer.get(l.id) ?? [], d.dimensions, d.zones, d.quantize.sampling, presets);
    if (rgb) motifRgb.set(l.id, rgb);
  }
  return renderStack({ layers: d.layers, gauge: stackGauge(d.dimensions, d.zones), motifRgb, images });
}

function fingerprintV2(d: SockDesignV2, tilesByLayer: Map<string, TileAsset[]>, presets: readonly Preset[]): string {
  const { rgb } = renderV2(d, tilesByLayer, presets);
  const q = quantize(rgb, d.dimensions.needles, d.quantize);
  return gridFingerprint(composeGrid(d.dimensions, d.zones, q.indices, q.palette));
}

const catalogPresets = normalizePresets(JSON.parse(fs.readFileSync(path.join(root, 'public/carreaux/calepinages.json'), 'utf8'))).presets;

/** Carreau synthétique : damier 2 couleurs (+ un liseré d'anticrénelage entre les deux). */
function checkerTile(id: string, a: [number, number, number], b: [number, number, number], size = 32): TileAsset {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const c = (x < size / 2) !== (y < size / 2) ? a : b;
      const edge = x === size / 2 || y === size / 2;
      rgba[o] = edge ? (a[0] + b[0]) >> 1 : c[0];
      rgba[o + 1] = edge ? (a[1] + b[1]) >> 1 : c[1];
      rgba[o + 2] = edge ? (a[2] + b[2]) >> 1 : c[2];
      rgba[o + 3] = 255;
    }
  return { id, name: id, source: 'png', width: size, height: size, rgba };
}

function solidImage(w: number, h: number, rgb: [number, number, number], holeAlpha = false): RasterImage {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba.set([...rgb, holeAlpha && i % w < w / 2 ? 0 : 255], i * 4);
  }
  return { width: w, height: h, rgba };
}

function smallDesign(layers: StackLayer[]): SockDesignV2 {
  const d = defaultDesign();
  return {
    version: 2,
    name: 't',
    dimensions: { ...d.dimensions, legRows: 60, footRows: 0 },
    zones: { ...d.zones, patternOnFoot: false },
    quantize: d.quantize,
    decor: d.decor,
    layers: normalizeStack(layers),
  };
}

const px = (rgb: Uint8ClampedArray, W: number, x: number, y: number) => [...rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];

// ------------------------------------------------------------------ 1. liens réels
const LIENS = {
  jardin: {
    hash: '#p=1.XVBBTsMwEPxKNVxdlKQIKh8pFxBcAIkDQsjYm9TIsYtjS5DKf0ebtIDQXryzM57Z3cNA7uFVT5C4UdFYvzCLKzXmCAEdnCOdbPDMsgYS7xNnaZbmlxPiwPMxeFrWkHh6rKoKYgYaSFzeVk2DUgSc-go5MVsrRzvrVUfcDSFHzRl2kSJ1jmHBzUDpmn2N6i3F1xUEOvIUJ1WIhh8Ysk0TXw33yndEkDW7JevoIdmktzRANuvT-oDZke6CYWkbiVDmrNMWOrfthneCxMnZ6nz9VkNgS-R-0PaCCwIp0H-wCHxk5ZMdp4S9-twcDtRwPkcpHa175TM5NwefBpDPf34_ur8UAUOabfboZ60O1qOU8g0',
    collection: 'jardin-d-dazur',
    tiles: ['VAR1', 'VAR2', 'VAR3'],
  },
  palm: {
    hash: '#p=1.XY87T8QwEIT_Chpan5QEdCe55GgoECgtotg4ezlLfgTHkeAi_3e0CS_ReWd2_M0u6KEXBPIMjWdy_uqOyZyhYKJzbLKNQTZsD42RnN91v35Mk3iXGHhXQ6O9r6oD1CY00Hhqq6pBKQqOPuKcZduQ49EGGlimKc7JCHtMnHhwIisZJs4PwiTHlKNNIg8cOK2xmHp5YJptXgM0tRQGZui6CE8qrOXMfDodpSo0rnl_2N_WUDgzux_1dNNVXQWFHPm_WBTeZgrZXlaup_fj192NUB3nzI-xly6ewszObXVWA_rlz-_f9Nei0LMRzAK_ZU20AaWUTw',
    collection: 'palm-beach',
    tiles: ['VAR1', 'VAR2'],
  },
} as const;

/** Empreintes des deux liens, calculées une fois avec le code V6. Ne jamais modifier. */
const LIENS_EXPECTED = { jardin: '1751a01', palm: '5e26e231' } as const;

describe('liens réels de César (#p=1.) — identiques après passage aux calques', () => {
  for (const [key, lien] of Object.entries(LIENS) as Array<[keyof typeof LIENS, (typeof LIENS)[keyof typeof LIENS]]>) {
    it(`${key} : décodage V6 = décodage V7 migré, même grille`, async () => {
      const tiles = await Promise.all(lien.tiles.map((v) => pngTile(`tests/fixtures/liens/${lien.collection}-${v}.png`, `${lien.collection}-${v}`)));

      // chemin V6 (code actuel de l'application)
      const v6 = await decodeShareHash(lien.hash);
      expect(v6.ok).toBe(true);
      if (!v6.ok) return;
      expect(v6.parsed.activeCollectionId).toBe(lien.collection);
      const fpV6 = fingerprintV1(v6.parsed.design, tiles, catalogPresets);
      expect(fpV6).toBe(LIENS_EXPECTED[key]);

      // chemin V7 : décodage avec les défauts V1 figés → calques
      const dec = await decodeShare(lien.hash, shareDefaultsFor);
      expect(dec.ok).toBe(true);
      if (!dec.ok) return;
      expect(dec.version).toBe(1);
      const { design, fromV1 } = designFromShare(dec.version, dec.design);
      expect(fromV1).toBe(true);
      expect(design.layers.map((l) => l.kind)).toEqual(['fond', 'motif']);
      const motif = design.layers[1] as MotifLayer;
      expect(motif.source).toEqual({ kind: 'collection', collectionId: lien.collection, colors: v6.parsed.zoneColors, paletteId: 'defaut' });
      expect(motif.bounds).toEqual({ kind: 'tout' });
      expect(motif.transparentColors).toEqual([]);
      expect(fingerprintV2(design, new Map([[motif.id, tiles]]), catalogPresets)).toBe(fpV6);

      // puis re-partage en V2 → relecture → même design, même grille
      const enc = await encodeShare({ design: designV2ToShareJson(design) }, shareDefaultsFor(2));
      expect(enc.hash.startsWith('#p=2.')).toBe(true);
      expect(enc.length).toBeLessThan(900);
      const dec2 = await decodeShare(enc.hash, shareDefaultsFor);
      if (!dec2.ok) throw new Error('relecture');
      const again = designFromShare(dec2.version, dec2.design).design;
      expect(again).toEqual(design);
      expect(fingerprintV2(again, new Map([[motif.id, tiles]]), catalogPresets)).toBe(fpV6);
    });
  }
});

// ------------------------------------------------------------------ 2. empreintes T41 en calques
describe('empreintes T41 : projet carreaux migré = même grille', () => {
  it('cas 1 (à la suite, 3 motifs) et cas 4 (quinconce + rotation aléatoire, 5 sur le tour)', async () => {
    const tiles = await Promise.all([
      pngTile('tests/fixtures/golden/exemple-damier.png', 'ex1'),
      pngTile('tests/fixtures/golden/exemple-etoile.png', 'ex2'),
      pngTile('tests/fixtures/golden/exemple-quart.png', 'ex3'),
    ]);
    const base = defaultDesignV1();
    const dims = defaultDimensions('homme');
    const zones = { ...base.zones, cuffColor: '#1f3a5f', heelColor: '#b5462f', toeColor: '#1d1d1b' };
    const quant = { maxColors: 4, paletteMode: 'auto' as const, palette: [], sampling: 'majoritaire' as const, despeckle: false, maxFloat: MACHINE_LIMITS.maxFloat };
    const cases: Array<[SockDesign, string]> = [];
    const s6 = layoutFromTilesAround(dims.needles, 6, 0, dims.stitchesPerCm, dims.rowsPerCm, true, 32);
    cases.push([{ ...base, dimensions: dims, zones, quantize: quant, layout: { ...base.layout, ...s6, calepinage: applyGeneratedPreset('g-suite', 1)!, tileIds: ['ex1', 'ex2', 'ex3'] } }, '61919254']);
    const s5 = layoutFromTilesAround(dims.needles, 5, 0, dims.stitchesPerCm, dims.rowsPerCm, true, 32);
    cases.push([
      {
        ...base,
        dimensions: dims,
        zones: { ...zones, heelHeightMm: 40 },
        quantize: quant,
        layout: { ...base.layout, ...s5, calepinage: { ...applyGeneratedPreset('g-suite-rotalea', 1)!, appareil: 'quinconce-h' }, tileIds: ['ex1', 'ex2', 'ex3'] },
      },
      'cc408b99',
    ]);
    for (const [d, expected] of cases) {
      expect(fingerprintV1(d, tiles, BUILTIN_PRESETS)).toBe(expected);
      const v2 = migrateDesignV1(d, { collectionId: null, zoneColors: null, paletteOptionId: null, tileIds: ['ex1', 'ex2', 'ex3'] });
      expect(v2.layers[1]).toMatchObject({ kind: 'motif', source: { kind: 'importes', tileIds: ['ex1', 'ex2', 'ex3'] } });
      expect(fingerprintV2(v2, new Map([['motif-1', tiles]]), BUILTIN_PRESETS)).toBe(expected);
    }
  });
});

// ------------------------------------------------------------------ 3. composition V6 migrée
describe('composition V6 migrée = mêmes couleurs', () => {
  it('fond + 2 images (rotation, miroir, frise, transparence PNG)', () => {
    const d = defaultDesignV1();
    const comp: Composition = {
      background: '#123456',
      layers: [
        { id: 'a', asset: { kind: 'embarquee', assetId: 'A' }, x: 120, y: 40, widthStitches: 50, rotation: 30, flipX: true, flipY: false, repeatAroundGap: null, hidden: false, locked: false },
        { id: 'b', asset: { kind: 'embarquee', assetId: 'B' }, x: 10, y: 90, widthStitches: 30, rotation: 0, flipX: false, flipY: false, repeatAroundGap: 12, hidden: false, locked: false },
        { id: 'c', asset: { kind: 'embarquee', assetId: 'B' }, x: 60, y: 60, widthStitches: 30, rotation: 0, flipX: false, flipY: false, repeatAroundGap: null, hidden: true, locked: false },
      ],
    };
    const images = new Map<string, RasterImage>([
      ['e:A', solidImage(40, 20, [200, 30, 30], true)],
      ['e:B', solidImage(16, 16, [20, 200, 90])],
    ]);
    const design: SockDesign = { ...d, pattern: { kind: 'composition', composition: comp } };
    const g = { needles: d.dimensions.needles, rows: motifRows(d.dimensions, d.zones), stitchesPerCm: d.dimensions.stitchesPerCm, rowsPerCm: d.dimensions.rowsPerCm };
    const v6 = renderComposition(comp, images, g);
    const v2 = migrateDesignV1(design, { collectionId: null, zoneColors: null, paletteOptionId: null, tileIds: [] });
    expect(v2.layers.map((l) => l.kind)).toEqual(['fond', 'image', 'image', 'image']);
    expect((v2.layers[0] as { color: string }).color).toBe('#123456');
    const v7 = renderV2(v2, new Map(), BUILTIN_PRESETS, images);
    expect(Buffer.from(v7.rgb).equals(Buffer.from(v6.rgb))).toBe(true);
  });
});

// ------------------------------------------------------------------ 4. empilement
describe('empilement des calques', () => {
  const YELLOW: [number, number, number] = [240, 200, 20];
  const WHITE: [number, number, number] = [250, 250, 250];
  const BLUE: [number, number, number] = [30, 60, 160];

  it('couleur transparente : le blanc du motif laisse voir le fond, anticrénelage compris', () => {
    const motif = { ...newMotifLayer('motif-1', { kind: 'importes', tileIds: ['jb'] }, TEMPLATE_LAYOUT), transparentColors: ['#fafafa'] };
    const d = smallDesign([newFondLayer('#ff0000'), motif]);
    const tiles = new Map([['motif-1', [checkerTile('jb', YELLOW, WHITE)]]]);
    const opaque = renderV2({ ...d, layers: [d.layers[0]!, { ...motif, transparentColors: [] }] }, tiles, BUILTIN_PRESETS);
    const { rgb, owner } = renderV2(d, tiles, BUILTIN_PRESETS);
    const colors = new Set<string>();
    for (let i = 0; i < rgb.length; i += 3) colors.add(`${rgb[i]},${rgb[i + 1]},${rgb[i + 2]}`);
    expect(colors.has('250,250,250')).toBe(false); // plus de blanc
    expect(colors.has('255,0,0')).toBe(true); // le fond apparaît
    expect(colors.has('240,200,20')).toBe(true); // le jaune reste
    // là où le motif opaque est jaune, rien ne change ; là où il est blanc → fond (owner 0)
    for (let i = 0; i < owner.length; i++) {
      const o = [...opaque.rgb.subarray(i * 3, i * 3 + 3)].join();
      if (o === '240,200,20') expect(owner[i]).toBe(1);
      if (o === '250,250,250') expect(owner[i]).toBe(0);
    }
  });

  it('bande de rangs, ordre, masquage, et calque sous la souris', () => {
    const bas = newMotifLayer('motif-1', { kind: 'importes', tileIds: ['b'] }, TEMPLATE_LAYOUT);
    const haut = { ...newMotifLayer('motif-2', { kind: 'importes', tileIds: ['j'] }, TEMPLATE_LAYOUT), bounds: setMotifBand(60, { from: 10, to: 20 }) };
    const tiles = new Map([
      ['motif-1', [checkerTile('b', BLUE, BLUE)]],
      ['motif-2', [checkerTile('j', YELLOW, YELLOW)]],
    ]);
    let d = smallDesign([newFondLayer(), bas, haut]);
    const W = d.dimensions.needles;
    let r = renderV2(d, tiles, BUILTIN_PRESETS);
    expect(px(r.rgb, W, 5, 9)).toEqual(BLUE);
    expect(px(r.rgb, W, 5, 10)).toEqual(YELLOW);
    expect(px(r.rgb, W, 5, 19)).toEqual(YELLOW);
    expect(px(r.rgb, W, 5, 20)).toEqual(BLUE);
    expect(layerAtStitch(d.layers, r.owner, W, 5.5, 15.2)).toBe('motif-2');
    expect(layerAtStitch(d.layers, r.owner, W, W + 5.5, 30)).toBe('motif-1'); // tour circulaire

    // la bande passe dessous : le motif plein la recouvre
    d = { ...d, layers: moveStackLayer(d.layers, 'motif-2', 'dessous') };
    expect(d.layers.map((l) => l.id)).toEqual(['fond', 'motif-2', 'motif-1']);
    r = renderV2(d, tiles, BUILTIN_PRESETS);
    expect(px(r.rgb, W, 5, 15)).toEqual(BLUE);

    // cacher le motif plein : bande jaune sur le fond
    d = { ...d, layers: d.layers.map((l) => (l.id === 'motif-1' ? { ...l, hidden: true } : l)) };
    r = renderV2(d, tiles, BUILTIN_PRESETS);
    expect(px(r.rgb, W, 5, 15)).toEqual(YELLOW);
    expect(px(r.rgb, W, 5, 40)).toEqual([0xf1, 0xe9, 0xdc]);
  });

  it('le Fond reste en bas, unique, visible ; ids uniques', () => {
    const m = newMotifLayer('motif-1', { kind: 'importes', tileIds: [] }, TEMPLATE_LAYOUT);
    let layers = normalizeStack([m, { ...newFondLayer('#000000'), hidden: true }, newFondLayer('#ffffff'), { ...m }]);
    expect(layers.map((l) => l.kind)).toEqual(['fond', 'motif', 'motif']);
    expect(layers[0]).toMatchObject({ color: '#000000', hidden: false });
    expect(new Set(layers.map((l) => l.id)).size).toBe(3);
    expect(moveStackLayer(layers, 'fond', 'dessus')[0]!.kind).toBe('fond');
    expect(moveStackLayer(layers, layers[2]!.id, 0)[0]!.kind).toBe('fond');
    expect(removeStackLayer(layers, 'fond')).toHaveLength(3);
    layers = duplicateStackLayer(layers, 'motif-1');
    expect(layers.map((l) => l.id)).toEqual(['fond', 'motif-1', 'motif-3', 'motif-2']);
    layers = addStackLayer(layers, newImageLayer('image-1', { kind: 'embarquee', assetId: 'x' }, { needles: 168, rows: 380, stitchesPerCm: 7.5, rowsPerCm: 10 }));
    expect(layers.at(-1)!.kind).toBe('image');
  });

  it('palette suggérée : fond + couleurs visibles non transparentes, sans doublon', () => {
    const motif = { ...newMotifLayer('motif-1', { kind: 'importes', tileIds: ['jb'] }, TEMPLATE_LAYOUT), transparentColors: ['#fafafa'], bounds: setMotifBand(60, { from: 0, to: 30 }) };
    const d = smallDesign([newFondLayer('#ff0000'), motif]);
    const tiles = new Map([['motif-1', [checkerTile('jb', YELLOW, WHITE)]]]);
    const motifRgb = new Map([['motif-1', motifLayerRgb(motif, tiles.get('motif-1')!, d.dimensions, d.zones, 'majoritaire', BUILTIN_PRESETS)!]]);
    const { rgb } = renderStack({ layers: d.layers, gauge: stackGauge(d.dimensions, d.zones), motifRgb, images: new Map() });
    const keyColors = new Map([['motif-1', ['#f0c814', '#fafafa']]]);
    expect(suggestStackPalette({ layers: d.layers, motifRgb, images: new Map(), keyColors }, rgb)).toEqual(['#ff0000', '#f0c814']);
    expect(dominantColors(new Uint8ClampedArray([1, 2, 3, 1, 2, 3, 9, 9, 9]), 3, { minShare: 0.5 })).toEqual(['#010203']);
  });
});

// ------------------------------------------------------------------ 5. poignées
describe('poignées de la vue 2D', () => {
  const g = { needles: 168, rows: 380, stitchesPerCm: 7.5, rowsPerCm: 10 };
  const img = { width: 100, height: 50 };
  const start: ImageLayer = { ...newImageLayer('image-1', { kind: 'embarquee', assetId: 'x' }, g), x: 160, y: 100, widthStitches: 40 };

  it('image : déplacer (tour circulaire), tourner (sens horaire, aimant), agrandir', () => {
    expect(dragImage(start, g, 'deplacer', [160, 100], [175, 90])).toEqual({ x: 7, y: 90 });
    // de la droite du centre vers le dessous du centre = +90° (sens horaire, y vers le bas)
    expect(dragImage(start, g, 'tourner', [170, 100], [160, 110]).rotation).toBeCloseTo(90, 5);
    expect(dragImage(start, g, 'tourner', [170, 100], [165, 107], { snapDeg: 15 }).rotation).toBe(45);
    expect(dragImage(start, g, 'echelle', [170, 100], [180, 100]).widthStitches).toBe(80);
    expect(dragImage(start, g, 'echelle', [170, 100], [160.001, 100]).widthStitches).toBe(2);
    const gz = imageGizmo(start, img, g);
    expect(gz.rotate[0]).toBeCloseTo(160, 5);
    expect(gz.rotate[1]).toBeLessThan(gz.corners[0]![1]); // au-dessus du bord haut
  });

  it('motif : glisser décale le calepinage, agrandir garde un nombre entier sur le tour, bande bornée', () => {
    const m = newMotifLayer('motif-1', { kind: 'importes', tileIds: [] }, TEMPLATE_LAYOUT);
    expect(m.layout.tilesAround).toBe(6);
    const moved = dragMotif(m, [30, -5]).layout!;
    expect(moved.offsetStitches).toBe(2); // 30 mod 28
    expect(moved.offsetRows).toBe(32); // -5 mod 37
    const big = scaleMotif(m, 2, g).layout!;
    expect(big.tilesAround).toBe(3);
    expect(big.tileStitches).toBe(56);
    expect(scaleMotif(m, 100, g).layout!.tilesAround).toBe(2);
    const free = scaleMotif({ ...m, layout: { ...m.layout, tileSizeMode: 'free' } }, 1.5, g).layout!;
    expect(free.tileStitches).toBe(42);
    expect(free.tileRows).toBe(56);
    expect(setMotifBand(380, { from: 300, to: 250 })).toEqual({ kind: 'bande', fromRow: 250, toRow: 300 });
    expect(setMotifBand(380, { from: -10, to: 999 })).toEqual({ kind: 'tout' });
    const gz = motifGizmo({ ...m, bounds: { kind: 'bande', fromRow: 50, toRow: 90 } }, g);
    expect(gz.band).toEqual({ from: 50, to: 90 });
    expect(gz.tile.w).toBe(28);
    expect(gz.tile.y).toBeLessThanOrEqual(50);
    expect(gz.tile.y + gz.tile.h).toBeGreaterThan(50);
  });
});

// ------------------------------------------------------------------ 6. lien V2
describe('lien de partage V2', () => {
  it('aller-retour exact, lien court, versions futures refusées', async () => {
    const m: MotifLayer = {
      ...newMotifLayer('motif-1', { kind: 'collection', collectionId: 'medina', colors: { 'zone-1': 'WT000' }, paletteId: 'reco-1' }, TEMPLATE_LAYOUT, 'Medina'),
      transparentColors: ['#f7f7f7'],
      bounds: { kind: 'bande', fromRow: 20, toRow: 80 },
    };
    const im: ImageLayer = { ...newImageLayer('image-1', { kind: 'collection', collectionId: 'lianes', variation: 'VAR2' }, { needles: 168, rows: 380, stitchesPerCm: 7.5, rowsPerCm: 10 }), rotation: 12 };
    const m2 = newMotifLayer('motif-2', { kind: 'importes', tileIds: ['t-1'] }, { ...TEMPLATE_LAYOUT, tilesAround: 4 });
    const d = smallDesign([newFondLayer('#223344'), m, im, m2]);
    const enc = await encodeShare({ design: designV2ToShareJson(d) }, shareDefaultsFor(2));
    expect(enc.hash.startsWith('#p=2.')).toBe(true);
    expect(enc.length).toBeLessThan(900);
    const dec = await decodeShare(enc.hash, shareDefaultsFor);
    if (!dec.ok) throw new Error(dec.reason);
    expect(designFromShare(dec.version, dec.design).design).toEqual(d);
    expect(await decodeShare('#p=3.abc', shareDefaultsFor)).toEqual({ ok: false, reason: 'version' });
    expect(await decodeShare('#p=0.abc', shareDefaultsFor)).toEqual({ ok: false, reason: 'version' });
  });

});
