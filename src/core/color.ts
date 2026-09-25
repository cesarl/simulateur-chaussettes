import type { Hex } from './types';

/** Composantes RVB 0–255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Convertit `#rrggbb` (casse indifférente) en composantes. */
export function hexToRgb(hex: string): Rgb {
  const body = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(body)) {
    throw new Error(`Couleur hexadécimale invalide : ${hex}`);
  }
  return {
    r: Number.parseInt(body.slice(0, 2), 16),
    g: Number.parseInt(body.slice(2, 4), 16),
    b: Number.parseInt(body.slice(4, 6), 16),
  };
}

function channel(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, '0');
}

/** Convertit des composantes RVB en `#rrggbb` minuscule. */
export function rgbToHex(r: number, g: number, b: number): Hex {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Normalise une couleur vers `#rrggbb` minuscule. */
export function normalizeHex(hex: string): Hex {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b);
}

/**
 * Distance perceptuelle « redmean » (approximation rapide).
 * Même couleur → 0. Une paire proche reste plus petite qu’une paire éloignée.
 */
export function colorDistance(a: Rgb, b: Rgb): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const weightR = 2 + rMean / 256;
  const weightG = 4;
  const weightB = 2 + (255 - rMean) / 256;
  return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
}
