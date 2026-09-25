import { describe, expect, it } from 'vitest';
import { buildSockMesh, fabricAt, heelWeight, sockLayout, ZONE_FOOT, ZONE_HEEL, ZONE_LEG, type SockShapeInput } from '../../reference/sock3d/sockShape';
import { buildSockAtlas } from '../../reference/sock3d/sockAtlas';
import { buildKnitMaps } from '../../reference/sock3d/knitMaps';

const HOMME: SockShapeInput = { needles: 168, cuffRows: 30, legRows: 180, heelRows: 56, footRows: 200, toeRows: 50, rowsPerCm: 10, size: 'homme' };

describe('forme 3D de référence', () => {
  const m = buildSockMesh(HOMME, 2);
  const cols = m.segments + 1;

  it('a la bonne taille de maillage et aucune valeur invalide', () => {
    expect(m.positions.length).toBe(cols * m.rings * 3);
    for (const a of [m.positions, m.normals, m.uvAtlas, m.uvStitch]) expect(a.every(Number.isFinite)).toBe(true);
    expect(m.indices.length).toBe((cols - 1) * (m.rings - 1) * 6);
  });

  it('a des UV d’atlas dans [0,1] et des normales unitaires', () => {
    expect(m.uvAtlas.every((x) => x >= 0 && x <= 1)).toBe(true);
    for (let v = 0; v < m.normals.length; v += 3 * 97) {
      expect(Math.hypot(m.normals[v]!, m.normals[v + 1]!, m.normals[v + 2]!)).toBeCloseTo(1, 3);
    }
  });

  it('est fermée sur le tour (couture) et posée sur le sol', () => {
    for (let j = 0; j < m.rings; j += 25) {
      const a = j * cols * 3;
      const b = (j * cols + m.segments) * 3;
      expect(m.positions[a]).toBeCloseTo(m.positions[b]!, 6);
      expect(m.positions[a + 1]).toBeCloseTo(m.positions[b + 1]!, 6);
    }
    let minY = Infinity;
    for (let v = 1; v < m.positions.length; v += 3) minY = Math.min(minY, m.positions[v]!);
    expect(minY).toBeGreaterThanOrEqual(0);
    expect(minY).toBeLessThan(0.003);
  });

  it('oriente les normales vers l’extérieur sur la tige', () => {
    const j = Math.floor(m.rings * 0.3);
    let out = 0;
    for (let i = 0; i < m.segments; i += 7) {
      const v = (j * cols + i) * 3;
      out += Math.sign(m.positions[v]! * m.normals[v]! + m.positions[v + 2]! * m.normals[v + 2]!);
    }
    expect(out).toBeGreaterThan(0);
  });

  it('raccourcir la tige abaisse le haut de la chaussette, le pied ne change pas', () => {
    const court = buildSockMesh({ ...HOMME, legRows: 100 }, 2);
    const top = (mm: typeof m) => { let y = 0; for (let v = 1; v < mm.positions.length; v += 3) y = Math.max(y, mm.positions[v]!); return y; };
    const tipZ = (mm: typeof m) => { let z = -1; for (let v = 2; v < mm.positions.length; v += 3) z = Math.max(z, mm.positions[v]!); return z; };
    expect(top(court)).toBeLessThan(top(m) - 0.07);
    expect(tipZ(court)).toBeCloseTo(tipZ(m), 4);
  });
});

describe('correspondance tissu ↔ grille', () => {
  const L = sockLayout(HOMME);
  it('le talon n’existe qu’à l’arrière (colonnes [0, W/2))', () => {
    expect(heelWeight(Math.PI / 2)).toBe(1);
    expect(heelWeight(Math.PI * 1.5)).toBe(0);
    const mid = (L.sBendStart + L.sBendEnd) / 2;
    expect(fabricAt(L, Math.PI / 2, mid).zone).toBe(ZONE_HEEL);
    expect(fabricAt(L, Math.PI * 1.5, mid).zone).not.toBe(ZONE_HEEL);
  });
  it('les rangs se suivent devant de la tige au pied, sans trou', () => {
    const a = fabricAt(L, Math.PI * 1.5, L.frontSplit - 1e-6);
    const b = fabricAt(L, Math.PI * 1.5, L.frontSplit + 1e-6);
    expect(a.zone).toBe(ZONE_LEG);
    expect(b.zone).toBe(ZONE_FOOT);
    expect(b.row - a.row).toBeCloseTo(HOMME.heelRows, 1); // on saute seulement les rangs du talon
  });
});

describe('atlas couleur', () => {
  it('reproduit exactement les couleurs de la grille', () => {
    const W = 168, H = 30 + 180 + 56 + 200 + 50;
    const colorIndex = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) colorIndex[r * W + c] = (r + c) % 2; // damier maille à maille
    const grid = { width: W, height: H, palette: ['#ffffff', '#000000'], colorIndex };
    const a = buildSockAtlas(HOMME, grid, { heel: '#ff0000', toe: '#00ff00' }, 3);
    expect(a.width).toBe(W);
    const L = sockLayout(HOMME);
    const span = L.sTip - L.sMin;
    // milieu de la tige, côté avant
    const s = (L.sCuffEnd + L.heelStart) / 2;
    const y = Math.floor((1 - (s - L.sMin) / span) * a.height);
    for (const col of [90, 91, 120, 150]) {
      const f = fabricAt(L, ((col + 0.5) / W) * Math.PI * 2, L.sMin + (1 - (y + 0.5) / a.height) * span);
      const expected = (Math.floor(f.row) + col) % 2 ? 0 : 255;
      expect(a.data[(y * W + col) * 4]).toBe(expected);
    }
    // couleurs de zones présentes
    const reds = [...Array(a.width * a.height).keys()].some((i) => a.data[i * 4] === 255 && a.data[i * 4 + 1] === 0);
    expect(reds).toBe(true);
  });
});

describe('cartes de maille', () => {
  it('génère une tuile de relief raccordable', () => {
    const k = buildKnitMaps(32);
    expect(k.normal.length).toBe(32 * 32 * 4);
    // bords gauche/droit proches (tuile sans couture)
    let diff = 0;
    for (let y = 0; y < 32; y++) diff += Math.abs(k.height[y * 32]! - k.height[y * 32 + 31]!);
    expect(diff / 32).toBeLessThan(0.25);
  });
});
