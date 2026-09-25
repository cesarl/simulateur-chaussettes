import { defaultDimensions, MACHINE_LIMITS, stitchAspect } from './core/sizes';
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
  layout?: Partial<LayoutSettings>;
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

/** Modèle de départ : homme, calepinage en grille, 4 couleurs auto, bord-côte présent. */
export function defaultDesign(): SockDesign {
  const dimensions = defaultDimensions('homme');
  const tileStitches = 24;
  const tileRows = Math.max(1, Math.round(tileStitches / stitchAspect(dimensions)));
  return {
    version: 1,
    name: 'modele',
    layout: {
      kind: 'grille',
      tileIds: [],
      tileStitches,
      tileRows,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#d9d3c7',
      offsetStitches: 0,
      offsetRows: 0,
      rotation: 0,
      seed: 1,
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

function applyDesign(design: SockDesign, patch: DesignPatch): SockDesign {
  return {
    ...design,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.version !== undefined ? { version: patch.version } : {}),
    layout: patch.layout ? { ...design.layout, ...patch.layout } : design.layout,
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
