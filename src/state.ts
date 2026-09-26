/**
 * État de l'application (V7) : SockDesignV2 en calques.
 * Les anciens champs layout / pattern / collection active vivent dans chaque calque Motif.
 */
import type { EmbeddedAsset } from './core/composition';
import type { Preset } from './core/calepinage';
import type { CalepinageSpec } from './core/calepinage';
import { tileRowsFor, tileWidthForCount } from './core/calepinage';
import type { Catalogue, ZoneColors } from './core/collections';
import {
  addStackLayer,
  duplicateStackLayer,
  moveStackLayer,
  newFondLayer,
  newImageLayer,
  newMotifLayer,
  nextLayerId,
  normalizeStack,
  primaryMotifLayer,
  removeStackLayer,
  type FondLayer,
  type ImageLayer,
  type MotifBounds,
  type MotifLayout,
  type MotifLayer,
  type MotifSource,
  type SockDesignV2,
  type StackLayer,
  updateStackLayer,
} from './core/layers';
import { BUILTIN_PRESETS, BUILTIN_PRESET_WARNINGS, migrateLegacyKind } from './core/presets';
import { collectionTiles } from './core/stackCompute';
import { defaultDimensions, MACHINE_LIMITS } from './core/sizes';
import type {
  DecorSettings,
  Hex,
  KnitFidelity,
  LayoutSettings,
  QuantizeSettings,
  SockDesign,
  SockDimensions,
  TileAsset,
  ZoneSettings,
} from './core/types';
import type { AssetRef } from './core/composition';
import { V1_SHARE_DEFAULTS } from './core/layers';

export type FootSide = 'droite' | 'gauche';
export type { SockDesignV2 };

/** Nombre maximal de calques (Fond compris) : au-delà, le dock ne tient plus sur une ligne. */
export const MAX_LAYERS = 16;

/** Message affiché quand l’ajout est refusé. */
export const MAX_LAYERS_MESSAGE = '16 calques au maximum';

/** Sections projet réinitialisables (hors calques). */
export type DesignSection = 'dimensions' | 'quantize' | 'zones' | 'decor';

/** Calcule largeur/hauteur de carreau depuis « N sur le tour » (proportions gardées). */
export function layoutFromTilesAround(
  needles: number,
  tilesAround: number,
  gapStitches: number,
  stitchesPerCm: number,
  rowsPerCm: number,
  keepRatio: boolean,
  currentRows: number,
): Pick<LayoutSettings, 'tileStitches' | 'tileRows' | 'tilesAround' | 'tileSizeMode'> {
  const n = Math.min(12, Math.max(2, Math.round(tilesAround)));
  const tileStitches = tileWidthForCount(needles, n, gapStitches);
  const tileRows = keepRatio
    ? Math.max(1, Math.round(tileRowsFor(tileStitches, stitchesPerCm, rowsPerCm)))
    : Math.max(1, currentRows);
  return { tileStitches, tileRows, tilesAround: n, tileSizeMode: 'around' };
}

function defaultCalepinage(): CalepinageSpec {
  return migrateLegacyKind('grille', 1, 0);
}

export function defaultDecor(): DecorSettings {
  return {
    mode: 'aucun',
    tileCm: 20,
    groutMm: 1.5,
    groutColor: '#f3f1ec',
    patina: 0.3,
    attenuation: 0,
    grainStrength: 0.7,
    tileSource: 'sock',
    otherCollectionId: null,
  };
}

/** Layout Motif par défaut (= écran de départ V6). */
export function defaultMotifLayout(): MotifLayout {
  const dimensions = defaultDimensions('homme');
  const sized = layoutFromTilesAround(
    dimensions.needles,
    6,
    0,
    dimensions.stitchesPerCm,
    dimensions.rowsPerCm,
    true,
    1,
  );
  return {
    calepinage: defaultCalepinage(),
    tileStitches: sized.tileStitches,
    tileRows: sized.tileRows,
    gapStitches: 0,
    gapRows: 0,
    gapColor: '#d9d3c7',
    offsetStitches: 0,
    offsetRows: 0,
    seam: 'dos',
    tilesAround: sized.tilesAround,
    tileSizeMode: 'around',
  };
}

