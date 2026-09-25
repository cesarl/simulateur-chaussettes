import { BUILTIN_PRESETS, BUILTIN_PRESET_WARNINGS, migrateLegacyKind } from './core/presets';
import type { CalepinageSpec } from './core/calepinage';
import { tileRowsFor, tileWidthForCount } from './core/calepinage';
import type { Catalogue, ZoneColors } from './core/collections';
import { defaultDimensions, MACHINE_LIMITS } from './core/sizes';
import type {
  KnitFidelity,
  LayoutSettings,
  QuantizeSettings,
  SockDesign,
  SockDimensions,
  TileAsset,
  ZoneSettings,
  DecorSettings,
} from './core/types';
import type { Preset } from './core/calepinage';

export type FootSide = 'droite' | 'gauche';

/** Sections réinitialisables (hors carreaux importés). */
export type DesignSection = 'layout' | 'dimensions' | 'quantize' | 'zones' | 'decor';

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

/** Réglage partiel : chaque sous-objet est fusionné, pas remplacé. */
export interface DesignPatch {
  name?: string;
  version?: 1;
  layout?: Partial<Omit<LayoutSettings, 'calepinage'>> & {
    calepinage?: Partial<CalepinageSpec> & { genere?: Partial<CalepinageSpec['genere']> };
    /** @deprecated V1 — migré vers calepinage */
    kind?: string;
    rotation?: 0 | 90 | 180 | 270;
    seed?: number;
  };
  dimensions?: Partial<SockDimensions>;
  zones?: Partial<ZoneSettings>;
  quantize?: Partial<QuantizeSettings>;
  decor?: Partial<DecorSettings>;
}

export interface AppState {
  design: SockDesign;
  tiles: TileAsset[];
  /** Message lisible, ou null s'il n'y a pas d'erreur. */
  error: string | null;
  /** Rendu 3D des frontières de mailles (hors sérialisation projet). */
  knitFidelity: KnitFidelity;
  /** Pied droit ou gauche (miroir X du maillage). Hors sérialisation projet. */
  footSide: FootSide;
  /** Bibliothèque de préréglages (session / projet) ; défaut = config/calepinages.json. */
  calepPresets: Preset[];
  calepWarnings: string[];
  /** Catalogue synchronisé (`public/carreaux/`), ou null s’il n’est pas disponible. */
  catalogue: Catalogue | null;
  /** Message discret si `public/carreaux/` est absent. */
  catalogueMissing: boolean;
  /** Collection active (null = mode carreaux importés). */
  activeCollectionId: string | null;
  /** Couleurs de zones (codes nuancier) quand une collection est active. */
  zoneColors: ZoneColors | null;
  /** Option de palette courante (`defaut`, `reco-1`…). */
  paletteOptionId: string | null;
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
  activeCollectionId?: string | null;
  zoneColors?: ZoneColors | null;
  paletteOptionId?: string | null;
}

export interface UpdateOptions {
  /** Mouvement continu d’un curseur : un seul pas d’historique. */
  coalesce?: boolean;
  /** Ne pas enregistrer dans l’historique (undo/redo internes). */
  skipHistory?: boolean;
}

type Listener = (state: AppState) => void;

const HISTORY_MAX = 100;

interface HistoryEntry {
  design: SockDesign;
  tiles: TileAsset[];
  knitFidelity: KnitFidelity;
  footSide: FootSide;
  activeCollectionId: string | null;
  zoneColors: ZoneColors | null;
  paletteOptionId: string | null;
  coalesce: boolean;
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

/** Modèle de départ : homme, un seul motif, 4 couleurs auto, bord-côte présent. */
export function defaultDesign(): SockDesign {
  const dimensions = defaultDimensions('homme');
  const tilesAround = 6;
  const sized = layoutFromTilesAround(
    dimensions.needles,
    tilesAround,
    0,
    dimensions.stitchesPerCm,
    dimensions.rowsPerCm,
    true,
    1,
  );
  return {
    version: 1,
    name: 'modele',
    layout: {
      calepinage: defaultCalepinage(),
      tileIds: [],
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
    },
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
    },
    decor: defaultDecor(),
  };
}

function createInitial(): AppState {
  return {
    design: defaultDesign(),
    tiles: [],
    error: null,
    knitFidelity: 'fidele',
    footSide: 'droite',
    calepPresets: [...BUILTIN_PRESETS],
    calepWarnings: [...BUILTIN_PRESET_WARNINGS],
    catalogue: null,
    catalogueMissing: false,
    activeCollectionId: null,
    zoneColors: null,
    paletteOptionId: null,
  };
}

