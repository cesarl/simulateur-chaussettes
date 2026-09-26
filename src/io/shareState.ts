/**
 * Sérialisation du projet pour le lien de partage (`#p=1.…`).
 * Format JSON compact (diff vs défaut) — sans images lourdes ni mode dev.
 */
import type { ZoneColors } from '../core/collections';
import { normalizePatternSource } from '../core/patternSource';
import type { SockDesign, TileAsset } from '../core/types';
import { defaultDesign, getState, type AppState } from '../state';
import { encodeShare, decodeShare, SHARE_SOFT_LIMIT, type Json } from './shareLink';

export type ShareDesignJson = Json;

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

/** État partageable : design + collection + décor (déjà dans SockDesign). */
export function designToShareJson(state: AppState = getState()): ShareDesignJson {
  const { design, activeCollectionId, zoneColors, paletteOptionId } = state;
  const { tileIds: _ids, ...layoutRest } = design.layout;
  return asJson({
    version: design.version,
    name: design.name,
    collection: {
      id: activeCollectionId,
      colors: zoneColors ?? {},
      paletteId: paletteOptionId ?? 'defaut',
    },
    layout: layoutRest,
    dimensions: design.dimensions,
    zones: design.zones,
    quantize: design.quantize,
    decor: design.decor,
    pattern: normalizePatternSource(design.pattern),
  });
}

export function defaultShareJson(): ShareDesignJson {
  const design = defaultDesign();
  const { tileIds: _ids, ...layoutRest } = design.layout;
  return asJson({
    version: design.version,
    name: design.name,
    collection: { id: null, colors: {}, paletteId: 'defaut' },
    layout: layoutRest,
    dimensions: design.dimensions,
    zones: design.zones,
    quantize: design.quantize,
    decor: design.decor,
    pattern: normalizePatternSource(design.pattern),
  });
}

export interface ShareTilesResult {
  tiles: Array<{ name: string; svg: string }>;
  omitted: boolean;
}

/** Carreaux manuels SVG candidats au lien (jamais les PNG, jamais si collection active). */
export function shareableManualTiles(state: AppState = getState()): ShareTilesResult {
  if (state.activeCollectionId) return { tiles: [], omitted: false };
  const svgTiles = state.tiles
    .filter((t) => t.source === 'svg' && typeof t.svgText === 'string' && t.svgText.length > 0)
    .map((t) => ({ name: t.name, svg: t.svgText! }));
  const hadManual = state.tiles.length > 0;
  const hadPng = state.tiles.some((t) => t.source === 'png');
  const omittedSvg = state.tiles.some((t) => t.source === 'svg' && !t.svgText);
  return {
    tiles: svgTiles,
    omitted: hadManual && (hadPng || omittedSvg || svgTiles.length < state.tiles.filter((t) => t.source === 'svg').length),
  };
}

export interface BuildShareResult {
  url: string;
  hash: string;
  length: number;
  tooLong: boolean;
  tilesOmitted: boolean;
}

export async function buildShareUrl(state: AppState = getState()): Promise<BuildShareResult> {
  const defaults = defaultShareJson();
  const design = designToShareJson(state);
  let { tiles, omitted } = shareableManualTiles(state);
  let result = await encodeShare({ design, tiles: tiles.length ? tiles : undefined }, defaults);
  // Si trop long avec SVG : retirer les carreaux et signaler.
  if (result.tooLong && tiles.length) {
    omitted = true;
    tiles = [];
    result = await encodeShare({ design }, defaults);
  }
  // Essai sans SVG si encore trop long n'aide pas (c'est le design) — on laisse tooLong.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  return {
    url: `${origin}${path}${result.hash}`,
    hash: result.hash,
    length: result.length,
    tooLong: result.tooLong || result.length > SHARE_SOFT_LIMIT,
    tilesOmitted: omitted,
  };
}

export interface ParsedShare {
  design: SockDesign;
  activeCollectionId: string | null;
  zoneColors: ZoneColors | null;
  paletteOptionId: string | null;
  tiles: Array<{ name: string; svg: string }>;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Fusionne un JSON décodé sur `defaultDesign()` (champs absents = défaut). */
export function shareJsonToApp(raw: ShareDesignJson): Omit<ParsedShare, 'tiles'> {
  const base = defaultDesign();
  const root = asRecord(raw) ?? {};
  const collection = asRecord(root.collection);
  const layout = asRecord(root.layout);
  const dimensions = asRecord(root.dimensions);
  const zones = asRecord(root.zones);
  const quantize = asRecord(root.quantize);
  const decor = asRecord(root.decor);

  const design: SockDesign = {
    ...base,
    version: 1,
    name: typeof root.name === 'string' ? root.name : base.name,
    layout: {
      ...base.layout,
      ...(layout ?? {}),
      calepinage: {
        ...base.layout.calepinage,
        ...(asRecord(layout?.calepinage) ?? {}),
        genere: {
          ...base.layout.calepinage.genere,
          ...(asRecord(asRecord(layout?.calepinage)?.genere) ?? {}),
        },
      },
      tileIds: [],
    } as SockDesign['layout'],
    dimensions: { ...base.dimensions, ...(dimensions ?? {}) } as SockDesign['dimensions'],
    zones: { ...base.zones, ...(zones ?? {}) } as SockDesign['zones'],
    quantize: { ...base.quantize, ...(quantize ?? {}) } as SockDesign['quantize'],
    decor: { ...base.decor, ...(decor ?? {}) } as SockDesign['decor'],
    pattern: normalizePatternSource(
      root.pattern && typeof root.pattern === 'object' && !Array.isArray(root.pattern)
        ? (root.pattern as SockDesign['pattern'])
        : undefined,
    ),
  };

  const id = collection && (collection.id === null || typeof collection.id === 'string')
    ? (collection.id as string | null)
    : null;
  const colorsRaw = collection ? asRecord(collection.colors) : null;
  const zoneColors: ZoneColors | null = colorsRaw
    ? Object.fromEntries(
        Object.entries(colorsRaw).filter(([, v]) => typeof v === 'string') as Array<[string, string]>,
      )
    : null;
  const paletteOptionId =
    collection && typeof collection.paletteId === 'string' ? collection.paletteId : null;

  return {
    design,
    activeCollectionId: id,
    zoneColors: id && zoneColors && Object.keys(zoneColors).length ? zoneColors : id ? zoneColors : null,
    paletteOptionId,
  };
}

export async function decodeShareHash(
  hash: string,
): Promise<{ ok: true; parsed: ParsedShare } | { ok: false; reason: string }> {
  const decoded = await decodeShare(hash, defaultShareJson());
  if (!decoded.ok) return { ok: false, reason: decoded.reason };
  const partial = shareJsonToApp(decoded.design);
  return {
    ok: true,
    parsed: {
      ...partial,
      tiles: decoded.tiles,
    },
  };
}

/** Exposé pour tests : empreinte légère des carreaux manuels. */
export function manualTileNames(tiles: TileAsset[]): string[] {
  return tiles.map((t) => t.name);
}
