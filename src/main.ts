import * as THREE from 'three';
import { composeGrid } from './core/grid';
import { defaultDimensions } from './core/sizes';
import { fixtureUrl, loadTileFromUrl } from './io/tiles';
import { createScene } from './render/scene';
import { createKnitMaterial, type KnitMaterial } from './render/knitTexture';
import { createSockMesh } from './render/sockGeometry';
import { getState, subscribe, update, type DesignPatch } from './state';
import type { SimHook, StitchRead } from './testHook';
import type { SockDimensions, StitchGrid, ZoneSettings } from './core/types';
import { mountPanel } from './ui/panel';

const viewport = document.getElementById('viewport');
const panel = document.getElementById('panel');
if (!viewport || !panel) throw new Error('Structure de page introuvable');

const handle = createScene(viewport);

let grid: StitchGrid = composeGrid(getState().design.dimensions, getState().design.zones, null, []);
let computeId = 0;
let lastComputeMs = 0;
let geometryBuilds = 0;
let textureUpdates = 0;
let surfaceKey = '';
let mesh: THREE.Mesh | null = null;
let knit: KnitMaterial | null = null;
const warnings: string[] = [];

function surfaceKeyOf(dims: SockDimensions, zones: ZoneSettings): string {
  return [
    dims.needles,
    dims.cuffRows,
    dims.legRows,
    dims.heelRows,
    dims.footRows,
    dims.toeRows,
    dims.stitchesPerCm,
    dims.rowsPerCm,
    zones.cuffEnabled ? 1 : 0,
  ].join('|');
}

function frameCamera(): void {
  if (!mesh) return;
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  const distance = (radius / Math.sin((handle.camera.fov * Math.PI) / 360)) * 1.2;
  handle.controls.target.copy(center);
  handle.camera.position.set(center.x + distance * 0.78, center.y + distance * 0.22, center.z + distance * 0.58);
  handle.camera.near = Math.max(distance / 200, 0.001);
  handle.camera.far = distance * 30;
  handle.camera.updateProjectionMatrix();
  handle.controls.update();
}

function cuffRowsOf(dims: SockDimensions, zones: ZoneSettings): number {
  return zones.cuffEnabled ? dims.cuffRows : 0;
}

function syncMesh(next: StitchGrid): void {
  const { design } = getState();
  const key = surfaceKeyOf(design.dimensions, design.zones);
  const cuffRows = cuffRowsOf(design.dimensions, design.zones);
  if (!mesh || !knit || key !== surfaceKey) {
    if (mesh) {
      handle.root.remove(mesh);
      mesh.geometry.dispose();
    }
    knit?.dispose();
    knit = createKnitMaterial(next, handle.renderer);
    knit.setLayout(design.dimensions.needles, next.height, cuffRows);
    mesh = createSockMesh(design.dimensions, design.zones, knit.material);
    handle.root.add(mesh);
    surfaceKey = key;
    geometryBuilds += 1;
    frameCamera();
  } else {
    knit.updateGrid(next);
    knit.setLayout(design.dimensions.needles, next.height, cuffRows);
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
    geometryBuilds,
    textureUpdates,
    warnings: [...warnings],
    loadFixture,
    setDesign,
    getStitch: readStitch,
  };
  window.__SIM__ = hook;
}

function recompute(): void {
  const started = performance.now();
  const { design } = getState();
  grid = composeGrid(design.dimensions, design.zones, null, []);
  syncMesh(grid);
  lastComputeMs = performance.now() - started;
  computeId += 1;
  publish();
}

mountPanel(panel);
subscribe(recompute);
recompute();
