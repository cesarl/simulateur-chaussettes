/**
 * Branche le décor sol/mur sur la scène : régénération différée, face caméra.
 */
import * as THREE from 'three';
import type { CalepinageSpec } from '../core/calepinage';
import { DEFAULT_CALEPINAGE } from '../core/calepinage';
import type { Collection } from '../core/collections';
import { resolvePreset } from '../core/presets';
import type { DecorSettings, TileAsset } from '../core/types';
import { tilesFromCollection, nuancierMap } from '../io/collectionTiles';
import { getState } from '../state';
import {
  buildTileSurface,
  createDecor,
  DEFAULT_DECOR,
  type DecorHandle,
  type DecorOptions,
} from './decor/tileSurface';

function tileToCanvas(tile: TileAsset): HTMLCanvasElement & { width: number; height: number } {
  const c = document.createElement('canvas');
  c.width = tile.width;
  c.height = tile.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible pour le décor.');
  ctx.putImageData(new ImageData(tile.rgba.slice(), tile.width, tile.height), 0, 0);
  return c as HTMLCanvasElement & { width: number; height: number };
}

function toOptions(d: DecorSettings): DecorOptions {
  return {
    ...DEFAULT_DECOR,
    mode: d.mode,
    tileCm: d.tileCm,
    groutMm: d.groutMm,
    groutColor: d.groutColor,
    patina: d.patina,
    attenuation: d.attenuation,
  };
}

/** « 20x20 » / « 10 × 10 » → cm (borné 10–30). */
export function tileCmFromFormat(format: string): number {
  const match = format.match(/(\d+)/);
  const n = match ? Number(match[1]) : 20;
  return Math.min(30, Math.max(10, Number.isFinite(n) ? n : 20));
}

function calepinageForCollection(c: Collection): CalepinageSpec {
  const id = c.calepinageParDefaut;
  if (!id) return { ...DEFAULT_CALEPINAGE };
  return {
    ...DEFAULT_CALEPINAGE,
    source: 'prereglage',
    presetId: id,
  };
}

export interface DecorController {
  /** Met à jour le décor si options/carreaux ont changé. */
  sync: () => void;
  faceCamera: (camera: THREE.Camera, target: THREE.Vector3) => void;
  dispose: () => void;
}

export function createDecorController(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  studioGround: THREE.Mesh,
  getCenter: () => THREE.Vector3,
  onChanged?: () => void,
): DecorController {
  let handle: DecorHandle | null = null;
  let lastKey = '';
  let idle = 0;
  let buildGen = 0;
  const tileCache = new Map<string, TileAsset[]>();

  function disposeHandle(): void {
    if (!handle) return;
    scene.remove(handle.group);
    handle.dispose();
    handle = null;
  }

  function decorKey(): string {
    const { design, tiles, activeCollectionId } = getState();
    const d = design.decor;
    return JSON.stringify({
      mode: d.mode,
      tileCm: d.tileCm,
      groutMm: d.groutMm,
      groutColor: d.groutColor,
      patina: d.patina,
      attenuation: d.attenuation,
      tileSource: d.tileSource,
      otherCollectionId: d.otherCollectionId,
      sockTiles: tiles.map((t) => t.id),
      activeCollectionId,
      calep: design.layout.calepinage,
      graine: design.layout.calepinage.graine,
    });
  }

  async function resolveTilesAndSpec(): Promise<{
    tiles: TileAsset[];
    spec: CalepinageSpec;
  } | null> {
    const { design, tiles, catalogue, activeCollectionId, calepPresets } = getState();
    const d = design.decor;
    if (d.mode === 'aucun') return null;

    if (d.tileSource === 'sock' || !catalogue) {
      if (tiles.length === 0) return null;
      return { tiles, spec: design.layout.calepinage };
    }

    let collection: Collection | undefined;
    if (d.tileSource === 'collection-origin') {
      collection = catalogue.collections.find((c) => c.id === activeCollectionId);
      if (!collection) {
        if (tiles.length === 0) return null;
        return { tiles, spec: design.layout.calepinage };
      }
    } else {
      const id = d.otherCollectionId;
      if (!id) return null;
      collection = catalogue.collections.find((c) => c.id === id);
      if (!collection) return null;
    }

    const cacheKey = `${collection.id}|origin`;
    let loaded = tileCache.get(cacheKey);
    if (!loaded) {
      loaded = await tilesFromCollection(collection, collection.couleursParDefaut, nuancierMap(catalogue));
      tileCache.set(cacheKey, loaded);
    }
    void calepPresets;
    return { tiles: loaded, spec: calepinageForCollection(collection) };
  }

  function applyBuilt(
    mapsTiles: TileAsset[],
    spec: CalepinageSpec,
    opts: DecorOptions,
  ): void {
    const { calepPresets, design } = getState();
    const sources = mapsTiles.map(tileToCanvas);
    const preset = resolvePreset(spec, calepPresets);
    const maps = buildTileSurface({
      tiles: sources,
      spec,
      preset,
      cols: opts.tilesPerSide,
      rows: opts.tilesPerSide,
      options: opts,
      seed: design.layout.calepinage.graine,
    });
    disposeHandle();
    handle = createDecor(maps, opts, getCenter(), renderer);
    scene.add(handle.group);
    studioGround.visible = opts.mode === 'mur';
    lastKey = decorKey();
    onChanged?.();
  }

  async function buildNow(gen: number): Promise<void> {
    const { design } = getState();
    const opts = toOptions(design.decor);
    if (opts.mode === 'aucun') {
      if (gen !== buildGen) return;
      disposeHandle();
      studioGround.visible = true;
      lastKey = decorKey();
      onChanged?.();
      return;
    }
    const resolved = await resolveTilesAndSpec();
    if (gen !== buildGen) return;
    if (!resolved || resolved.tiles.length === 0) {
      disposeHandle();
      studioGround.visible = true;
      lastKey = decorKey();
      onChanged?.();
      return;
    }
    applyBuilt(resolved.tiles, resolved.spec, opts);
  }

  function scheduleBuild(): void {
    buildGen += 1;
    const gen = buildGen;
    window.clearTimeout(idle);
    const run = () => {
      void buildNow(gen);
    };
    if (typeof requestIdleCallback === 'function') {
      idle = window.setTimeout(() => {
        requestIdleCallback(() => run(), { timeout: 500 });
      }, 0);
    } else {
      idle = window.setTimeout(run, getState().design.decor.mode === 'aucun' ? 0 : 50);
    }
  }

  return {
    sync() {
      const key = decorKey();
      if (key === lastKey) return;
      scheduleBuild();
    },
    faceCamera(camera, target) {
      handle?.faceCamera(camera, target);
    },
    dispose() {
      buildGen += 1;
      window.clearTimeout(idle);
      disposeHandle();
      studioGround.visible = true;
      tileCache.clear();
    },
  };
}
