import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  requestRender: () => void;
  dispose: () => void;
}

/** Scène 3D minimale : fond neutre, éclairage doux, caméra orbitale. Rendu à la demande. */
export function createScene(container: HTMLElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.dataset.testid = 'sock-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eeeae4');

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0.1, 1.4);

  scene.add(new THREE.HemisphereLight('#ffffff', '#c8c0b4', 1.35));
  const key = new THREE.DirectionalLight('#ffffff', 1.7);
  key.position.set(1.4, 2.2, 1.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#fff4ea', 0.7);
  fill.position.set(-1.6, 0.6, 1.2);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;

  let pending = false;
  const requestRender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      renderer.render(scene, camera);
    });
  };
  controls.addEventListener('change', requestRender);

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  return {
    renderer,
    scene,
    camera,
    controls,
    root,
    requestRender,
    dispose: () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
