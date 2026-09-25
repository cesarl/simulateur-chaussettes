import { hexToRgb } from '../core/color';
import type { StitchGrid } from '../core/types';

/** Largeur d'une ligne de pixels 8 bits, alignée sur 4 octets. */
export function bmpRowStride(width: number): number {
  return (width + 3) & ~3;
}

/**
 * BMP Windows 8 bits indexé (BITMAPINFOHEADER), 1 px = 1 maille.
 * Lignes stockées de bas en haut ; palette BGRA ; remplissage de ligne à 4 octets.
 */
export function encodeIndexedBmp(grid: StitchGrid): Uint8Array {
  if (grid.palette.length > 256) {
    throw new Error('Le BMP indexé accepte au plus 256 couleurs.');
  }
  const width = grid.width;
  const height = grid.height;
  const colorCount = Math.max(1, grid.palette.length);
  const stride = bmpRowStride(width);
  const pixelBytes = stride * height;
  const paletteBytes = colorCount * 4;
  const dataOffset = 14 + 40 + paletteBytes;
  const fileSize = dataOffset + pixelBytes;
  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);

  // BITMAPFILEHEADER
  out[0] = 0x42; // B
  out[1] = 0x4d; // M
  view.setUint32(2, fileSize, true);
  view.setUint32(10, dataOffset, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positif = bas → haut
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 8, true); // bits
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, pixelBytes, true);
  view.setUint32(46, colorCount, true); // biClrUsed

  let paletteOffset = 54;
  for (const hex of grid.palette) {
    const rgb = hexToRgb(hex);
    out[paletteOffset] = rgb.b;
    out[paletteOffset + 1] = rgb.g;
    out[paletteOffset + 2] = rgb.r;
    out[paletteOffset + 3] = 0;
    paletteOffset += 4;
  }
  if (grid.palette.length === 0) {
    out[54] = 0;
    out[55] = 0;
    out[56] = 0;
    out[57] = 0;
  }

  for (let row = 0; row < height; row++) {
    const gridRow = height - 1 - row;
    const dest = dataOffset + row * stride;
    const source = gridRow * width;
    for (let col = 0; col < width; col++) {
      out[dest + col] = grid.colorIndex[source + col] ?? 0;
    }
  }
  return out;
}
