import { normalizeHex } from '../core/color';
import {
  DEFAULT_CALEPINAGE,
  type Appareil,
  type CalepinageSpec,
  type ModeRotation,
  type Ordre,
  type Rot,
} from '../core/calepinage';
import type { ZoneColors } from '../core/collections';
import { isLegacyLayoutKind, migrateLegacyKind } from '../core/presets';
import type { SockDesign, TileAsset, SeamPosition, TileSizeMode, DecorMode, DecorSettings, PatternSource } from '../core/types';
import { EMPTY_COMPOSITION, type Composition, type Layer, type AssetRef, type EmbeddedAsset } from '../core/composition';
import {
  migrateDesignV1,
  normalizeStack,
  type SockDesignV2,
  type StackLayer,
} from '../core/layers';
import { base64ToBytes, bytesToBase64, decodePng, encodePng } from './pngCodec';

/**
 * Projet JSON : réglages + carreaux en PNG base64.
 * v1 : design SockDesign V1 + tiles (+ collection).
 * v2 : v1 + assets embarqués (composition) OU design déjà en calques (T51 transitoire).
 * v3 : design SockDesignV2 (calques) + tiles + assets utilisés seulement.
 * La sauvegarde IndexedDB reprend le même document. Si IndexedDB manque, on ignore.
 */

const DB_NAME = 'cesar-bazaar';
const STORE = 'project';
const KEY = 'last';
/** Seuil d’avertissement à l’enregistrement (octets, JSON UTF-8). */
export const PROJECT_SIZE_WARN_BYTES = 20 * 1024 * 1024;
/** Seuil autosave navigateur : au-delà, on omet les assets embarqués. */
export const AUTOSAVE_OMIT_ASSETS_BYTES = 4 * 1024 * 1024;

const ORDRES: readonly Ordre[] = ['unique', 'suite', 'aleatoire', 'aleatoire-sans-voisin'];
const MODES: readonly ModeRotation[] = [
  'aucune',
  'fixe',
  'suite-90',
  'aleatoire-90',
  'aleatoire-180',
  'rosace',
  'miroir',
];
const APPAREILS: readonly Appareil[] = ['droit', 'quinconce-h', 'quinconce-v'];

export class ProjectError extends Error {
  constructor(message: string) {
    super(`Fichier de projet invalide : ${message}`);
    this.name = 'ProjectError';
  }
}

interface StoredTile {
  id: string;
  name: string;
  source: 'png' | 'svg';
  pngBase64: string;
}

/** Métadonnées collection (V4) : id, couleurs de zones, commit de sync. */
export interface ProjectCollectionMeta {
  id: string;
  zoneColors: ZoneColors;
  paletteOptionId: string | null;
  syncCommit: string | null;
}

interface ProjectDocument {
  version: 1 | 2 | 3;
  design: SockDesign | SockDesignV2;
  tiles: StoredTile[];
  collection?: ProjectCollectionMeta | null;
  assets?: EmbeddedAsset[];
}

export interface ParsedProject {
  design: SockDesignV2;
  tiles: TileAsset[];
  collection: ProjectCollectionMeta | null;
  assets: EmbeddedAsset[];
}

export interface SerializeProjectOptions {
  collection?: ProjectCollectionMeta | null;
  assets?: readonly EmbeddedAsset[];
  /** Si true, omet les assets (autosave léger). */
  omitAssets?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function needString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) throw new ProjectError(`champ « ${key} » manquant.`);
  return value;
}

function needNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ProjectError(`champ « ${key} » manquant.`);
  return value;
}

function optionalNumber(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ProjectError(`champ « ${key} » illisible.`);
  return value;
}

function needBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') throw new ProjectError(`champ « ${key} » manquant.`);
  return value;
}

function needHex(source: Record<string, unknown>, key: string): string {
  const value = needString(source, key);
  try {
    return normalizeHex(value);
  } catch {
    throw new ProjectError(`couleur « ${key} » illisible.`);
  }
}

function needRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  if (!isRecord(value)) throw new ProjectError(`champ « ${key} » manquant.`);
  return value;
}

function asRot(value: number, label: string): Rot {
  if (value !== 0 && value !== 90 && value !== 180 && value !== 270) {
    throw new ProjectError(`${label} inconnue.`);
  }
  return value;
}

