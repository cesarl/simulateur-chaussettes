import * as THREE from 'three';
import { checkFabrication } from './core/checks';
import { yarnColors } from './core/collections';
import { composeGrid, gridFingerprint } from './core/grid';
import { layoutRaccord, samplePattern, seamMismatch } from './core/layout';
import { resolvePreset } from './core/presets';
import { quantize } from './core/quantize';
import { defaultDimensions, MACHINE_LIMITS, stitchAspect } from './core/sizes';
import { runExports, renderPair } from './io/exportPng';
import { loadCatalogue } from './io/catalogue';
import { tilesFromCollection, nuancierMap } from './io/collectionTiles';
import {
  loadLastProject,
  parseProject,
  saveLastProject,
  serializeProject,
  type ParsedProject,
  type ProjectCollectionMeta,
} from './io/project';
import { fixtureUrl, loadTileFromUrl } from './io/tiles';
import { createScene } from './render/scene';
import { createSockObject, type SockObject } from './render/sock3d/sockObject';
import type { SockShapeInput } from './render/sock3d/sockShape';
import { capturePng, frameView, type ViewName } from './render/sock3d/studio';
import { getState, subscribe, update, undo, redo, type DesignPatch } from './state';
import type { SimHook, StitchRead } from './testHook';
import type { SockDimensions, StitchGrid, ZoneSettings } from './core/types';
import { mountFlatView } from './ui/flatView';
import { mountPanel, renderChecks, renderStatus } from './ui/panel';
import { yarnLegendLabels } from './ui/palettePanel';

const viewport = document.getElementById('viewport');
const panel = document.getElementById('panel');
if (!viewport || !panel) throw new Error('Structure de page introuvable');

const handle = createScene(viewport);
const flat = mountFlatView(viewport, () => handle.requestRender());

let grid: StitchGrid = composeGrid(getState().design.dimensions, getState().design.zones, null, []);
let patternPalette: string[] = [];
let patternCounts: number[] = [];
let computeId = 0;
let lastComputeMs = 0;
let textureUpdates = 0;
let surfaceKey = '';
let sock: SockObject | null = null;
const warnings: string[] = [];

function surfaceKeyOf(dims: SockDimensions, zones: ZoneSettings, side: string): string {
  return [
    dims.size,
    dims.needles,
    dims.cuffRows,
    dims.legRows,
    dims.heelRows,
    dims.footRows,
    dims.toeRows,
    dims.rowsPerCm,
    zones.cuffEnabled ? 1 : 0,
    zones.heelHeightMm,
    zones.heelDepthMm,
    zones.heelSpread,
    side,
  ].join('|');
}

function shapeFromDesign(dims: SockDimensions, zones: ZoneSettings, side: 'droite' | 'gauche'): SockShapeInput {
  return {
    needles: dims.needles,
    cuffRows: zones.cuffEnabled ? dims.cuffRows : 0,
    legRows: dims.legRows,
    heelRows: dims.heelRows,
    footRows: dims.footRows,
    toeRows: dims.toeRows,
    rowsPerCm: dims.rowsPerCm,
    size: dims.size,
    side,
    heelHeight: zones.heelHeightMm,
    heelDepth: zones.heelDepthMm,
    heelSpread: zones.heelSpread / 100,
  };
}

