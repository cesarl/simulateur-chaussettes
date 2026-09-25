import { describe, expect, it } from 'vitest';
import { heightToNormal } from '../../reference/decor/tileSurface';

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
