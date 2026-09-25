import raw from '../../config/sizes.json';
import type { SizeId, SockDimensions } from './types';

export interface SizePreset {
  label: string;
  needles: number;
  cuffRows: number;
  legRowsMax: number;
  heelRows: number;
  footRows: number;
  toeRows: number;
  stitchesPerCm: number;
  rowsPerCm: number;
}

export interface MachineLimits {
  maxColorsTotal: number;
  maxColorsPerRow: number;
  maxFloat: number;
}

export const SIZE_PRESETS: Record<SizeId, SizePreset> = raw.sizes;
export const MACHINE_LIMITS: MachineLimits = raw.machine;

/** Dimensions par défaut d'une taille (tige à sa hauteur max). */
export function defaultDimensions(size: SizeId): SockDimensions {
  const p = SIZE_PRESETS[size];
  return {
    size,
    needles: p.needles,
    cuffRows: p.cuffRows,
    legRows: p.legRowsMax,
    heelRows: p.heelRows,
    footRows: p.footRows,
    toeRows: p.toeRows,
    stitchesPerCm: p.stitchesPerCm,
    rowsPerCm: p.rowsPerCm,
  };
}

/** Hauteur totale en rangs (bord-côte inclus seulement s'il est présent). */
export function totalRows(d: SockDimensions, cuffEnabled: boolean): number {
  return (cuffEnabled ? d.cuffRows : 0) + d.legRows + d.heelRows + d.footRows + d.toeRows;
}

/** Rapport hauteur/largeur d'une maille (≈ 0,75 : une maille est plus large que haute). */
export function stitchAspect(d: SockDimensions): number {
  return d.stitchesPerCm / d.rowsPerCm;
}

/** La tige peut être raccourcie, jamais allongée au-delà du maximum de la taille. */
export function clampLegRows(size: SizeId, legRows: number): number {
  const max = SIZE_PRESETS[size].legRowsMax;
  return Math.max(1, Math.min(max, Math.round(legRows)));
}