function cloneDesign(design: SockDesign): SockDesign {
  return structuredClone(design);
}

function snapshot(coalesce: boolean): HistoryEntry {
  return {
    design: cloneDesign(state.design),
    tiles: state.tiles,
    knitFidelity: state.knitFidelity,
    footSide: state.footSide,
    activeCollectionId: state.activeCollectionId,
    zoneColors: state.zoneColors ? { ...state.zoneColors } : null,
    paletteOptionId: state.paletteOptionId,
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
    activeCollectionId: entry.activeCollectionId,
    zoneColors: entry.zoneColors,
    paletteOptionId: entry.paletteOptionId,
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

function mergeCalepinage(
  current: CalepinageSpec,
  patch: NonNullable<DesignPatch['layout']>['calepinage'],
): CalepinageSpec {
  if (!patch) return current;
  return {
    ...current,
    ...patch,
    genere: patch.genere ? { ...current.genere, ...patch.genere } : current.genere,
  };
}

function applyLayout(layout: LayoutSettings, patch: NonNullable<DesignPatch['layout']>): LayoutSettings {
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
    tileIds: patch.tileIds ?? layout.tileIds,
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

function applyDesign(design: SockDesign, patch: DesignPatch): SockDesign {
  return {
    ...design,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.version !== undefined ? { version: patch.version } : {}),
    layout: patch.layout ? applyLayout(design.layout, patch.layout) : design.layout,
    dimensions: patch.dimensions ? { ...design.dimensions, ...patch.dimensions } : design.dimensions,
    zones: patch.zones ? { ...design.zones, ...patch.zones } : design.zones,
    quantize: patch.quantize ? { ...design.quantize, ...patch.quantize } : design.quantize,
    decor: patch.decor ? { ...design.decor, ...patch.decor } : design.decor,
  };
}

export function update(patch: StatePatch, options: UpdateOptions = {}): void {
  const records =
    !options.skipHistory &&
    (patch.design !== undefined ||
      patch.tiles !== undefined ||
      patch.knitFidelity !== undefined ||
      patch.footSide !== undefined ||
      patch.activeCollectionId !== undefined ||
      patch.zoneColors !== undefined ||
      patch.paletteOptionId !== undefined);
  if (records) pushHistory(options.coalesce === true);

  let design = patch.design ? applyDesign(state.design, patch.design) : state.design;
  const tiles = patch.tiles ?? state.tiles;
  if (patch.tiles) {
    design = {
      ...design,
      layout: { ...design.layout, tileIds: patch.tiles.map((tile) => tile.id) },
    };
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
    activeCollectionId:
      patch.activeCollectionId === undefined ? state.activeCollectionId : patch.activeCollectionId,
    zoneColors: patch.zoneColors === undefined ? state.zoneColors : patch.zoneColors,
    paletteOptionId:
      patch.paletteOptionId === undefined ? state.paletteOptionId : patch.paletteOptionId,
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

/** Empreinte d’une section hors liste de carreaux (pour pastille « modifié »). */
export function sectionFingerprint(section: DesignSection, design: SockDesign): string {
  if (section === 'layout') {
    const { tileIds: _ids, ...rest } = design.layout;
    return JSON.stringify(rest);
  }
  return JSON.stringify(design[section]);
}

export function isSectionDirty(section: DesignSection, design: SockDesign = state.design): boolean {
  return sectionFingerprint(section, design) !== sectionFingerprint(section, defaultDesign());
}

export function resetSection(section: DesignSection): void {
  const defaults = defaultDesign();
  if (section === 'layout') {
    update({
      design: {
        layout: {
          ...defaults.layout,
          tileIds: state.design.layout.tileIds,
        },
      },
    });
    return;
  }
  update({ design: { [section]: defaults[section] } });
}

/** Remet tout au défaut sauf les carreaux importés. */
export function resetAllDesign(): void {
  coalesceActive = false;
  const defaults = defaultDesign();
  update({
    design: {
      ...defaults,
      layout: { ...defaults.layout, tileIds: state.design.layout.tileIds },
      name: state.design.name,
    },
    knitFidelity: 'fidele',
    footSide: 'droite',
  });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