/** Modèle de départ : Fond + 1 Motif (importés, calepinage V6), palette d’après les calques. */
export function defaultDesign(): SockDesignV2 {
  const dimensions = defaultDimensions('homme');
  const motif = newMotifLayer('motif-1', { kind: 'importes', tileIds: [] }, defaultMotifLayout(), 'Motif 1');
  return {
    version: 2,
    name: 'modele',
    dimensions,
    zones: {
      cuffEnabled: true,
      cuffColor: '#1f3a5f',
      heelColor: '#b5462f',
      toeColor: '#1d1d1b',
      patternOnFoot: true,
      footColor: '#f4f1ea',
      heelHeightMm: 55,
      heelDepthMm: 72,
      heelSpread: 100,
    },
    quantize: {
      maxColors: 4,
      paletteMode: 'auto',
      palette: [],
      sampling: 'majoritaire',
      despeckle: false,
      maxFloat: MACHINE_LIMITS.maxFloat,
      paletteFromLayers: true,
    },
    decor: defaultDecor(),
    layers: normalizeStack([newFondLayer(), motif]),
  };
}

/**
 * Design V1 figé (= `v1ShareDefaults.json`) pour construire des fixtures de migration / empreintes.
 * Ne pas utiliser comme état runtime.
 */
export function defaultDesignV1(): SockDesign {
  const v = V1_SHARE_DEFAULTS as unknown as {
    name: string;
    layout: Omit<LayoutSettings, 'tileIds'>;
    dimensions: SockDimensions;
    zones: ZoneSettings;
    quantize: QuantizeSettings;
    decor: DecorSettings;
  };
  return {
    version: 1,
    name: v.name,
    layout: { ...structuredClone(v.layout), tileIds: [] },
    dimensions: structuredClone(v.dimensions),
    zones: structuredClone(v.zones),
    quantize: structuredClone(v.quantize),
    decor: structuredClone(v.decor),
    pattern: { kind: 'carreaux' },
  };
}

/** Patch d’un calque Motif (layout partiel + source). */
export type MotifLayoutPatch = Partial<Omit<MotifLayout, 'calepinage'>> & {
  calepinage?: Partial<CalepinageSpec> & { genere?: Partial<CalepinageSpec['genere']> };
  /** @deprecated V1 — migré vers calepinage */
  kind?: string;
  rotation?: 0 | 90 | 180 | 270;
  seed?: number;
  tileIds?: string[];
};

export interface DesignPatch {
  name?: string;
  dimensions?: Partial<SockDimensions>;
  zones?: Partial<ZoneSettings>;
  quantize?: Partial<QuantizeSettings>;
  decor?: Partial<DecorSettings>;
  layers?: StackLayer[];
  /**
   * Compat V6 : appliqué au calque Motif en cours d’édition (sélectionné ou primaire).
   * @deprecated préférer `updateLayer` / `patchMotifLayout`.
   */
  layout?: MotifLayoutPatch;
}

export interface AppState {
  design: SockDesignV2;
  tiles: TileAsset[];
  error: string | null;
  knitFidelity: KnitFidelity;
  footSide: FootSide;
  calepPresets: Preset[];
  calepWarnings: string[];
  catalogue: Catalogue | null;
  catalogueMissing: boolean;
  /** Calque sélectionné (null = aucun). Le Fond peut être sélectionné. */
  selectedLayerId: string | null;
  /** Images embarquées du projet (référencées par les calques Image). */
  embeddedAssets: EmbeddedAsset[];
}

export interface StatePatch {
  design?: DesignPatch;
  tiles?: TileAsset[];
  error?: string | null;
  knitFidelity?: KnitFidelity;
  footSide?: FootSide;
  calepPresets?: Preset[];
  calepWarnings?: string[];
  catalogue?: Catalogue | null;
  catalogueMissing?: boolean;
  selectedLayerId?: string | null;
  embeddedAssets?: EmbeddedAsset[];
}

export interface UpdateOptions {
  coalesce?: boolean;
  skipHistory?: boolean;
}

type Listener = (state: AppState) => void;

const HISTORY_MAX = 100;

interface HistoryEntry {
  design: SockDesignV2;
  tiles: TileAsset[];
  knitFidelity: KnitFidelity;
  footSide: FootSide;
  selectedLayerId: string | null;
  embeddedAssets: EmbeddedAsset[];
  coalesce: boolean;
}

