import { describe, expect, it } from 'vitest';
import { rowRanges } from '../../src/core/grid';
import { defaultDimensions } from '../../src/core/sizes';
import { sockPositions, sockUvs } from '../../src/render/sockGeometry';
import type { SockDimensions, ZoneSettings } from '../../src/core/types';

function zones(cuffEnabled: boolean): ZoneSettings {
  return {
    cuffEnabled,
    cuffColor: '#112233',
    heelColor: '#445566',
    toeColor: '#778899',
    patternOnFoot: false,
    footColor: '#aabbcc',
  };
}

function smallSock(): SockDimensions {
  return {
    ...defaultDimensions('homme'),
    needles: 16,
    cuffRows: 2,
    legRows: 6,
    heelRows: 4,
    footRows: 6,
    toeRows: 4,
  };
}

function vertex(positions: Float32Array, stride: number, col: number, row: number): [number, number, number] {
  const offset = (row * stride + col) * 3;
  return [positions[offset] ?? NaN, positions[offset + 1] ?? NaN, positions[offset + 2] ?? NaN];
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('maillage de chaussette', () => {
  const dims = smallSock();
  const z = zones(true);
  const rows = rowRanges(dims, z).toe.end;
  const stride = dims.needles + 1;

  it('a le bon nombre de sommets, des UV dans [0,1] et aucune coordonnée NaN', () => {
    const positions = sockPositions(dims, z);
    const uvs = sockUvs(dims, z);
    expect(positions.length / 3).toBe(stride * (rows + 1));
    expect(uvs.length / 2).toBe(stride * (rows + 1));
    for (let i = 0; i < positions.length; i++) expect(Number.isFinite(positions[i])).toBe(true);
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= dims.needles; col++) {
        const offset = (row * stride + col) * 2;
        const u = uvs[offset] ?? NaN;
        const v = uvs[offset + 1] ?? NaN;
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(u).toBeCloseTo(col / dims.needles, 5);
        expect(v).toBeCloseTo(rows === 0 ? 0 : row / rows, 5);
      }
    }
  });

  it('ferme le tour : la colonne needles coïncide avec la colonne 0', () => {
    const positions = sockPositions(dims, z);
    for (let row = 0; row <= rows; row++) {
      expect(distance(vertex(positions, stride, 0, row), vertex(positions, stride, dims.needles, row))).toBeLessThan(1e-5);
    }
  });

  it('aplatit les rangs de talon sur l’avant et creuse la poche arrière', () => {
    const positions = sockPositions(dims, z);
    const ranges = rowRanges(dims, z);
    const half = dims.needles / 2;
    for (let col = half; col < dims.needles; col++) {
      const origin = vertex(positions, stride, col, ranges.heel.start);
      for (let row = ranges.heel.start; row <= ranges.heel.end; row++) {
        expect(distance(origin, vertex(positions, stride, col, row))).toBeLessThan(1e-4);
      }
    }
    const backCol = Math.floor(half / 2);
    const heelStart = vertex(positions, stride, backCol, ranges.heel.start);
    const heelEnd = vertex(positions, stride, backCol, ranges.heel.end);
    expect(distance(heelStart, heelEnd)).toBeGreaterThan(0.0005);
    expect(heelEnd[1]).toBeLessThan(heelStart[1]);
  });

  it('reste fini pour les tailles homme et femme', () => {
    for (const size of ['homme', 'femme'] as const) {
      const preset = defaultDimensions(size);
      const positions = sockPositions(preset, zones(true));
      const total = (preset.cuffRows + preset.legRows + preset.heelRows + preset.footRows + preset.toeRows);
      expect(positions.length / 3).toBe((preset.needles + 1) * (total + 1));
      for (let i = 0; i < positions.length; i++) expect(Number.isFinite(positions[i])).toBe(true);
    }
  });
});