function readCalepinage(layout: Record<string, unknown>): CalepinageSpec {
  if (isRecord(layout.calepinage)) {
    const c = layout.calepinage;
    const source = needString(c, 'source');
    if (source !== 'prereglage' && source !== 'genere') throw new ProjectError('source de calepinage inconnue.');
    const genereRaw = needRecord(c, 'genere');
    const ordre = needString(genereRaw, 'ordre');
    const rotation = needString(genereRaw, 'rotation');
    const appareil = needString(c, 'appareil');
    if (!ORDRES.includes(ordre as Ordre)) throw new ProjectError('ordre de calepinage inconnu.');
    if (!MODES.includes(rotation as ModeRotation)) throw new ProjectError('mode de rotation inconnu.');
    if (!APPAREILS.includes(appareil as Appareil)) throw new ProjectError('appareillage inconnu.');
    const rotationFixe = asRot(needNumber(genereRaw, 'rotationFixe'), 'rotation fixe');
    const rotationGlobale = asRot(needNumber(c, 'rotationGlobale'), 'rotation globale');
    const presetId = c.presetId === null || c.presetId === undefined ? null : needString(c, 'presetId');
    return {
      source,
      presetId,
      genere: {
        ordre: ordre as Ordre,
        pasRangee: needNumber(genereRaw, 'pasRangee'),
        rotation: rotation as ModeRotation,
        rotationFixe,
      },
      appareil: appareil as Appareil,
      rotationGlobale,
      graine: needNumber(c, 'graine'),
    };
  }
  // Ancien format V1 : layout.kind
  if (typeof layout.kind === 'string' && isLegacyLayoutKind(layout.kind)) {
    const seed = typeof layout.seed === 'number' ? layout.seed : 1;
    const rotation = typeof layout.rotation === 'number' ? asRot(layout.rotation, 'rotation') : 0;
    return migrateLegacyKind(layout.kind, seed, rotation);
  }
  if (typeof layout.kind === 'string') throw new ProjectError('calepinage inconnu.');
  return { ...DEFAULT_CALEPINAGE };
}