function createInitial(): AppState {
  const design = defaultDesign();
  return {
    design,
    tiles: [],
    error: null,
    knitFidelity: 'fidele',
    footSide: 'droite',
    calepPresets: [...BUILTIN_PRESETS],
    calepWarnings: [...BUILTIN_PRESET_WARNINGS],
    catalogue: null,
    catalogueMissing: false,
    selectedLayerId: design.layers.find((l) => l.kind === 'motif')?.id ?? 'fond',
    embeddedAssets: [],
  };
}

function cloneDesign(design: SockDesignV2): SockDesignV2 {
  return structuredClone(design);
}

function snapshot(coalesce: boolean): HistoryEntry {
  return {
    design: cloneDesign(state.design),
    tiles: state.tiles,
    knitFidelity: state.knitFidelity,
    footSide: state.footSide,
    selectedLayerId: state.selectedLayerId,
    embeddedAssets: state.embeddedAssets,
    coalesce,
  };
}

function restore(entry: HistoryEntry): void {
  state = {
    ...state,
    design: cloneDesign(entry.design),
    tiles: entry.tiles,
    knitFidelity: entry.knitFidelity,
    footSide: entry.footSide,
    selectedLayerId: entry.selectedLayerId,
    embeddedAssets: entry.embeddedAssets,
  };
}

let state: AppState = createInitial();
const listeners = new Set<Listener>();
let past: HistoryEntry[] = [];
let future: HistoryEntry[] = [];
let coalesceActive = false;
let coalesceTimer: ReturnType<typeof setTimeout> | undefined;

function pushHistory(coalesce: boolean): void {
  if (coalesce) {
    if (!coalesceActive) {
      past.push(snapshot(false));
      coalesceActive = true;
      future = [];
    }
    if (coalesceTimer !== undefined) clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(() => {
      coalesceActive = false;
      coalesceTimer = undefined;
    }, 400);
  } else {
    if (coalesceTimer !== undefined) {
      clearTimeout(coalesceTimer);
      coalesceTimer = undefined;
    }
    coalesceActive = false;
    past.push(snapshot(false));
    future = [];
  }
  if (past.length > HISTORY_MAX) past.shift();
}

export function getState(): AppState {
  return state;
}

export function resetState(): void {
  state = createInitial();
  past = [];
  future = [];
  coalesceActive = false;
  if (coalesceTimer !== undefined) clearTimeout(coalesceTimer);
  coalesceTimer = undefined;
  listeners.clear();
}

export function canUndo(): boolean {
  return past.length > 0;
}

export function canRedo(): boolean {
  return future.length > 0;
}

function notify(): void {
  for (const listener of listeners) listener(state);
}

// --------------------------------------------------------------------------- accès calques
/** Calque Motif utilisé pour l’édition (sélectionné s’il est Motif, sinon primaire). */
export function editingMotif(design: SockDesignV2 = state.design, selectedId: string | null = state.selectedLayerId): MotifLayer | null {
  if (selectedId) {
    const sel = design.layers.find((l) => l.id === selectedId);
    if (sel?.kind === 'motif') return sel;
  }
  return primaryMotifLayer(design.layers);
}

/** LayoutSettings (avec tileIds) du Motif en cours — pour contrôles / décor / checks. */
export function editingLayoutSettings(
  design: SockDesignV2 = state.design,
  tiles: readonly TileAsset[] = state.tiles,
  selectedId: string | null = state.selectedLayerId,
): LayoutSettings {
  const motif = editingMotif(design, selectedId);
  const layout = motif?.layout ?? defaultMotifLayout();
  let tileIds: string[] = [];
  if (motif?.source.kind === 'importes') {
    tileIds = motif.source.tileIds.length ? [...motif.source.tileIds] : tiles.map((t) => t.id);
  } else if (motif?.source.kind === 'collection') {
    // Miroir V6 : les carreaux chargés de la collection apparaissent dans layout.tileIds.
    tileIds = collectionTiles(motif.source.collectionId, tiles).map((t) => t.id);
  }
  return { ...layout, tileIds };
}

