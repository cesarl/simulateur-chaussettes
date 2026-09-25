import { describe, expect, it } from 'vitest';
import { encodeIndexedBmp, bmpRowStride } from '../../src/io/exportBmp';
import { Zone, type StitchGrid } from '../../src/core/types';

function gridOf(width: number, height: number, palette: string[], indices: number[]): StitchGrid {
  return {
    width,
    height,
    palette,
    colorIndex: Uint8Array.from(indices),
    zone: new Uint8Array(width * height).fill(Zone.Leg),
  };
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

describe('encodeIndexedBmp', () => {
  it('écrit un BMP 8 bits indexé, bas en haut, avec remplissage à 4 octets', () => {
    // 3×2 : stride = 4 (3 indices + 1 octet de padding)
    const grid = gridOf(3, 2, ['#ff0000', '#00ff00'], [0, 1, 0, 1, 0, 1]);
    const bytes = encodeIndexedBmp(grid);

    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe('BM');
    expect(readU16(bytes, 28)).toBe(8); // biBitCount
    expect(readU32(bytes, 18)).toBe(3); // biWidth
    expect(readU32(bytes, 22) | 0).toBe(2); // biHeight positive = bottom-up
    expect(bmpRowStride(3)).toBe(4);

    const paletteOffset = 14 + 40;
    // Rouge #ff0000 → B,G,R,0
    expect([...bytes.subarray(paletteOffset, paletteOffset + 4)]).toEqual([0, 0, 255, 0]);
    // Vert #00ff00
    expect([...bytes.subarray(paletteOffset + 4, paletteOffset + 8)]).toEqual([0, 255, 0, 0]);

    const dataOffset = readU32(bytes, 10);
    expect(dataOffset).toBe(paletteOffset + 2 * 4);
    // Première ligne du fichier = bas de l'image = rang 1 : 1,0,1 + pad
    expect([...bytes.subarray(dataOffset, dataOffset + 4)]).toEqual([1, 0, 1, 0]);
    // Deuxième ligne = rang 0 : 0,1,0 + pad
    expect([...bytes.subarray(dataOffset + 4, dataOffset + 8)]).toEqual([0, 1, 0, 0]);
    expect(bytes.length).toBe(dataOffset + 2 * 4);
    expect(readU32(bytes, 2)).toBe(bytes.length);
  });

  it('refuse plus de 256 couleurs', () => {
    const palette = Array.from({ length: 257 }, (_, i) => {
      const v = (i % 255).toString(16).padStart(2, '0');
      return `#${v}${v}${v}`;
    });
    const grid = gridOf(1, 1, palette, [0]);
    expect(() => encodeIndexedBmp(grid)).toThrow(/256/);
  });
});