function readDesign(value: unknown): SockDesign {
  if (!isRecord(value)) throw new ProjectError('réglages manquants.');
  if (value.version !== 1) throw new ProjectError('version non prise en charge.');
  const layout = needRecord(value, 'layout');
  const dimensions = needRecord(value, 'dimensions');
  const zones = needRecord(value, 'zones');
  const quantize = needRecord(value, 'quantize');
  const calepinage = readCalepinage(layout);
  const tileIds = layout.tileIds;
  if (!Array.isArray(tileIds) || tileIds.some((id) => typeof id !== 'string')) {
    throw new ProjectError('liste de carreaux illisible.');
  }
  const size = needString(dimensions, 'size');
  if (size !== 'homme' && size !== 'femme') throw new ProjectError('taille inconnue.');
  const paletteMode = needString(quantize, 'paletteMode');
  if (paletteMode !== 'auto' && paletteMode !== 'manuelle') throw new ProjectError('mode de palette inconnu.');
  const sampling = needString(quantize, 'sampling');
  if (sampling !== 'majoritaire' && sampling !== 'moyenne') throw new ProjectError('échantillonnage inconnu.');
  const palette = quantize.palette;
  if (!Array.isArray(palette)) throw new ProjectError('palette illisible.');

  const seamRaw = typeof layout.seam === 'string' ? layout.seam : 'dos';
  const seamOk: SeamPosition[] = ['dos', 'interieur', 'exterieur', 'devant'];
  const seam: SeamPosition = seamOk.includes(seamRaw as SeamPosition) ? (seamRaw as SeamPosition) : 'dos';
  const tileSizeModeRaw = typeof layout.tileSizeMode === 'string' ? layout.tileSizeMode : 'around';
  const tileSizeMode: TileSizeMode = tileSizeModeRaw === 'free' ? 'free' : 'around';
  const tilesAround = optionalNumber(layout, 'tilesAround', 6);

  const decorRaw = isRecord(value.decor) ? value.decor : {};
  const decorModeRaw = typeof decorRaw.mode === 'string' ? decorRaw.mode : 'aucun';
  const decorModes: DecorMode[] = ['aucun', 'sol', 'mur', 'coin'];
  const decorMode: DecorMode = decorModes.includes(decorModeRaw as DecorMode)
    ? (decorModeRaw as DecorMode)
    : 'aucun';
  const tileSourceRaw = typeof decorRaw.tileSource === 'string' ? decorRaw.tileSource : 'sock';
  const decor: DecorSettings = {
    mode: decorMode,
    tileCm: optionalNumber(decorRaw, 'tileCm', 20),
    groutMm: optionalNumber(decorRaw, 'groutMm', 1.5),
    groutColor: typeof decorRaw.groutColor === 'string' ? needHex(decorRaw, 'groutColor') : '#f3f1ec',
    patina: optionalNumber(decorRaw, 'patina', 0.3),
    attenuation: optionalNumber(decorRaw, 'attenuation', 0),
    grainStrength: optionalNumber(decorRaw, 'grainStrength', 0.7),
    tileSource:
      tileSourceRaw === 'collection-origin' || tileSourceRaw === 'other-collection'
        ? tileSourceRaw
        : 'sock',
    otherCollectionId:
      decorRaw.otherCollectionId === null || decorRaw.otherCollectionId === undefined
        ? null
        : String(decorRaw.otherCollectionId),
  };

  return {
    version: 1,
    name: needString(value, 'name'),
    layout: {
      calepinage,
      tileIds: tileIds.filter((id): id is string => typeof id === 'string'),
      tileStitches: needNumber(layout, 'tileStitches'),
      tileRows: needNumber(layout, 'tileRows'),
      gapStitches: needNumber(layout, 'gapStitches'),
      gapRows: needNumber(layout, 'gapRows'),
      gapColor: needHex(layout, 'gapColor'),
      offsetStitches: needNumber(layout, 'offsetStitches'),
      offsetRows: needNumber(layout, 'offsetRows'),
      seam,
      tilesAround,
      tileSizeMode,
    },
    dimensions: {
      size,
      needles: needNumber(dimensions, 'needles'),
      cuffRows: needNumber(dimensions, 'cuffRows'),
      legRows: needNumber(dimensions, 'legRows'),
      heelRows: needNumber(dimensions, 'heelRows'),
      footRows: needNumber(dimensions, 'footRows'),
      toeRows: needNumber(dimensions, 'toeRows'),
      stitchesPerCm: needNumber(dimensions, 'stitchesPerCm'),
      rowsPerCm: needNumber(dimensions, 'rowsPerCm'),
    },
    zones: {
      cuffEnabled: needBoolean(zones, 'cuffEnabled'),
      cuffColor: needHex(zones, 'cuffColor'),
      heelColor: needHex(zones, 'heelColor'),
      toeColor: needHex(zones, 'toeColor'),
      patternOnFoot: needBoolean(zones, 'patternOnFoot'),
      footColor: needHex(zones, 'footColor'),
      // Anciens projets sans réglages d’aperçu du talon → défauts V3.
      heelHeightMm: optionalNumber(zones, 'heelHeightMm', 55),
      heelDepthMm: optionalNumber(zones, 'heelDepthMm', 72),
      heelSpread: optionalNumber(zones, 'heelSpread', 100),
    },
    quantize: {
      maxColors: needNumber(quantize, 'maxColors'),
      paletteMode,
      palette: palette.map((color) => {
        if (typeof color !== 'string') throw new ProjectError('palette illisible.');
        try {
          return normalizeHex(color);
        } catch {
          throw new ProjectError('palette illisible.');
        }
      }),
      sampling,
      despeckle: needBoolean(quantize, 'despeckle'),
      maxFloat: needNumber(quantize, 'maxFloat'),
    },
    decor,
    pattern: readPattern(value.pattern),
  };
}

/** Champ `pattern` absent ou illisible ⇒ mode carreaux (anciens projets / liens). */
function readPattern(value: unknown): PatternSource {
  if (!isRecord(value)) return { kind: 'carreaux' };
  if (value.kind === 'carreaux') return { kind: 'carreaux' };
  if (value.kind !== 'composition') return { kind: 'carreaux' };
  const composition = readComposition(value.composition);
  return { kind: 'composition', composition };
}

function readAssetRef(value: unknown): AssetRef {
  if (!isRecord(value)) throw new ProjectError('référence d’image illisible.');
  if (value.kind === 'collection') {
    return {
      kind: 'collection',
      collectionId: needString(value, 'collectionId'),
      variation: needString(value, 'variation'),
    };
  }
  if (value.kind === 'embarquee') {
    return { kind: 'embarquee', assetId: needString(value, 'assetId') };
  }
  throw new ProjectError('référence d’image inconnue.');
}

