/**
 * Cache des RVB par calque Motif + rendu de pile (V7).
 * Pur : pas de DOM. Compteur d’appels à `motifLayerRgb` pour les tests.
 */
import type { Preset } from './calepinage';
import { assetKey, type RasterImage } from './composition';
import {
  motifLayerRgb,
  primaryMotifLayer,
  renderStack,
  stackGauge,
  suggestStackPalette,
  type MotifLayer,
  type SockDesignV2,
  type StackLayer,
} from './layers';
import type { Hex, QuantizeSettings, TileAsset } from './types';

export interface MotifRgbCacheStats {
  /** Nombre d’appels réels à `motifLayerRgb` depuis le dernier reset. */
  motifRgbComputes: number;
}

export interface MotifRgbCache {
  stats: MotifRgbCacheStats;
  resetStats(): void;
  clear(): void;
  /**
   * Retourne la map id → RVB, en ne recalculant que les Motifs dont la clé a changé.
   * `tilesForLayer` : carreaux déjà rasterisés pour ce calque.
   */
  getMotifRgb(
    design: SockDesignV2,
    tilesForLayer: (layer: MotifLayer) => TileAsset[],
    presets: readonly Preset[],
  ): Map<string, Uint8ClampedArray>;
}

function motifCacheKey(
  layer: MotifLayer,
  dims: SockDesignV2['dimensions'],
  zones: SockDesignV2['zones'],
  sampling: QuantizeSettings['sampling'],
  tileSig: string,
): string {
  return JSON.stringify({
    id: layer.id,
    layout: layer.layout,
    source: layer.source,
    dims,
    zones: { patternOnFoot: zones.patternOnFoot, cuffEnabled: zones.cuffEnabled },
    sampling,
    tileSig,
  });
}

function tileSignature(tiles: readonly TileAsset[]): string {
  return tiles.map((t) => `${t.id}:${t.width}x${t.height}:${t.rgba.length}`).join('|');
}

/** Crée un cache de `motifLayerRgb` (une instance par session d’application / de test). */
export function createMotifRgbCache(): MotifRgbCache {
  const store = new Map<string, { key: string; rgb: Uint8ClampedArray }>();
  const stats: MotifRgbCacheStats = { motifRgbComputes: 0 };
  return {
    stats,
    resetStats() {
      stats.motifRgbComputes = 0;
    },
    clear() {
      store.clear();
    },
    getMotifRgb(design, tilesForLayer, presets) {
      const out = new Map<string, Uint8ClampedArray>();
      const alive = new Set<string>();
      for (const layer of design.layers) {
        if (layer.kind !== 'motif') continue;
        const tiles = tilesForLayer(layer);
        const tileSig = tileSignature(tiles);
        const key = motifCacheKey(layer, design.dimensions, design.zones, design.quantize.sampling, tileSig);
        alive.add(layer.id);
        const hit = store.get(layer.id);
        if (hit && hit.key === key) {
          out.set(layer.id, hit.rgb);
          continue;
        }
        stats.motifRgbComputes += 1;
        const rgb = motifLayerRgb(layer, tiles, design.dimensions, design.zones, design.quantize.sampling, presets);
        if (rgb) {
          store.set(layer.id, { key, rgb });
          out.set(layer.id, rgb);
        } else {
          store.delete(layer.id);
        }
      }
      for (const id of store.keys()) if (!alive.has(id)) store.delete(id);
      return out;
    },
  };
}

export interface StackComputeInput {
  design: SockDesignV2;
  /** Carreaux du projet (importés). */
  tiles: readonly TileAsset[];
  presets: readonly Preset[];
  /** Images pixelisées (clé = assetKey). */
  images?: ReadonlyMap<string, RasterImage>;
  /** Couleurs de fil connues par calque (collections). */
  keyColors?: ReadonlyMap<string, readonly Hex[]>;
  cache: MotifRgbCache;
}

function tilesForMotifLayer(layer: MotifLayer, projectTiles: readonly TileAsset[]): TileAsset[] {
  if (layer.source.kind === 'importes') {
    const ids = layer.source.tileIds.length ? layer.source.tileIds : projectTiles.map((t) => t.id);
    const byId = new Map(projectTiles.map((t) => [t.id, t]));
    return ids.map((id) => byId.get(id)).filter((t): t is TileAsset => !!t);
  }
  // Collection : les carreaux sont dans `projectTiles`, nommés « <collection>-<variation> »
  // (plusieurs collections peuvent cohabiter, une par calque Motif).
  return collectionTiles(layer.source.collectionId, projectTiles);
}

/** Carreaux d’une collection parmi les carreaux du projet (repli : tous, comportement V6). */
export function collectionTiles(collectionId: string, projectTiles: readonly TileAsset[]): TileAsset[] {
  const prefix = `${collectionId.toLowerCase()}-`;
  const own = projectTiles.filter((t) => t.name.toLowerCase().startsWith(prefix));
  return own.length > 0 ? own : [...projectTiles];
}

/**
 * RVB zone motif via `renderStack`. Utilise le cache Motif.
 * Retourne aussi `owner` et les stats du cache.
 */
export function computeStackRgb(input: StackComputeInput): {
  rgb: Uint8ClampedArray | null;
  owner: Int16Array | null;
  motifRgb: Map<string, Uint8ClampedArray>;
} {
  const { design, tiles, presets, cache } = input;
  const motifRgb = cache.getMotifRgb(design, (layer) => tilesForMotifLayer(layer, tiles), presets);
  const hasContent =
    motifRgb.size > 0 ||
    design.layers.some((l) => l.kind === 'image' && !l.hidden && input.images?.has(assetKey(l.asset)));
  // Fond seul : toujours une grille unie.
  const gauge = stackGauge(design.dimensions, design.zones);
  if (gauge.needles < 1 || gauge.rows < 1) return { rgb: null, owner: null, motifRgb };
  if (!hasContent && design.layers.length <= 1) {
    // Fond seul sans motif : renderStack remplit quand même avec le fond.
  }
  const { rgb, owner } = renderStack({
    layers: design.layers,
    gauge,
    motifRgb,
    images: input.images ?? new Map(),
    keyColors: input.keyColors,
  });
  return { rgb, owner, motifRgb };
}

/** Palette suggérée d’après les calques (si `paletteFromLayers`). */
export function stackPaletteIfEnabled(
  design: SockDesignV2,
  motifRgb: Map<string, Uint8ClampedArray>,
  images: ReadonlyMap<string, RasterImage>,
  keyColors: ReadonlyMap<string, readonly Hex[]> | undefined,
  rendered: Uint8ClampedArray,
): { palette: Hex[]; maxColors: number } | null {
  if (!design.quantize.paletteFromLayers) return null;
  const palette = suggestStackPalette({ layers: design.layers, motifRgb, images, keyColors }, rendered);
  if (palette.length === 0) return null;
  return { palette, maxColors: Math.min(8, Math.max(2, palette.length)) };
}

export { primaryMotifLayer, tilesForMotifLayer };
export type { StackLayer };
