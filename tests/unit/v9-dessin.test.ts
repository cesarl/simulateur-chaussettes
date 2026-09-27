/**
 * V9 — calque Dessin (pixel art maille par maille) dans src/core/layers.ts.
 * Ne pas modifier pour « faire passer » : corriger le code.
 */
import { describe, expect, it } from 'vitest';
import { encodeShare, decodeShare } from '../../src/io/shareLink';
import { defaultDesign } from '../../src/state';
import {
  decodeDessinCells,
  designFromShare,
  designV2ToShareJson,
  dessinCellsForGauge,
  dessinUsedColors,
  encodeDessinCells,
  faceGuides,
  floodCells,
  lineCells,
  mirrorCells,
  newDessinLayer,
  newFondLayer,
  normalizeStack,
  paintDessin,
  replaceDessinColor,
  dessinFromRender,
  rectCells,
  renderStack,
  rgbKeys,
  rowsOfCells,
  shareDefaultsFor,
  stackGauge,
  suggestStackPalette,
  type DessinLayer,
  type SockDesignV2,
} from '../../src/core/layers';

const d0 = defaultDesign(); // homme : 168 aiguilles, tige 180 rangs, pied 200 rangs (motif sur le pied)
const g = stackGauge(d0.dimensions, d0.zones);
const W = g.needles;
const H = g.rows;
const px = (rgb: Uint8ClampedArray, x: number, y: number) => [...rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];

describe('codage des cases', () => {
  it('exemple documenté et aller-retour', () => {
    const w = 8;
    const cells = new Uint8Array(w * 3);
    for (let y = 0; y < 3; y++) cells[y * w + 2] = cells[y * w + 3] = 1;
    expect(encodeDessinCells(cells)).toBe('2.2A6.2A6.2A');
    expect([...decodeDessinCells('2.2A6.2A6.2A', w, 3)]).toEqual([...cells]);
    const rnd = new Uint8Array(40 * 30).map((_, i) => ((i * 7919) % 13) % 4);
    expect([...decodeDessinCells(encodeDessinCells(rnd), 40, 30)]).toEqual([...rnd]);
    expect(encodeDessinCells(new Uint8Array(100))).toBe('');
    expect(() => decodeDessinCells('3A??', 8, 3)).toThrow();
  });
});

describe('la ligne du tendon d’Achille (demande de l’ami de César)', () => {
  const dos = faceGuides(W).find((f) => f.label === 'Dos')!.col; // 42
  const tige = d0.dimensions.legRows; // 180
  let dessin = newDessinLayer('dessin-1', W, H);
  dessin = paintDessin(dessin, W, H, lineCells(dos, 0, dos, tige - 1, W, 2, true), '#1d1d1b');

  it('2 mailles de large sur toute la tige, au milieu du dos, s’arrête au talon', () => {
    const layers = normalizeStack([newFondLayer('#ffffff'), dessin]);
    const { rgb, owner } = renderStack({ layers, gauge: g, motifRgb: new Map(), images: new Map() });
    for (const y of [0, 90, tige - 1]) {
      expect(px(rgb, dos, y)).toEqual([0x1d, 0x1d, 0x1b]);
      expect(px(rgb, dos + 1, y)).toEqual([0x1d, 0x1d, 0x1b]);
      expect(px(rgb, dos - 1, y)).toEqual([255, 255, 255]);
      expect(px(rgb, dos + 2, y)).toEqual([255, 255, 255]);
      expect(owner[y * W + dos]).toBe(1);
    }
    expect(px(rgb, dos, tige)).toEqual([255, 255, 255]); // 1er rang du pied : plus de trait
    expect(dessinUsedColors(dessin)).toEqual(['#1d1d1b']);
  });

  it('tient dans un lien court', async () => {
    const design: SockDesignV2 = { ...d0, layers: normalizeStack([...d0.layers, dessin]) };
    const enc = await encodeShare({ design: designV2ToShareJson(design) }, shareDefaultsFor(2));
    const encSans = await encodeShare({ design: designV2ToShareJson(d0) }, shareDefaultsFor(2));
    expect(enc.length - encSans.length).toBeLessThan(120);
    const dec = await decodeShare(enc.hash, shareDefaultsFor);
    if (!dec.ok) throw new Error(dec.reason);
    expect(designFromShare(dec.version, dec.design).design).toEqual(design);
  });

  it('taille femme (144 aiguilles) : le trait reste au milieu du dos', () => {
    const cells = dessinCellsForGauge(dessin, 144, H);
    const cols = [...Array(144).keys()].filter((x) => cells[50 * 144 + x]);
    expect(cols).toEqual([36, 37]); // 144 / 4 = 36
  });
});