function readLayer(value: unknown): Layer {
  if (!isRecord(value)) throw new ProjectError('calque illisible.');
  const gap = value.repeatAroundGap;
  return {
    id: needString(value, 'id'),
    asset: readAssetRef(value.asset),
    x: needNumber(value, 'x'),
    y: needNumber(value, 'y'),
    widthStitches: needNumber(value, 'widthStitches'),
    rotation: needNumber(value, 'rotation'),
    flipX: needBoolean(value, 'flipX'),
    flipY: needBoolean(value, 'flipY'),
    repeatAroundGap: gap === null || gap === undefined ? null : needNumber(value, 'repeatAroundGap'),
    hidden: needBoolean(value, 'hidden'),
    locked: needBoolean(value, 'locked'),
  };
}

function readComposition(value: unknown): Composition {
  if (!isRecord(value)) return { ...EMPTY_COMPOSITION };
  const background =
    typeof value.background === 'string' ? normalizeHex(value.background) : EMPTY_COMPOSITION.background;
  const layersRaw = value.layers;
  const layers = Array.isArray(layersRaw) ? layersRaw.map(readLayer) : [];
  return { background, layers };
}

function readZoneColors(value: unknown): ZoneColors {
  if (!isRecord(value)) throw new ProjectError('couleurs de zones illisibles.');
  const out: ZoneColors = {};
  for (const [key, code] of Object.entries(value)) {
    if (!/^zone-\d+$/.test(key) || typeof code !== 'string' || !code) {
      throw new ProjectError('couleurs de zones illisibles.');
    }
    out[key] = code;
  }
  return out;
}

function readCollectionMeta(value: unknown): ProjectCollectionMeta | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new ProjectError('collection illisible.');
  const id = needString(value, 'id');
  const zoneColors = readZoneColors(value.zoneColors);
  const paletteOptionId =
    value.paletteOptionId === null || value.paletteOptionId === undefined
      ? null
      : needString(value, 'paletteOptionId');
  const syncCommit =
    value.syncCommit === null || value.syncCommit === undefined
      ? null
      : needString(value, 'syncCommit');
  return { id, zoneColors, paletteOptionId, syncCommit };
}

export async function serializeProject(
  design: SockDesignV2,
  tiles: readonly TileAsset[],
  options: SerializeProjectOptions = {},
): Promise<string> {
  // Carreaux référencés par un Motif « importés » (ou tous si aucun Motif importés — démo vide).
  const usedTileIds = new Set<string>();
  let hasImportMotif = false;
  for (const layer of design.layers) {
    if (layer.kind !== 'motif') continue;
    if (layer.source.kind === 'importes') {
      hasImportMotif = true;
      for (const id of layer.source.tileIds) usedTileIds.add(id);
    }
  }
  const tilesToStore = hasImportMotif ? tiles.filter((t) => usedTileIds.has(t.id)) : [...tiles];

  const stored: StoredTile[] = [];
  for (const tile of tilesToStore) {
    const png = await encodePng(tile.rgba, tile.width, tile.height);
    stored.push({
      id: tile.id,
      name: tile.name,
      source: tile.source,
      pngBase64: bytesToBase64(png),
    });
  }
  const allAssets = options.assets ?? [];
  const usedAssetIds = new Set(
    design.layers
      .filter((l): l is Extract<StackLayer, { kind: 'image' }> => l.kind === 'image')
      .map((l) => (l.asset.kind === 'embarquee' ? l.asset.assetId : null))
      .filter((id): id is string => !!id),
  );
  const assets = options.omitAssets ? [] : allAssets.filter((a) => usedAssetIds.has(a.id));
  const document: ProjectDocument = {
    version: 3,
    design,
    tiles: stored,
    collection: options.collection ?? null,
    assets,
  };
  return JSON.stringify(document);
}

export function projectByteLength(json: string): number {
  return new TextEncoder().encode(json).length;
}

