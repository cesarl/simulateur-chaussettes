/**
 * Lien de partage : sérialisation applicative autour de `shareLink` + `layers`.
 * - Écriture : `#p=2.` (SockDesignV2 compact via `designV2ToShareJson`)
 * - Lecture : `#p=1.` et `#p=2.` (défauts figés via `shareDefaultsFor`)
 */
import type { ZoneColors } from '../core/collections';
import {
  designFromShare,
  designV2ToShareJson,
  migrateDesignV1,
  primaryMotifLayer,
  shareDefaultsFor,
  type SockDesignV2,
  V1_SHARE_DEFAULTS,
} from '../core/layers';
import type { SockDesign, TileAsset } from '../core/types';
import { editingCollection, getState, type AppState } from '../state';
import { encodeShare, decodeShare, SHARE_SOFT_LIMIT, type Json } from './shareLink';

export type ShareDesignJson = Json;

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** JSON compact V2 pour l’encode (diff vs `shareDefaultsFor(2)`). */
export function designToShareJson(state: AppState = getState()): ShareDesignJson {
  return designV2ToShareJson(state.design);
}

/** Défauts d’écriture des liens `#p=2.`. */
export function defaultShareJson(): ShareDesignJson {
  return shareDefaultsFor(2);
}

/** Défauts figés V1 (tests / fusion des anciens liens). */
export function defaultShareJsonV1(): ShareDesignJson {
  return shareDefaultsFor(1);
}

export interface ShareTilesResult {
  tiles: Array<{ name: string; svg: string; id?: string }>;
  omitted: boolean;
}