/** Collection dérivée du Motif en cours (null = importés / pas de Motif). */
export function editingCollection(
  design: SockDesignV2 = state.design,
  selectedId: string | null = state.selectedLayerId,
): { id: string; colors: ZoneColors; paletteId: string | null } | null {
  const motif = editingMotif(design, selectedId);
  if (!motif || motif.source.kind !== 'collection') return null;
  return { id: motif.source.collectionId, colors: motif.source.colors, paletteId: motif.source.paletteId };
}

function mergeCalepinage(
  current: CalepinageSpec,
  patch: MotifLayoutPatch['calepinage'],
): CalepinageSpec {
  if (!patch) return current;
  return {
    ...current,
    ...patch,
    genere: patch.genere ? { ...current.genere, ...patch.genere } : current.genere,
  };
}

function applyMotifLayout(layout: MotifLayout, patch: MotifLayoutPatch): MotifLayout {
  let calepinage = layout.calepinage;
  if (patch.kind && !patch.calepinage) {
    const seed = patch.seed ?? calepinage.graine;
    const rotation = patch.rotation ?? calepinage.rotationGlobale;
    calepinage = migrateLegacyKind(patch.kind, seed, rotation);
  } else if (patch.calepinage) {
    calepinage = mergeCalepinage(calepinage, patch.calepinage);
  } else {
    if (patch.seed !== undefined) calepinage = { ...calepinage, graine: patch.seed };
    if (patch.rotation !== undefined) calepinage = { ...calepinage, rotationGlobale: patch.rotation };
  }
  return {
    calepinage,
    tileStitches: patch.tileStitches ?? layout.tileStitches,
    tileRows: patch.tileRows ?? layout.tileRows,
    gapStitches: patch.gapStitches ?? layout.gapStitches,
    gapRows: patch.gapRows ?? layout.gapRows,
    gapColor: patch.gapColor ?? layout.gapColor,
    offsetStitches: patch.offsetStitches ?? layout.offsetStitches,
    offsetRows: patch.offsetRows ?? layout.offsetRows,
    seam: patch.seam ?? layout.seam,
    tilesAround: patch.tilesAround ?? layout.tilesAround,
    tileSizeMode: patch.tileSizeMode ?? layout.tileSizeMode,
  };
}

function applyLayoutToDesign(design: SockDesignV2, patch: MotifLayoutPatch, selectedId: string | null): SockDesignV2 {
  const motif = editingMotif(design, selectedId);
  if (!motif) return design;
  const nextLayout = applyMotifLayout(motif.layout, patch);
  let source = motif.source;
  if (patch.tileIds && source.kind === 'importes') {
    source = { kind: 'importes', tileIds: [...patch.tileIds] };
  }
  return {
    ...design,
    layers: updateStackLayer<MotifLayer>(design.layers, motif.id, { layout: nextLayout, source }),
  };
}

function applyDesign(design: SockDesignV2, patch: DesignPatch, selectedId: string | null): SockDesignV2 {
  let next: SockDesignV2 = {
    ...design,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    dimensions: patch.dimensions ? { ...design.dimensions, ...patch.dimensions } : design.dimensions,
    zones: patch.zones ? { ...design.zones, ...patch.zones } : design.zones,
    quantize: patch.quantize ? { ...design.quantize, ...patch.quantize } : design.quantize,
    decor: patch.decor ? { ...design.decor, ...patch.decor } : design.decor,
    layers: patch.layers ? normalizeStack(patch.layers) : design.layers,
  };
  if (patch.layout) next = applyLayoutToDesign(next, patch.layout, selectedId);
  return next;
}

