import * as THREE from 'three';
import { composeGrid } from './core/grid';
import { fixtureUrl, loadTileFromUrl } from './io/tiles';
import { createScene } from './render/scene';
import { getState, subscribe, update, type DesignPatch } from './state';
import type { SimHook, StitchRead } from './testHook';
import type { StitchGrid } from './core/types';
import { mountPanel } from './ui/panel';

/**
 * Point d'entrée. La scène affiche encore un cylindre provisoire (remplacé en T06).
 * L'état, les carreaux et la grille de mailles sont déjà branchés.
 */
const viewport = document.getElementById('viewport');
const panel = document.getElementById('panel');
if (!viewport || !panel) throw new Error('Structure de page introuvable');

const handle = createScene(viewport);
const placeholder = new THREE.Mesh(
  new THREE.CylinderGeometry(0.12, 0.12, 0.6, 48, 1, true),
  new THREE.MeshStandardMaterial({ color: '#b5462f', side: THREE.DoubleSide, roughness: 0.9 }),
);
handle.root.add(placeholder);
handle.requestRender();

let grid: StitchGrid = composeGrid(getState().design.dimensions, getState().design.zones, null, []);
let computeId = 0;
let lastComputeMs = 0;
const geometryBuilds = 1;
const warnings: string[] = [];

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
  lastComputeMs = performance.now() - started;
  computeId += 1;
  publish();
}

mountPanel(panel);
subscribe(recompute);
recompute();
