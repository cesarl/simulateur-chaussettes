import { describe, expect, it } from 'vitest';
import {
  addLayer, EMPTY_COMPOSITION, hitTest, isLinkShareable, layerCorners, moveLayer, renderComposition, updateLayer,
  type Composition, type RasterImage,
} from '../../reference/composition/composition';

const g = { needles: 40, rows: 40, stitchesPerCm: 10, rowsPerCm: 10 }; // mailles carrées pour lire facilement
// image 2×2 : HG rouge, HD vert, BG bleu, BD transparent
const img: RasterImage = { width: 2, height: 2, rgba: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]) };
const images = new Map([['e:a', img]]);
const at = (r: ReturnType<typeof renderComposition>, x: number, y: number) => Array.from(r.rgb.slice((y * g.needles + x) * 3, (y * g.needles + x) * 3 + 3));

function oneLayer(patch = {}): Composition {
  let c = addLayer({ ...EMPTY_COMPOSITION, background: '#ffffff' }, { kind: 'embarquee', assetId: 'a' }, g, 'L1');
  return updateLayer(c, 'L1', { x: 20, y: 20, widthStitches: 10, ...patch });
}

describe('composition libre', () => {
  it('place l’image au bon endroit, avec sa transparence', () => {
    const r = renderComposition(oneLayer(), images, g);
    expect(at(r, 16, 16)).toEqual([255, 0, 0]); // quart haut-gauche
    expect(at(r, 23, 16)).toEqual([0, 255, 0]);
    expect(at(r, 16, 23)).toEqual([0, 0, 255]);
    expect(at(r, 23, 23)).toEqual([255, 255, 255]); // transparent → fond
    expect(at(r, 2, 2)).toEqual([255, 255, 255]);
  });
  it('fait le tour de la jambe : ce qui dépasse à droite revient à gauche', () => {
    const r = renderComposition(oneLayer({ x: 39 }), images, g);
    expect(at(r, 36, 16)).toEqual([255, 0, 0]);
    expect(at(r, 2, 16)).toEqual([0, 255, 0]);
  });
  it('rotation de 90° (sens horaire) : le rouge passe en haut à droite', () => {
    const r = renderComposition(oneLayer({ rotation: 90 }), images, g);
    expect(at(r, 23, 16)).toEqual([255, 0, 0]);
    expect(at(r, 16, 16)).toEqual([0, 0, 255]);
  });
  it('garde les proportions réelles quand les mailles sont plus larges que hautes', () => {
    const g2 = { ...g, stitchesPerCm: 7.5, rowsPerCm: 10 };
    const c = oneLayer({ widthStitches: 15 });
    const corners = layerCorners(c.layers[0]!, img, g2);
    const wStitches = corners[1]![0] - corners[0]![0];
    const hRows = corners[3]![1] - corners[0]![1];
    expect(hRows / wStitches).toBeCloseTo(10 / 7.5, 3); // un carré réel = plus de rangs que de mailles
  });
  it('ordre des calques, sélection et partage par lien', () => {
    let c = oneLayer();
    c = addLayer(c, { kind: 'collection', collectionId: 'medina', variation: 'VAR1' }, g, 'L2');
    c = updateLayer(c, 'L2', { x: 20, y: 20, widthStitches: 10 });
    const imgs = new Map([['e:a', img], ['c:medina/VAR1', img]]);
    expect(hitTest(c, imgs, g, 16, 16)).toBe('L2'); // au-dessus
    expect(hitTest(moveLayer(c, 'L2', 'dessous'), imgs, g, 16, 16)).toBe('L1');
    expect(isLinkShareable(c)).toBe(false); // image embarquée → pas de lien
    expect(isLinkShareable({ ...c, layers: c.layers.filter((l) => l.id === 'L2') })).toBe(true);
  });
});