export function update(patch: StatePatch, options: UpdateOptions = {}): void {
  const records =
    !options.skipHistory &&
    (patch.design !== undefined ||
      patch.tiles !== undefined ||
      patch.knitFidelity !== undefined ||
      patch.footSide !== undefined ||
      patch.selectedLayerId !== undefined ||
      patch.embeddedAssets !== undefined);
  if (records) pushHistory(options.coalesce === true);

  const selectedId = patch.selectedLayerId !== undefined ? patch.selectedLayerId : state.selectedLayerId;
  let design = patch.design ? applyDesign(state.design, patch.design, selectedId) : state.design;
  let tiles = patch.tiles ?? state.tiles;

  // Si on remplace les carreaux importés, synchroniser le Motif « importés » en cours.
  if (patch.tiles) {
    const motif = editingMotif(design, selectedId);
    if (motif?.source.kind === 'importes') {
      design = {
        ...design,
        layers: updateStackLayer<MotifLayer>(design.layers, motif.id, {
          source: { kind: 'importes', tileIds: patch.tiles.map((t) => t.id) },
        }),
      };
    }
  }

  // Vérifier que selectedLayerId existe encore.
  let sel = selectedId;
  if (sel && !design.layers.some((l) => l.id === sel)) {
    sel = design.layers.find((l) => l.kind === 'motif')?.id ?? design.layers[0]?.id ?? null;
  }

  state = {
    design,
    tiles,
    error: patch.error === undefined ? state.error : patch.error,
    knitFidelity: patch.knitFidelity ?? state.knitFidelity,
    footSide: patch.footSide ?? state.footSide,
    calepPresets: patch.calepPresets ?? state.calepPresets,
    calepWarnings: patch.calepWarnings ?? state.calepWarnings,
    catalogue: patch.catalogue === undefined ? state.catalogue : patch.catalogue,
    catalogueMissing:
      patch.catalogueMissing === undefined ? state.catalogueMissing : patch.catalogueMissing,
    selectedLayerId: sel,
    embeddedAssets: patch.embeddedAssets ?? state.embeddedAssets,
  };
  notify();
}

export function undo(): boolean {
  if (past.length === 0) return false;
  coalesceActive = false;
  const previous = past.pop()!;
  future.push(snapshot(false));
  restore(previous);
  notify();
  return true;
}

export function redo(): boolean {
  if (future.length === 0) return false;
  coalesceActive = false;
  const next = future.pop()!;
  past.push(snapshot(false));
  restore(next);
  notify();
  return true;
}

// --------------------------------------------------------------------------- actions calques
/** Sélection : pas d’étape d’annulation (annuler doit défaire une modification, pas un clic). */
export function selectLayer(id: string | null): void {
  update({ selectedLayerId: id }, { skipHistory: true });
}

/** Vrai s’il reste de la place pour un calque de plus. */
export function canAddLayer(design: SockDesignV2 = state.design): boolean {
  return design.layers.length < MAX_LAYERS;
}

function refuseAdd(): null {
  update({ error: MAX_LAYERS_MESSAGE }, { skipHistory: true });
  return null;
}

/**
 * Ajoute un calque Motif au-dessus de la pile et le sélectionne.
 * `tiles` remplace les carreaux du projet dans la même modification (une seule étape d’annulation).
 * Renvoie null si la pile est pleine (message d’erreur posé dans l’état).
 */
export function addMotifLayer(
  source: MotifSource,
  layout: MotifLayout = defaultMotifLayout(),
  name?: string,
  tiles?: TileAsset[],
): string | null {
  if (!canAddLayer()) return refuseAdd();
  const id = nextLayerId(state.design.layers, 'motif');
  const layer = newMotifLayer(id, source, layout, name ?? (source.kind === 'collection' ? source.collectionId : 'Motif'));
  const layers = addStackLayer(state.design.layers, layer);
  update({
    design: { layers },
    selectedLayerId: id,
    ...(tiles ? { tiles } : {}),
    error: null,
  });
  return id;
}

/** Ajoute un calque Image (et, si besoin, l’image embarquée du projet). */
export function addImageLayer(asset: AssetRef, name = 'Image', assets?: EmbeddedAsset[]): string | null {
  if (!canAddLayer()) return refuseAdd();
  const g = {
    needles: state.design.dimensions.needles,
    rows: Math.max(1, state.design.dimensions.legRows + (state.design.zones.patternOnFoot ? state.design.dimensions.footRows : 0)),
    stitchesPerCm: state.design.dimensions.stitchesPerCm,
    rowsPerCm: state.design.dimensions.rowsPerCm,
  };
  const id = nextLayerId(state.design.layers, 'image');
  const layer = newImageLayer(id, asset, g, name);
  const layers = addStackLayer(state.design.layers, layer);
  update({
    design: { layers },
    selectedLayerId: id,
    ...(assets ? { embeddedAssets: assets } : {}),
    error: null,
  });
  return id;
}

