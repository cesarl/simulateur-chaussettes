import { defaultDimensions, MACHINE_LIMITS, stitchAspect } from './core/sizes';
import { migrateLegacyKind } from './core/presets';
import type {
  CalepinageSpec,
} from './core/calepinage';
import type {
  KnitFidelity,
  LayoutSettings,
  QuantizeSettings,
  SockDesign,
  SockDimensions,
  TileAsset,
  ZoneSettings,
} from './core/types';

export type FootSide = 'droite' | 'gauche';

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
}

export interface StatePatch {
  design?: DesignPatch;
  tiles?: TileAsset[];
  error?: string | null;
  knitFidelity?: KnitFidelity;
  footSide?: FootSide;
}

type Listener = (state: AppState) => void;

function defaultCalepinage(): CalepinageSpec {
  return migrateLegacyKind('grille', 1, 0);
}

/** Modèle de départ : homme, un seul motif, 4 couleurs auto, bord-côte présent. */
export function defaultDesign(): SockDesign {
  const dimensions = defaultDimensions('homme');
  const tileStitches = 24;
  const tileRows = Math.max(1, Math.round(tileStitches / stitchAspect(dimensions)));
  return {
    version: 1,
    name: 'modele',
    layout: {
      calepinage: defaultCalepinage(),
      tileIds: [],
      tileStitches,
      tileRows,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#d9d3c7',
      offsetStitches: 0,
      offsetRows: 0,
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
  };
}

function createInitial(): AppState {
  return { design: defaultDesign(), tiles: [], error: null, knitFidelity: 'fidele', footSide: 'droite' };
}

let state: AppState = createInitial();
const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function resetState(): void {
  state = createInitial();
  listeners.clear();
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
  };
}

export function update(patch: StatePatch): void {
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
  };
  for (const listener of listeners) listener(state);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