/** Carreaux manuels SVG candidats au lien (jamais les PNG ; pas si Motif en collection). */
export function shareableManualTiles(state: AppState = getState()): ShareTilesResult {
  const col = editingCollection(state.design, state.selectedLayerId);
  if (col) return { tiles: [], omitted: false };
  const svgTiles = state.tiles
    .filter((t) => t.source === 'svg' && typeof t.svgText === 'string' && t.svgText.length > 0)
    .map((t) => ({ name: t.name, svg: t.svgText!, id: t.id }));
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
  if (result.tooLong && tiles.length) {
    omitted = true;
    tiles = [];
    result = await encodeShare({ design }, defaults);
  }
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

/**
 * Résultat de décodage côté application.
 * - `design` : SockDesign V1 pour les liens `#p=1.` (empreintes layers.test) ; pour `#p=2.`
 *   c’est une vue dérivée minimale (ne pas s’y fier pour la grille).
 * - `designV2` : toujours le modèle calques à appliquer dans l’état.
 */
export interface ParsedShare {
  design: SockDesign;
  designV2: SockDesignV2;
  activeCollectionId: string | null;
  zoneColors: ZoneColors | null;
  paletteOptionId: string | null;
  tiles: Array<{ name: string; svg: string; id?: string }>;
  shareVersion: number;
}

/** Reconstruit un SockDesign V1 depuis le JSON fusionné d’un lien `#p=1.`. */
export function shareJsonToAppV1(raw: ShareDesignJson): {
  design: SockDesign;
  activeCollectionId: string | null;
  zoneColors: ZoneColors | null;
  paletteOptionId: string | null;
} {
  const base = V1_SHARE_DEFAULTS as unknown as Record<string, unknown>;
  const root = asRecord(raw) ?? {};
  const collection = asRecord(root.collection);
  const layout = asRecord(root.layout);
  const baseLayout = asRecord(base.layout) ?? {};
  const baseCalep = asRecord(baseLayout.calepinage) ?? {};
  const baseGenere = asRecord(baseCalep.genere) ?? {};

  const patternRaw = asRecord(root.pattern);
  const pattern =
    patternRaw && patternRaw.kind === 'composition'
      ? (root.pattern as SockDesign['pattern'])
      : { kind: 'carreaux' as const };

  const design: SockDesign = {
    version: 1,
    name: typeof root.name === 'string' ? root.name : String(base.name ?? 'modele'),
    layout: {
      ...(baseLayout as unknown as SockDesign['layout']),
      ...(layout ?? {}),
      calepinage: {
        ...(baseCalep as unknown as SockDesign['layout']['calepinage']),
        ...(asRecord(layout?.calepinage) ?? {}),
        genere: {
          ...(baseGenere as unknown as SockDesign['layout']['calepinage']['genere']),
          ...(asRecord(asRecord(layout?.calepinage)?.genere) ?? {}),
        },
      },
      tileIds: [],
    },
    dimensions: {
      ...(asRecord(base.dimensions) as unknown as SockDesign['dimensions']),
      ...(asRecord(root.dimensions) ?? {}),
    },
    zones: {
      ...(asRecord(base.zones) as unknown as SockDesign['zones']),
      ...(asRecord(root.zones) ?? {}),
    },
    quantize: {
      ...(asRecord(base.quantize) as unknown as SockDesign['quantize']),
      ...(asRecord(root.quantize) ?? {}),
    },
    decor: {
      ...(asRecord(base.decor) as unknown as SockDesign['decor']),
      ...(asRecord(root.decor) ?? {}),
    },
    pattern,
  };

  const id =
    collection && (collection.id === null || typeof collection.id === 'string')
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

/** @deprecated alias — préfère `shareJsonToAppV1`. */
export function shareJsonToApp(raw: ShareDesignJson): {
  design: SockDesign;
  activeCollectionId: string | null;
  zoneColors: ZoneColors | null;
  paletteOptionId: string | null;
} {
  return shareJsonToAppV1(raw);
}

export async function decodeShareHash(
  hash: string,
): Promise<{ ok: true; parsed: ParsedShare } | { ok: false; reason: string }> {
  const decoded = await decodeShare(hash, shareDefaultsFor);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };

  if (decoded.version === 1) {
    const v1 = shareJsonToAppV1(decoded.design);
    const designV2 = migrateDesignV1(v1.design, {
      collectionId: v1.activeCollectionId,
      zoneColors: v1.zoneColors,
      paletteOptionId: v1.paletteOptionId,
      tileIds: [],
    });
    designV2.quantize = { ...designV2.quantize, paletteFromLayers: false };
    return {
      ok: true,
      parsed: {
        design: v1.design,
        designV2,
        activeCollectionId: v1.activeCollectionId,
        zoneColors: v1.zoneColors,
        paletteOptionId: v1.paletteOptionId,
        tiles: decoded.tiles,
        shareVersion: 1,
      },
    };
  }

  const { design: designV2 } = designFromShare(decoded.version, decoded.design);
  const motif = primaryMotifLayer(designV2.layers);
  const activeCollectionId =
    motif?.source.kind === 'collection' ? motif.source.collectionId : null;
  const zoneColors = motif?.source.kind === 'collection' ? motif.source.colors : null;
  const paletteOptionId = motif?.source.kind === 'collection' ? motif.source.paletteId : null;
  // Vue V1 minimale (tests historiques / champs absents).
  const design: SockDesign = {
    version: 1,
    name: designV2.name,
    layout: {
      ...(motif?.layout ?? (V1_SHARE_DEFAULTS as unknown as { layout: SockDesign['layout'] }).layout),
      tileIds: motif?.source.kind === 'importes' ? [...motif.source.tileIds] : [],
    },
    dimensions: designV2.dimensions,
    zones: designV2.zones,
    quantize: designV2.quantize,
    decor: designV2.decor,
    pattern: { kind: 'carreaux' },
  };
  return {
    ok: true,
    parsed: {
      design,
      designV2,
      activeCollectionId,
      zoneColors,
      paletteOptionId,
      tiles: decoded.tiles,
      shareVersion: decoded.version,
    },
  };
}

export function manualTileNames(tiles: TileAsset[]): string[] {
  return tiles.map((t) => t.name);
}

/** Exposé pour tests qui comparent encore le JSON V1. */
export function v1ShareDefaultsJson(): ShareDesignJson {
  return asJson(V1_SHARE_DEFAULTS);
}
