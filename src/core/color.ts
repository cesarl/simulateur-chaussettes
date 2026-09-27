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

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** OKLab (Ottosson). L ≈ clarté, a/b ≈ teinte. */
export function oklabOf(rgb: Rgb): { L: number; a: number; b: number } {
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188379 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/**
 * Distance pour choisir un fil.
 * La part OKLab rapproche les teintes ; la pénalité de chroma empêche un gris neutre
 * de partir vers un vert ou un bleu seulement parce qu’il a la même clarté.
 */
export function yarnMatchDistance(target: Rgb, candidate: Rgb): number {
  const t = oklabOf(target);
  const c = oklabOf(candidate);
  const chromaTarget = Math.hypot(t.a, t.b);
  const chromaCandidate = Math.hypot(c.a, c.b);
  const extra = Math.max(0, chromaCandidate - chromaTarget) * 2.5;
  return Math.hypot(t.L - c.L, t.a - c.a, t.b - c.b) + extra;
}
