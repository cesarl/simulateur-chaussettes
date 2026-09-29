/**
 * Helpers purs pour l’édition interactive d’un aperçu de calepinage (atelier motif).
 * Clic gauche → +90° sur une case ; clic droit → variation suivante.
 * Persistance : overrides relatifs + rotationGlobale (API / brouillon / reload).
 */
import {
  planPlacements,
  type CalepinageSpec,
  type Preset,
  type PresetCell,
  type Rot,
} from './calepinage';
import { BUILTIN_PRESETS, resolvePreset } from './presets';

export type CellKey = `${number},${number}`;

export interface CellOverride {
  /** Rotation additionnelle (0/90/180/270). */
  rotAdd: Rot;
  /** Décalage d’indice de motif (modulo tileCount). */
  tileDelta: number;
}

/** Case sérialisable (API D1 / brouillon localStorage). */
export type StoredCellOverride = {
  cx: number;
  cy: number;
  rotAdd: Rot;
  tileDelta: number;
};

/**
 * Calepinage personnalisé édité dans la preview motif.
 * `baseId` = calepinageParDefaut ; overrides relatifs à ce plan.
 */
export type CalepinagePerso = {
  cells: number;
  rotationGlobale: Rot;
  overrides: StoredCellOverride[];
};

export const PERSO_PRESET_ID = 'perso';

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

const ROTS: ReadonlySet<number> = new Set([0, 90, 180, 270]);

function asRot(v: unknown, fallback: Rot = 0): Rot {
  const n = typeof v === 'number' ? v : Number(v);
  return ROTS.has(n) ? (n as Rot) : fallback;
}

export function overridesToStored(map: ReadonlyMap<CellKey, CellOverride>): StoredCellOverride[] {
  const out: StoredCellOverride[] = [];
  for (const [key, ov] of map) {
    if (ov.rotAdd === 0 && ov.tileDelta === 0) continue;
    const parts = key.split(',');
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    if (!Number.isInteger(cx) || !Number.isInteger(cy)) continue;
    out.push({
      cx,
      cy,
      rotAdd: asRot(ov.rotAdd),
      tileDelta: Math.trunc(ov.tileDelta) || 0,
    });
  }
  return out.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
}

export function storedToOverrides(stored: readonly StoredCellOverride[]): Map<CellKey, CellOverride> {
  const map = new Map<CellKey, CellOverride>();
  for (const o of stored) {
    if (!Number.isInteger(o.cx) || !Number.isInteger(o.cy)) continue;
    const rotAdd = asRot(o.rotAdd);
    const tileDelta = Math.trunc(o.tileDelta) || 0;
    if (rotAdd === 0 && tileDelta === 0) continue;
    map.set(cellKey(o.cx, o.cy), { rotAdd, tileDelta });
  }
  return map;
}

/**
 * Sérialise l’état preview. `null` si aucune personnalisation
 * (pas d’override et rotationGlobale à 0).
 */
export function serializeCalepinagePerso(
  cells: number,
  rotationGlobale: Rot,
  map: ReadonlyMap<CellKey, CellOverride>,
): CalepinagePerso | null {
  const overrides = overridesToStored(map);
  const rot = asRot(rotationGlobale);
  if (overrides.length === 0 && rot === 0) return null;
  return {
    cells: Math.max(1, Math.round(cells)),
    rotationGlobale: rot,
    overrides,
  };
}

/** Valide / normalise une charge utile API ou brouillon. */
export function parseCalepinagePerso(raw: unknown): CalepinagePerso | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const cells = typeof o.cells === 'number' && Number.isFinite(o.cells) ? Math.max(1, Math.round(o.cells)) : 4;
  const rotationGlobale = asRot(o.rotationGlobale);
  if (!Array.isArray(o.overrides)) return null;
  const overrides: StoredCellOverride[] = [];
  for (const item of o.overrides) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const c = item as Record<string, unknown>;
    const cx = typeof c.cx === 'number' ? Math.trunc(c.cx) : NaN;
    const cy = typeof c.cy === 'number' ? Math.trunc(c.cy) : NaN;
    if (!Number.isInteger(cx) || !Number.isInteger(cy) || cx < 0 || cy < 0 || cx >= cells || cy >= cells) {
      continue;
    }
    const rotAdd = asRot(c.rotAdd);
    const tileDelta = typeof c.tileDelta === 'number' ? Math.trunc(c.tileDelta) : 0;
    if (rotAdd === 0 && tileDelta === 0) continue;
    overrides.push({ cx, cy, rotAdd, tileDelta });
  }
  overrides.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  if (overrides.length === 0 && rotationGlobale === 0) return null;
  return { cells, rotationGlobale, overrides };
}

/**
 * Bake un préréglage `perso` (placements absolus) pour le simulateur.
 * La rotationGlobale est déjà appliquée dans le plan → preset à rotationGlobale 0.
 */
export function bakePersoPreset(
  baseSpec: CalepinageSpec,
  perso: CalepinagePerso,
  tileCount: number,
  library: readonly Preset[] = BUILTIN_PRESETS,
): Preset {
  const n = Math.max(1, perso.cells);
  const count = Math.max(1, tileCount);
  const spec: CalepinageSpec = { ...baseSpec, rotationGlobale: perso.rotationGlobale };
  const preset = resolvePreset(spec, library);
  const plan = planPlacements(spec, { tileCount: count, preset, tilesAround: n }, n, n);
  const map = storedToOverrides(perso.overrides);
  const cells: PresetCell[] = [];
  let tilesUsed = 0;
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const p = plan[cy * n + cx]!;
      const ov = map.get(cellKey(cx, cy));
      const rotAdd = ov?.rotAdd ?? 0;
      const tileDelta = ov?.tileDelta ?? 0;
      const tile = (p.tile + tileDelta) % count;
      const rot = ((p.rot + rotAdd) % 360) as Rot;
      cells.push({ tile, rot });
      tilesUsed = Math.max(tilesUsed, tile + 1);
    }
  }
  return {
    id: PERSO_PRESET_ID,
    nom: 'Personnalisé',
    famille: 'Personnalisé',
    blockW: n,
    blockH: n,
    cells,
    tilesUsed,
    aleatoire: false,
  };
}

/** Empreinte stable pour tests (ordre cx,cy). */
export function persoFingerprint(perso: CalepinagePerso | null): string {
  if (!perso) return '';
  return JSON.stringify({
    cells: perso.cells,
    rotationGlobale: perso.rotationGlobale,
    overrides: perso.overrides,
  });
}