function frameCamera(view: ViewName = 'trois-quarts'): void {
  if (!sock) return;
  const mirror = getState().footSide === 'gauche';
  const center = frameView(handle.camera, sock.mesh, view, 0.85, mirror);
  const box = new THREE.Box3().setFromObject(sock.mesh);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  handle.controls.target.copy(center);
  handle.controls.minDistance = Math.max(sphere.radius * 0.55, 0.05);
  handle.controls.maxDistance = Math.max(sphere.radius * 12, 0.5);
  handle.controls.update();
  handle.requestRender();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function syncMesh(next: StitchGrid): void {
  const { design, knitFidelity, footSide } = getState();
  const key = surfaceKeyOf(design.dimensions, design.zones, footSide);
  const shape = shapeFromDesign(design.dimensions, design.zones, footSide);
  const zones = {
    heel: design.zones.heelColor,
    toe: design.zones.toeColor,
    rim: design.zones.cuffEnabled ? design.zones.cuffColor : undefined,
  };
  const chevron = knitFidelity === 'fidele' ? 0.9 : 0;

  if (!sock) {
    sock = createSockObject(shape, next, zones);
    sock.setChevron(chevron);
    handle.root.add(sock.mesh);
    surfaceKey = key;
    frameCamera();
  } else if (key !== surfaceKey) {
    sock.setShape(shape);
    sock.setColors(next, zones);
    sock.setChevron(chevron);
    surfaceKey = key;
    frameCamera();
  } else {
    sock.setColors(next, zones);
    sock.setChevron(chevron);
  }
  textureUpdates += 1;
  handle.requestRender();
}

function readStitch(col: number, row: number): StitchRead | null {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
  const index = row * grid.width + col;
  const colorIndex = grid.colorIndex[index] ?? 0;
  return {
    col,
    row,
    zone: grid.zone[index] ?? 0,
    color: grid.palette[colorIndex] ?? '#000000',
  };
}

async function loadFixture(name: string): Promise<void> {
  try {
    const tile = await loadTileFromUrl(fixtureUrl(name));
    update({ tiles: [...getState().tiles, tile], error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impossible de charger l’exemple.';
    update({ error: message });
  }
}

function setDesign(partial: DesignPatch): void {
  if (partial.dimensions?.size) {
    const preset = defaultDimensions(partial.dimensions.size);
    update({ design: { ...partial, dimensions: { ...preset, ...partial.dimensions } } });
    return;
  }
  update({ design: partial });
}

async function captureView(view: ViewName, size: number, background: string | null = '#ecebe8'): Promise<string> {
  if (!sock) throw new Error('La chaussette n’est pas prête.');
  const mirror = getState().footSide === 'gauche';
  const blob = await capturePng(handle.renderer, handle.scene, sock.mesh, view, size, background, mirror);
  handle.requestRender();
  return blobToDataUrl(blob);
}

async function capturePair(size: number, background: string | null = '#ecebe8'): Promise<string> {
  const { design, footSide } = getState();
  const shape = shapeFromDesign(design.dimensions, design.zones, footSide);
  const blob = await renderPair(
    {
      renderer: handle.renderer,
      scene: handle.scene,
      mesh: sock?.mesh ?? null,
      grid,
      aspect: stitchAspect(design.dimensions),
      modelName: design.name,
      sizeId: design.dimensions.size,
      redraw: () => handle.requestRender(),
      pairShape: { ...shape, side: 'droite' },
      pairZones: {
        heel: design.zones.heelColor,
        toe: design.zones.toeColor,
        rim: design.zones.cuffEnabled ? design.zones.cuffColor : undefined,
      },
      mirrorView: false,
    },
    size,
    background ?? '#ecebe8',
    background === null,
  );
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture capture impossible.'));
    reader.readAsDataURL(blob);
  });
}

function publish(): void {
  const design = structuredClone(getState().design);
  const hook: SimHook = {
    ready: true,
    computeId,
    lastComputeMs,
    design,
    grid: { width: grid.width, height: grid.height, palette: [...grid.palette] },
    gridHash: gridFingerprint(grid),
    patternPalette: [...patternPalette],
    geometryBuilds: sock?.geometryBuilds ?? 0,
    textureUpdates,
    knitFidelity: getState().knitFidelity,
    cameraPosition: {
      x: handle.camera.position.x,
      y: handle.camera.position.y,
      z: handle.camera.position.z,
    },
    cameraTarget: {
      x: handle.controls.target.x,
      y: handle.controls.target.y,
      z: handle.controls.target.z,
    },
    warnings: [...warnings],
    catalogue: getState().catalogue,
    catalogueMissing: getState().catalogueMissing,
    activeCollectionId: getState().activeCollectionId,
    loadFixture,
    setDesign,
    getStitch: readStitch,
    flatCenter: flat.centerOf,
    captureView,
    capturePair,
  };
  window.__SIM__ = hook;
}

function recompute(): void {
  const started = performance.now();
  const { design, tiles, calepPresets, catalogue, activeCollectionId, zoneColors } = getState();
  let pattern: Uint8Array | null = null;
  patternPalette = [];
  patternCounts = [];
  if (tiles.length > 0 && design.layout.tileIds.length > 0) {
    const rgb = samplePattern(
      tiles,
      design.layout,
      design.dimensions,
      design.zones,
      design.quantize.sampling,
      calepPresets,
    );
    let quantizeSettings = design.quantize;
    if (catalogue && activeCollectionId && zoneColors) {
      const collection = catalogue.collections.find((c) => c.id === activeCollectionId);
      if (collection) {
        const nuancier = new Map(catalogue.nuancier.map((c) => [c.id, c]));
        const yarns = yarnColors(collection, zoneColors, nuancier);
        quantizeSettings = {
          ...design.quantize,
          paletteMode: 'manuelle',
          palette: yarns.map((y) => y.hex),
          maxColors: Math.max(2, Math.min(8, yarns.length || 2)),
        };
      }
    }
    const reduced = quantize(rgb, design.dimensions.needles, quantizeSettings);
    pattern = reduced.indices;
    patternPalette = reduced.palette;
    patternCounts = reduced.counts;
  }
  grid = composeGrid(design.dimensions, design.zones, pattern, patternPalette);
  flat.setGrid(grid, stitchAspect(design.dimensions));
  const report = checkFabrication(
    grid,
    design.layout,
    design.zones,
    MACHINE_LIMITS,
    design.quantize.maxFloat,
  );
  flat.setFloatMask(report.floatMask);
  renderChecks(report);
  syncMesh(grid);
  lastComputeMs = performance.now() - started;
  computeId += 1;
  publish();
  const tileCount = Math.max(1, tiles.length || design.layout.tileIds.length);
  const preset = resolvePreset(design.layout.calepinage, calepPresets);
  const mismatch = seamMismatch(design.layout, design.dimensions.needles, tileCount, preset);
  const raccordInfo = layoutRaccord(design.layout, design.dimensions.needles, tileCount, preset);
  renderStatus({
    ms: lastComputeMs,
    patternPalette,
    patternCounts,
    mismatch,
    raccordMessage: raccordInfo.message,
  });
}

let saveTimer = 0;

function currentCollectionMeta(): ProjectCollectionMeta | null {
  const { activeCollectionId, zoneColors, paletteOptionId, catalogue } = getState();
  if (!activeCollectionId || !zoneColors) return null;
  return {
    id: activeCollectionId,
    zoneColors: { ...zoneColors },
    paletteOptionId,
    syncCommit: catalogue?.source.commit ?? null,
  };
}

async function applyParsedProject(project: ParsedProject): Promise<void> {
  const catalogue = getState().catalogue;
  const meta = project.collection;
  if (meta && catalogue) {
    const collection = catalogue.collections.find((c) => c.id === meta.id);
    if (collection) {
      try {
        const nuancier = nuancierMap(catalogue);
        const tiles = await tilesFromCollection(collection, meta.zoneColors, nuancier);
        const yarns = yarnColors(collection, meta.zoneColors, nuancier);
        update({
          design: {
            ...project.design,
            layout: { ...project.design.layout, tileIds: tiles.map((t) => t.id) },
            quantize: {
              ...project.design.quantize,
              paletteMode: 'manuelle',
              palette: yarns.map((y) => y.hex),
              maxColors: Math.max(2, Math.min(8, yarns.length)),
            },
          },
          tiles,
          activeCollectionId: meta.id,
          zoneColors: { ...meta.zoneColors },
          paletteOptionId: meta.paletteOptionId,
          error: null,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Rechargement collection impossible.';
        update({
          design: project.design,
          tiles: project.tiles,
          activeCollectionId: null,
          zoneColors: null,
          paletteOptionId: null,
          error: `${message} Carreaux du projet utilisés.`,
        });
        return;
      }
    }
    update({
      design: project.design,
      tiles: project.tiles,
      activeCollectionId: null,
      zoneColors: null,
      paletteOptionId: null,
      error: `Collection « ${meta.id} » absente après synchronisation : carreaux du projet utilisés.`,
    });
    return;
  }
  update({
    design: project.design,
    tiles: project.tiles,
    activeCollectionId: null,
    zoneColors: null,
    paletteOptionId: null,
    error: null,
  });
}

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const { design, tiles } = getState();
    void serializeProject(design, tiles, { collection: currentCollectionMeta() })
      .then((json) => saveLastProject(json))
      .catch(() => undefined);
  }, 200);
}