describe('outils', () => {
  it('gomme, palette compactée, couleur transparente, calque caché', () => {
    let l: DessinLayer = newDessinLayer('dessin-1', W, H);
    l = paintDessin(l, W, H, rectCells(10, 10, 19, 19, W), '#ff0000');
    l = paintDessin(l, W, H, rectCells(12, 12, 13, 13, W), '#00ff00');
    expect(l.palette).toEqual(['#ff0000', '#00ff00']);
    l = paintDessin(l, W, H, rectCells(12, 12, 13, 13, W), null); // gomme
    expect(l.palette).toEqual(['#ff0000']);
    const render = (layer: DessinLayer) =>
      renderStack({ layers: normalizeStack([newFondLayer('#ffffff'), layer]), gauge: g, motifRgb: new Map(), images: new Map() }).rgb;
    expect(px(render(l), 12, 12)).toEqual([255, 255, 255]); // effacé → Fond
    expect(px(render(l), 15, 15)).toEqual([255, 0, 0]);
    expect(px(render({ ...l, transparentColors: ['#FF0000'] }), 15, 15)).toEqual([255, 255, 255]);
    expect(px(render({ ...l, hidden: true }), 15, 15)).toEqual([255, 255, 255]);
    expect(suggestStackPalette({ layers: normalizeStack([newFondLayer('#ffffff'), l]), motifRgb: new Map(), images: new Map() })).toEqual(['#ffffff', '#ff0000']);
  });

  it('trait par le raccord, trait droit avec Maj, rectangle creux', () => {
    const cross = lineCells(W - 2, 5, 1, 5, W);
    expect(cross.map(([x]) => x)).toEqual([W - 2, W - 1, 0, 1]); // chemin le plus court
    const straight = lineCells(10, 10, 12, 40, W, 1, true);
    expect(new Set(straight.map(([x]) => x))).toEqual(new Set([10])); // presque vertical → vertical
    expect(rectCells(0, 0, 3, 3, W, false)).toHaveLength(12);
  });

  it('pot de peinture d’après les couleurs visibles, circulaire', () => {
    const rgb = new Uint8ClampedArray(W * 4 * 3).fill(255);
    for (let y = 0; y < 4; y++) rgb.set([0, 0, 0], (y * W + 5) * 3); // colonne noire en x = 5
    const area = floodCells(rgbKeys(rgb), W, 4, 0, 0);
    expect(area).toHaveLength((W - 1) * 4); // tout sauf la colonne noire : on fait le tour par le raccord
  });

  it('symétrie autour d’un repère de face ; rangs touchés', () => {
    const devant = (3 * W) / 4; // 126
    expect(mirrorCells([[120, 3], [125, 3], [126, 3]], devant, W)).toEqual([[131, 3], [126, 3], [125, 3]]);
    expect(mirrorCells([[2, 0]], 0, W)).toEqual([[W - 3, 0]]); // autour de l'intérieur, par le raccord
    expect(rowsOfCells([[0, 7], [3, 12]], H)).toEqual([7, 13]);
  });

  it('rendu partiel pendant un trait = rendu complet', () => {
    let l = newDessinLayer('dessin-1', W, H);
    const base = normalizeStack([newFondLayer('#ffffff'), l]);
    let result = renderStack({ layers: base, gauge: g, motifRgb: new Map(), images: new Map() });
    const stroke = lineCells(20, 30, 60, 45, W, 3);
    l = paintDessin(l, W, H, stroke, '#123456');
    const layers = normalizeStack([newFondLayer('#ffffff'), l]);
    result = renderStack({ layers, gauge: g, motifRgb: new Map(), images: new Map() }, { rows: rowsOfCells(stroke, H), into: result });
    const full = renderStack({ layers, gauge: g, motifRgb: new Map(), images: new Map() });
    expect(Buffer.from(result.rgb).equals(Buffer.from(full.rgb))).toBe(true);
  });
});

describe('retouches', () => {
  it('remplacer une couleur (simple et avec fusion)', () => {
    let l = newDessinLayer('dessin-1', W, H);
    l = paintDessin(l, W, H, rectCells(0, 0, 4, 4, W), '#ff0000');
    l = paintDessin(l, W, H, rectCells(10, 0, 14, 4, W), '#0000ff');
    expect(replaceDessinColor(l, '#FF0000', '#00ff00').palette).toEqual(['#00ff00', '#0000ff']);
    const merged = replaceDessinColor(l, '#ff0000', '#0000ff');
    expect(merged.palette).toEqual(['#0000ff']);
    const cells = dessinCellsForGauge(merged, W, H);
    expect(cells[2 * W + 2]).toBe(1);
    expect(cells[2 * W + 12]).toBe(1);
  });

  it('transformer un calque en dessin : même rendu', () => {
    let src = newDessinLayer('dessin-1', W, H);
    src = paintDessin(src, W, H, lineCells(5, 5, 80, 60, W, 3), '#aa3300');
    src = paintDessin(src, W, H, rectCells(100, 100, 120, 130, W), '#003366');
    const layers = normalizeStack([newFondLayer('#ffffff'), src]);
    const r = renderStack({ layers, gauge: g, motifRgb: new Map(), images: new Map() });
    const copy = dessinFromRender('dessin-2', 'Copie', 1, r.rgb, r.owner, W, H);
    const r2 = renderStack({ layers: normalizeStack([newFondLayer('#ffffff'), copy]), gauge: g, motifRgb: new Map(), images: new Map() });
    expect(Buffer.from(r2.rgb).equals(Buffer.from(r.rgb))).toBe(true);
    expect(copy.palette.sort()).toEqual(['#003366', '#aa3300']);
  });
});
