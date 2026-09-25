import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DECOR,
  heightToNormal,
  tileCmFromFormat,
} from '../../src/render/decor/tileSurface';

describe('décor : relief des carreaux', () => {
  it('surface plate → normale verticale', () => {
    const n = heightToNormal(new Float32Array(16).fill(1), 4, 4, 3);
    expect([n[0], n[1], n[2]]).toEqual([128, 128, 255]);
  });
  it('le joint creusé incline les normales vers l’extérieur du joint', () => {
    // colonne 2 = joint (hauteur 0), reste = carreau (1)
    const w = 5, h = 3;
    const H = new Float32Array(w * h).fill(1);
    for (let y = 0; y < h; y++) H[y * w + 2] = 0;
    const n = heightToNormal(H, w, h, 3);
    const px = (x: number) => n[(1 * w + x) * 4]!;
    expect(px(1)).toBeGreaterThan(128); // à gauche du joint, la pente descend vers la droite → normale vers +x
    expect(px(3)).toBeLessThan(128);
  });
});

describe('décor : format et réglages par défaut', () => {
  it('lit le format de la collection', () => {
    expect(tileCmFromFormat('20x20')).toBe(20);
    expect(tileCmFromFormat('10x10')).toBe(10);
    expect(tileCmFromFormat('15 × 15')).toBe(15);
    expect(tileCmFromFormat('')).toBe(20);
    expect(tileCmFromFormat(null, 12)).toBe(12);
  });
  it('par défaut : couleurs franches, joint fin et clair, grain présent', () => {
    expect(DEFAULT_DECOR.attenuation).toBe(0);
    expect(DEFAULT_DECOR.groutMm).toBeLessThanOrEqual(2);
    expect(DEFAULT_DECOR.groutColor.toLowerCase()).toBe('#f3f1ec');
    expect(DEFAULT_DECOR.grainStrength).toBeGreaterThan(0);
  });
  it('taille réelle : ~2,4 m de côté et px par carreau sous 4096', () => {
    const side20 = Math.round(240 / 20);
    const side10 = Math.round(240 / 10);
    expect(side20 * 256).toBeLessThanOrEqual(4096);
    expect(side10 * 160).toBeLessThanOrEqual(4096);
    expect(side10).toBeGreaterThan(side20);
  });
});
