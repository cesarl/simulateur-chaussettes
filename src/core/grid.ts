import { normalizeHex } from './color';
import type { Hex, SockDimensions, StitchGrid, ZoneId, ZoneSettings } from './types';
import { Zone } from './types';

/**
 * Convention d'orientation :
 * la colonne 0 est sur le côté intérieur de la jambe.
 * Colonnes [0, needles/2) = arrière (talon, semelle).
 * Colonnes [needles/2, needles) = avant (devant de jambe, cou-de-pied).
 * Le raccord circulaire tombe donc sur le côté intérieur, le moins visible.
 * Talon et pointe n'occupent que la moitié arrière ; l'autre moitié vaut Zone.Empty.
 */

/** Couleur des mailles de motif quand aucun échantillon n'est fourni. */
export const PATTERN_BACKGROUND: Hex = '#f4f1ea';

/** Couleur des cellules hors tricot (moitié vide du talon et de la pointe). */
export const EMPTY_STITCH_COLOR: Hex = '#d9d4cc';

export interface RowSpan {
  /** Rang inclus. */
  start: number;
  /** Rang exclus. */
  end: number;
}

export interface RowRanges {
  cuff: RowSpan;
  leg: RowSpan;
  heel: RowSpan;
  foot: RowSpan;
  toe: RowSpan;
}

/** Début et fin de chaque zone. Bord-côte absent = intervalle vide (0 rang). */
export function rowRanges(dims: SockDimensions, zones: ZoneSettings): RowRanges {
  let cursor = 0;
  const take = (rows: number): RowSpan => {
    const start = cursor;
    cursor += Math.max(0, rows);
    return { start, end: cursor };
  };
  return {
    cuff: take(zones.cuffEnabled ? dims.cuffRows : 0),
    leg: take(dims.legRows),
    heel: take(dims.heelRows),
    foot: take(dims.footRows),
    toe: take(dims.toeRows),
  };
}

function halfNeedles(needles: number): number {
  return Math.floor(needles / 2);
}

/** Carte de zones, index = rang * aiguilles + colonne. */
export function buildZoneMap(dims: SockDimensions, zones: ZoneSettings): Uint8Array {
  const ranges = rowRanges(dims, zones);
  const width = dims.needles;
  const height = ranges.toe.end;
  const map = new Uint8Array(width * height);
  const back = halfNeedles(width);

  const fill = (span: RowSpan, zone: ZoneId, backOnly: boolean): void => {
    for (let row = span.start; row < span.end; row++) {
      const offset = row * width;
      for (let col = 0; col < width; col++) {
        map[offset + col] = backOnly && col >= back ? Zone.Empty : zone;
      }
    }
  };

  fill(ranges.cuff, Zone.Cuff, false);
  fill(ranges.leg, Zone.Leg, false);
  fill(ranges.heel, Zone.Heel, true);
  fill(ranges.foot, Zone.Foot, false);
  fill(ranges.toe, Zone.Toe, true);
  return map;
}

function isMotifCell(zone: number, zones: ZoneSettings): boolean {
  if (zone === Zone.Leg) return true;
  return zone === Zone.Foot && zones.patternOnFoot;
}

/**
 * Assemble la grille complète.
 * `patternColors` indexe `patternPalette` pour les mailles de motif seulement
 * (tige, et pied si `patternOnFoot`), en parcours rang par rang, colonne par colonne.
 * `null` remplit ces mailles d'une couleur de fond.
 * La palette finale = couleurs de zones réellement présentes + palette du motif, sans doublon.
 */
export function composeGrid(
  dims: SockDimensions,
  zones: ZoneSettings,
  patternColors: Uint8Array | null,
  patternPalette: readonly string[],
): StitchGrid {
  const zone = buildZoneMap(dims, zones);
  const width = dims.needles;
  const height = width === 0 ? 0 : zone.length / width;
  const palette: Hex[] = [];
  const indexByColor = new Map<string, number>();

  const add = (hex: string): number => {
    const key = normalizeHex(hex);
    const existing = indexByColor.get(key);
    if (existing !== undefined) return existing;
    const index = palette.length;
    palette.push(key);
    indexByColor.set(key, index);
    return index;
  };

  if (zones.cuffEnabled && dims.cuffRows > 0) add(zones.cuffColor);
  if (dims.heelRows > 0) add(zones.heelColor);
  if (dims.toeRows > 0) add(zones.toeColor);
  if (!zones.patternOnFoot && dims.footRows > 0) add(zones.footColor);

  const motifPalette = patternPalette.map((hex) => normalizeHex(hex));
  for (const color of motifPalette) add(color);

  const background = motifPalette[0] ?? PATTERN_BACKGROUND;
  const colorIndex = new Uint8Array(zone.length);
  let motifCursor = 0;

  for (let i = 0; i < zone.length; i++) {
    const cell = zone[i] ?? Zone.Empty;
    if (cell === Zone.Empty) {
      colorIndex[i] = add(EMPTY_STITCH_COLOR);
      continue;
    }
    if (cell === Zone.Cuff) {
      colorIndex[i] = add(zones.cuffColor);
      continue;
    }
    if (cell === Zone.Heel) {
      colorIndex[i] = add(zones.heelColor);
      continue;
    }
    if (cell === Zone.Toe) {
      colorIndex[i] = add(zones.toeColor);
      continue;
    }
    if (cell === Zone.Foot && !zones.patternOnFoot) {
      colorIndex[i] = add(zones.footColor);
      continue;
    }
    if (!isMotifCell(cell, zones)) {
      colorIndex[i] = add(EMPTY_STITCH_COLOR);
      continue;
    }
    if (patternColors === null) {
      colorIndex[i] = add(background);
      continue;
    }
    const paletteIndex = patternColors[motifCursor] ?? 0;
    motifCursor += 1;
    colorIndex[i] = add(motifPalette[paletteIndex] ?? background);
  }

  return { width, height, palette, colorIndex, zone };
}

/** Empreinte stable de la grille (largeur, hauteur, indices, palette). */
export function gridFingerprint(grid: StitchGrid): string {
  let hash = 2166136261;
  const mix = (value: number): void => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  };
  mix(grid.width);
  mix(grid.height);
  for (const byte of grid.colorIndex) mix(byte);
  for (const color of grid.palette) {
    for (let index = 0; index < color.length; index++) mix(color.charCodeAt(index));
  }
  return (hash >>> 0).toString(16);
}
