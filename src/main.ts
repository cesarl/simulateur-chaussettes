import * as THREE from 'three';
import { createScene } from './render/scene';
import { defaultDimensions, totalRows } from './core/sizes';

/**
 * Point d'entrée. Squelette : une scène 3D avec un cylindre provisoire.
 * La tâche T04 remplace le cylindre par la chaussette procédurale.
 */
const viewport = document.getElementById('viewport');
if (!viewport) throw new Error('#viewport introuvable');

const handle = createScene(viewport);

const placeholder = new THREE.Mesh(
  new THREE.CylinderGeometry(0.12, 0.12, 0.6, 48, 1, true),
  new THREE.MeshStandardMaterial({ color: '#b5462f', side: THREE.DoubleSide, roughness: 0.9 }),
);
handle.root.add(placeholder);
handle.requestRender();

const dims = defaultDimensions('homme');

// Crochet de test : les tests e2e lisent window.__SIM__ (voir .cursor/rules/20-tests.mdc).
declare global {
  interface Window {
    __SIM__?: { ready: boolean; info: Record<string, unknown> };
  }
}
window.__SIM__ = {
  ready: true,
  info: { needles: dims.needles, rows: totalRows(dims, true) },
};