export function removeLayer(id: string): void {
  const layers = removeStackLayer(state.design.layers, id);
  const sel = state.selectedLayerId === id ? (layers.find((l) => l.kind === 'motif')?.id ?? 'fond') : state.selectedLayerId;
  update({ design: { layers }, selectedLayerId: sel });
}

export function duplicateLayer(id: string): void {
  if (!canAddLayer()) {
    refuseAdd();
    return;
  }
  const layers = duplicateStackLayer(state.design.layers, id);
  const copy = layers.find((l, i) => l.id !== id && layers[i - 1]?.id === id) ?? layers.find((l) => l.name.endsWith('(copie)'));
  update({ design: { layers }, selectedLayerId: copy?.id ?? state.selectedLayerId });
}

export function moveLayer(id: string, dir: 'monter' | 'descendre' | 'dessus' | 'dessous' | number): void {
  update({ design: { layers: moveStackLayer(state.design.layers, id, dir) } });
}

export function setLayerHidden(id: string, hidden: boolean): void {
  const layer = state.design.layers.find((l) => l.id === id);
  if (!layer || layer.kind === 'fond') return;
  update({ design: { layers: updateStackLayer(state.design.layers, id, { hidden }) } });
}

export function setLayerLocked(id: string, locked: boolean): void {
  update({ design: { layers: updateStackLayer(state.design.layers, id, { locked }) } });
}

export function renameLayer(id: string, name: string): void {
  update({ design: { layers: updateStackLayer(state.design.layers, id, { name }) } });
}

export function patchLayer(id: string, patch: Partial<StackLayer>): void {
  update({ design: { layers: updateStackLayer(state.design.layers, id, patch) } }, { coalesce: false });
}

export function patchLayerCoalesced(id: string, patch: Partial<StackLayer>): void {
  update({ design: { layers: updateStackLayer(state.design.layers, id, patch) } }, { coalesce: true });
}

/** Couleur du calque Fond. */
export function setFondColor(color: Hex, coalesce = false): void {
  update(
    { design: { layers: updateStackLayer<FondLayer>(state.design.layers, 'fond', { color }) } },
    { coalesce },
  );
}

/** Étendue d’un calque Motif : toute la surface ou une bande de rangs. */
export function setMotifBounds(id: string, bounds: MotifBounds, coalesce = false): void {
  const layer = state.design.layers.find((l) => l.id === id);
  if (layer?.kind !== 'motif') return;
  update(
    { design: { layers: updateStackLayer<MotifLayer>(state.design.layers, id, { bounds }) } },
    { coalesce },
  );
}

/** Rend une couleur du calque transparente, ou la rétablit. */
export function toggleLayerTransparentColor(id: string, color: Hex): void {
  const layer = state.design.layers.find((l) => l.id === id);
  if (!layer || layer.kind === 'fond') return;
  const hex = color.toLowerCase() as Hex;
  const current = layer.transparentColors.map((c) => c.toLowerCase() as Hex);
  const transparentColors = current.includes(hex)
    ? current.filter((c) => c !== hex)
    : [...current, hex];
  update({ design: { layers: updateStackLayer(state.design.layers, id, { transparentColors }) } });
}

/** Réglages d’un calque Image (position, taille, rotation, miroirs, frise). */
export function patchImageLayer(id: string, patch: Partial<ImageLayer>, coalesce = false): void {
  const layer = state.design.layers.find((l) => l.id === id);
  if (layer?.kind !== 'image') return;
  update(
    { design: { layers: updateStackLayer<ImageLayer>(state.design.layers, id, patch) } },
    { coalesce },
  );
}

/** Remplace l’image d’un calque Image par une image embarquée (une seule étape d’annulation). */
export function replaceImageAsset(id: string, asset: EmbeddedAsset): void {
  const layer = state.design.layers.find((l) => l.id === id);
  if (layer?.kind !== 'image') return;
  const assets = state.embeddedAssets.some((a) => a.id === asset.id)
    ? state.embeddedAssets
    : [...state.embeddedAssets, asset];
  update({
    design: {
      layers: updateStackLayer<ImageLayer>(state.design.layers, id, {
        asset: { kind: 'embarquee', assetId: asset.id },
      }),
    },
    embeddedAssets: assets,
    error: null,
  });
}