async function boot(): Promise<void> {
  if (!panel) throw new Error('Structure de page introuvable');

  const bundle = await loadCatalogue();
  if (bundle.missing) {
    update({ catalogue: null, catalogueMissing: true }, { skipHistory: true });
  } else {
    const patch: Parameters<typeof update>[0] = {
      catalogue: bundle.catalogue,
      catalogueMissing: false,
    };
    if (bundle.presets && bundle.presets.length > 0) {
      patch.calepPresets = bundle.presets;
      patch.calepWarnings = bundle.warnings;
    }
    update(patch, { skipHistory: true });
  }

  try {
    const saved = await loadLastProject();
    if (saved) await applyParsedProject(saved);
  } catch {
    // IndexedDB absent ou document illisible : le modèle par défaut reste en place.
  }

  mountPanel(panel, {
    exportImages: (request) => {
      const { design, footSide } = getState();
      const shape = shapeFromDesign(design.dimensions, design.zones, footSide);
      return runExports(
        {
          renderer: handle.renderer,
          scene: handle.scene,
          mesh: sock?.mesh ?? null,
          grid,
          aspect: stitchAspect(design.dimensions),
          modelName: design.name,
          sizeId: design.dimensions.size,
          redraw: () => handle.requestRender(),
          pairShape: { ...shape, side: 'droite' },
          pairZones: {
            heel: design.zones.heelColor,
            toe: design.zones.toeColor,
            rim: design.zones.cuffEnabled ? design.zones.cuffColor : undefined,
          },
          mirrorView: footSide === 'gauche',
          paletteLabels: yarnLegendLabels(),
        },
        request,
      );
    },
    saveProject: async () => {
      const { design, tiles } = getState();
      const json = await serializeProject(design, tiles, { collection: currentCollectionMeta() });
      const blob = new Blob([json], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `${design.name || 'modele'}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    openProject: async (text) => {
      const project = await parseProject(text);
      await applyParsedProject(project);
    },
  });
  subscribe(recompute);
  subscribe(scheduleSave);
  recompute();

  handle.controls.addEventListener('change', () => {
    const sim = window.__SIM__;
    if (!sim) return;
    sim.cameraPosition = {
      x: handle.camera.position.x,
      y: handle.camera.position.y,
      z: handle.camera.position.z,
    };
    sim.cameraTarget = {
      x: handle.controls.target.x,
      y: handle.controls.target.y,
      z: handle.controls.target.z,
    };
  });

  const viewKeyToName: Record<string, ViewName> = {
    f: 'face',
    t: 'trois-quarts',
    e: 'profil-exterieur',
    d: 'dos',
    i: 'profil-interieur',
  };

  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'r') {
      event.preventDefault();
      frameCamera('trois-quarts');
      publish();
      return;
    }
    const viewName = viewKeyToName[key];
    if (!viewName) return;
    event.preventDefault();
    frameCamera(viewName);
    publish();
  });
}

void boot();