function readEmbeddedAsset(value: unknown): EmbeddedAsset {
  if (!isRecord(value)) throw new ProjectError('image embarquée illisible.');
  const mime = needString(value, 'mime');
  if (mime !== 'image/svg+xml' && mime !== 'image/png') {
    throw new ProjectError('type d’image embarquée inconnu.');
  }
  return {
    id: needString(value, 'id'),
    name: needString(value, 'name'),
    mime,
    data: needString(value, 'data'),
    width: needNumber(value, 'width'),
    height: needNumber(value, 'height'),
  };
}

export async function parseProject(text: string): Promise<ParsedProject> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProjectError('JSON illisible.');
  }
  if (!isRecord(parsed)) throw new ProjectError('contenu illisible.');
  const docVersion = parsed.version;
  if (docVersion !== 1 && docVersion !== 2 && docVersion !== 3) {
    throw new ProjectError('version non prise en charge.');
  }
  if (!Array.isArray(parsed.tiles)) throw new ProjectError('carreaux manquants.');
  const tiles: TileAsset[] = [];
  for (const entry of parsed.tiles) {
    if (!isRecord(entry)) throw new ProjectError('carreau illisible.');
    const source = entry.source;
    if (source !== 'png' && source !== 'svg') throw new ProjectError('type de carreau inconnu.');
    const encoded = needString(entry, 'pngBase64');
    let decoded: { width: number; height: number; rgba: Uint8ClampedArray };
    try {
      decoded = await decodePng(base64ToBytes(encoded));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PNG illisible.';
      throw new ProjectError(message);
    }
    tiles.push({
      id: needString(entry, 'id'),
      name: needString(entry, 'name'),
      source,
      width: decoded.width,
      height: decoded.height,
      rgba: decoded.rgba,
    });
  }
  const collection = readCollectionMeta(parsed.collection);
  const assetsRaw = parsed.assets;
  const assets =
    (docVersion === 2 || docVersion === 3) && Array.isArray(assetsRaw)
      ? assetsRaw.map(readEmbeddedAsset)
      : [];

  const rawDesign = parsed.design;
  let designV2: SockDesignV2;
  if (isRecord(rawDesign) && rawDesign.version === 2 && Array.isArray(rawDesign.layers)) {
    const shell = readDesign({
      version: 1,
      name: typeof rawDesign.name === 'string' ? rawDesign.name : 'modele',
      layout: {
        calepinage: {
          source: 'genere',
          presetId: null,
          genere: { ordre: 'unique', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 },
          appareil: 'droit',
          rotationGlobale: 0,
          graine: 1,
        },
        tileIds: [],
        tileStitches: 28,
        tileRows: 37,
        gapStitches: 0,
        gapRows: 0,
        gapColor: '#d9d3c7',
        offsetStitches: 0,
        offsetRows: 0,
        seam: 'dos',
        tilesAround: 6,
        tileSizeMode: 'around',
      },
      dimensions: rawDesign.dimensions,
      zones: rawDesign.zones,
      quantize: rawDesign.quantize,
      decor: rawDesign.decor,
      pattern: { kind: 'carreaux' },
    });
    designV2 = {
      version: 2,
      name: shell.name,
      dimensions: shell.dimensions,
      zones: shell.zones,
      quantize: {
        ...shell.quantize,
        paletteFromLayers:
          isRecord(rawDesign.quantize) && rawDesign.quantize.paletteFromLayers === true,
      },
      decor: shell.decor,
      layers: normalizeStack(rawDesign.layers as StackLayer[]),
    };
  } else {
    const design = readDesign(parsed.design);
    const known = new Set(tiles.map((tile) => tile.id));
    if (design.layout.tileIds.some((id) => !known.has(id))) {
      throw new ProjectError('un carreau référencé est absent.');
    }
    designV2 = migrateDesignV1(design, {
      collectionId: collection?.id ?? null,
      zoneColors: collection?.zoneColors ?? null,
      paletteOptionId: collection?.paletteOptionId ?? null,
      tileIds: design.layout.tileIds,
    });
    designV2.quantize = { ...designV2.quantize, paletteFromLayers: false };
  }
  return { design: designV2, tiles, collection, assets };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible.'));
  });
}

export async function saveLastProject(json: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(json, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Écriture impossible.'));
    });
  } finally {
    db.close();
  }
}

export async function loadLastProject(): Promise<ParsedProject | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  try {
    const json = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Lecture impossible.'));
    });
    if (typeof json !== 'string') return null;
    return await parseProject(json);
  } finally {
    db.close();
  }
}