/** Remplace la source collection d’un Motif (ou du Motif en cours). */
export function setMotifCollection(
  collectionId: string,
  colors: ZoneColors,
  paletteId: string | null,
  layerId?: string,
): void {
  const id = layerId ?? editingMotif()?.id;
  if (!id) return;
  const layer = state.design.layers.find((l) => l.id === id);
  if (!layer || layer.kind !== 'motif') return;
  update({
    design: {
      layers: updateStackLayer<MotifLayer>(state.design.layers, id, {
        source: { kind: 'collection', collectionId, colors: { ...colors }, paletteId },
        name: layer.name.startsWith('Motif') ? collectionId.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : layer.name,
      }),
    },
    selectedLayerId: id,
  });
}

/** Passe le Motif en cours en carreaux importés. */
export function setMotifImportes(tileIds?: string[], layerId?: string): void {
  const id = layerId ?? editingMotif()?.id;
  if (!id) return;
  const ids = tileIds ?? state.tiles.map((t) => t.id);
  update({
    design: {
      layers: updateStackLayer<MotifLayer>(state.design.layers, id, {
        source: { kind: 'importes', tileIds: [...ids] },
      }),
    },
  });
}

export function sectionFingerprint(section: DesignSection, design: SockDesignV2): string {
  return JSON.stringify(design[section]);
}

export function isSectionDirty(section: DesignSection, design: SockDesignV2 = state.design): boolean {
  return sectionFingerprint(section, design) !== sectionFingerprint(section, defaultDesign());
}

export function isMotifLayoutDirty(design: SockDesignV2 = state.design): boolean {
  const motif = editingMotif(design);
  if (!motif) return false;
  return JSON.stringify(motif.layout) !== JSON.stringify(defaultMotifLayout());
}

export function resetSection(section: DesignSection): void {
  const defaults = defaultDesign();
  update({ design: { [section]: defaults[section] } });
}

/** Réinitialise le calque Motif / Image / Fond sélectionné (ou primaire). */
export function resetSelectedLayer(): void {
  const id = state.selectedLayerId;
  const layer = state.design.layers.find((l) => l.id === id) ?? editingMotif();
  if (!layer) return;
  if (layer.kind === 'fond') {
    update({ design: { layers: updateStackLayer(state.design.layers, 'fond', { color: newFondLayer().color }) } });
    return;
  }
  if (layer.kind === 'motif') {
    const fresh = newMotifLayer(layer.id, layer.source, defaultMotifLayout(), layer.name);
    update({
      design: {
        layers: updateStackLayer<MotifLayer>(state.design.layers, layer.id, {
          layout: fresh.layout,
          bounds: fresh.bounds,
          transparentColors: [],
          hidden: false,
          locked: false,
        }),
      },
    });
    return;
  }
  // Image : recentrer aux défauts
  const g = {
    needles: state.design.dimensions.needles,
    rows: Math.max(1, state.design.dimensions.legRows),
    stitchesPerCm: state.design.dimensions.stitchesPerCm,
    rowsPerCm: state.design.dimensions.rowsPerCm,
  };
  const fresh = newImageLayer(layer.id, layer.asset, g, layer.name);
  update({
    design: {
      layers: updateStackLayer<ImageLayer>(state.design.layers, layer.id, {
        x: fresh.x,
        y: fresh.y,
        widthStitches: fresh.widthStitches,
        rotation: 0,
        flipX: false,
        flipY: false,
        repeatAroundGap: null,
        transparentColors: [],
        hidden: false,
        locked: false,
      }),
    },
  });
}

/** Remet tout au défaut sauf les carreaux importés et images embarquées. */
export function resetAllDesign(): void {
  coalesceActive = false;
  const defaults = defaultDesign();
  const tileIds = state.tiles.map((t) => t.id);
  const motif = defaults.layers.find((l): l is MotifLayer => l.kind === 'motif');
  const layers = motif
    ? normalizeStack([
        defaults.layers[0]!,
        {
          ...motif,
          source: { kind: 'importes', tileIds: [...tileIds] },
        },
      ])
    : defaults.layers;
  update({
    design: {
      ...defaults,
      layers,
      name: state.design.name,
    },
    knitFidelity: 'fidele',
    footSide: 'droite',
    selectedLayerId: layers.find((l) => l.kind === 'motif')?.id ?? 'fond',
  });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
