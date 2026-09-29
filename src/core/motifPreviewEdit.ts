/**
 * Helpers purs pour l’édition interactive d’un aperçu de calepinage (atelier motif).
 * Clic gauche → +90° sur une case ; clic droit → variation suivante.
 */
import type { Rot } from './calepinage';

export type CellKey = `${number},${number}`;

export interface CellOverride {
  /** Rotation additionnelle (0/90/180/270). */
  rotAdd: Rot;
  /** Décalage d’indice de motif (modulo tileCount). */
  tileDelta: number;
}

export function cellKey(cx: number, cy: number): CellKey {
  return `${cx},${cy}`;
}

export function nextRot(r: Rot): Rot {
  return ((r + 90) % 360) as Rot;
}

export function bumpCellRotate(
  map: ReadonlyMap<CellKey, CellOverride>,
  cx: number,
  cy: number,
): Map<CellKey, CellOverride> {
  const key = cellKey(cx, cy);
  const cur = map.get(key) ?? { rotAdd: 0 as Rot, tileDelta: 0 };
  const next = new Map(map);
  next.set(key, { ...cur, rotAdd: nextRot(cur.rotAdd) });
  return next;
}

export function bumpCellNextTile(
  map: ReadonlyMap<CellKey, CellOverride>,
  cx: number,
  cy: number,
): Map<CellKey, CellOverride> {
  const key = cellKey(cx, cy);
  const cur = map.get(key) ?? { rotAdd: 0 as Rot, tileDelta: 0 };
  const next = new Map(map);
  next.set(key, { ...cur, tileDelta: cur.tileDelta + 1 });
  return next;
}

/** Coordonnées de case depuis un clic sur un canvas n×n. */
export function cellFromPointer(
  offsetX: number,
  offsetY: number,
  canvasSize: number,
  cells: number,
): { cx: number; cy: number } | null {
  if (canvasSize <= 0 || cells <= 0) return null;
  const cell = canvasSize / cells;
  const cx = Math.floor(offsetX / cell);
  const cy = Math.floor(offsetY / cell);
  if (cx < 0 || cy < 0 || cx >= cells || cy >= cells) return null;
  return { cx, cy };
}

/** Cycle les variations : la première passe en fin de liste. */
export function cycleVariationsFirstToLast<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  return [...items.slice(1), items[0]!];
}
