import { checkFabrication } from './core/checks';
import { composeGrid, gridFingerprint } from './core/grid';
import { samplePattern, seamMismatch } from './core/layout';
import { quantize } from './core/quantize';
import { defaultDimensions, MACHINE_LIMITS, stitchAspect } from './core/sizes';
import { runExports } from './io/exportPng';
import { loadLastProject, parseProject, saveLastProject, serializeProject } from './io/project';
import { fixtureUrl, loadTileFromUrl } from './io/tiles';
import { createScene } from './render/scene';
import { createSockObject, type SockObject } from './render/sock3d/sockObject';
import type { SockShapeInput } from './render/sock3d/sockShape';
import { frameView, type ViewName } from './render/sock3d/studio';
import { getState, subscribe, update, type DesignPatch } from './state';
import type { SimHook, StitchRead } from './testHook';
import type { SockDimensions, StitchGrid, ZoneSettings } from './core/types';
import { mountFlatView } from './ui/flatView';
import { mountPanel, renderChecks, renderStatus } from './ui/panel';

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

function surfaceKeyOf(dims: SockDimensions, zones: ZoneSettings): string {
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
  ].join('|');
}

function shapeFromDesign(dims: SockDimensions, zones: ZoneSettings): SockShapeInput {
  return {
    needles: dims.needles,
    cuffRows: zones.cuffEnabled ? dims.cuffRows : 0,
    legRows: dims.legRows,
    heelRows: dims.heelRows,
    footRows: dims.footRows,
    toeRows: dims.toeRows,
    rowsPerCm: dims.rowsPerCm,
    size: dims.size,
  };
}

function frameCamera(view: ViewName = 'trois-quarts'): void {
  if (!sock) return;
  const center = frameView(handle.camera, sock.mesh, view);
  handle.controls.target.copy(center);
  handle.controls.update();
  handle.requestRender();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function syncMesh(next: StitchGrid): void {
  const { design, knitFidelity } = getState();
  const key = surfaceKeyOf(design.dimensions, design.zones);
  const shape = shapeFromDesign(design.dimensions, design.zones);
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
    loadFixture,
    setDesign,
    getStitch: readStitch,
    flatCenter: flat.centerOf,
  };
  window.__SIM__ = hook;
}

function recompute(): void {
  const started = performance.now();
  const { design, tiles } = getState();
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
    );
    const reduced = quantize(rgb, design.dimensions.needles, design.quantize);
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
  renderStatus({
    ms: lastComputeMs,
    patternPalette,
    patternCounts,
    mismatch: seamMismatch(design.layout, design.dimensions.needles),
  });
}

let saveTimer = 0;

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const { design, tiles } = getState();
    void serializeProject(design, tiles)
      .then((json) => saveLastProject(json))
      .catch(() => undefined);
  }, 200);
}

async function boot(): Promise<void> {
  if (!panel) throw new Error('Structure de page introuvable');
  try {
    const saved = await loadLastProject();
    if (saved) update({ design: saved.design, tiles: saved.tiles, error: null });
  } catch {
    // IndexedDB absent ou document illisible : le modèle par défaut reste en place.
  }
  mountPanel(panel, {
    exportImages: (request) => {
      const { design } = getState();
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
        },
        request,
      );
    },
    saveProject: async () => {
      const { design, tiles } = getState();
      const json = await serializeProject(design, tiles);
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
      update({ design: project.design, tiles: project.tiles, error: null });
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
