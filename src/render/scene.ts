import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStudio, setupRenderer, type Studio } from './sock3d/studio';

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  studio: Studio;
  requestRender: () => void;
  dispose: () => void;
}

/** Scène 3D studio : fond neutre, RoomEnvironment, ombres, caméra orbitale. Rendu à la demande. */
export function createScene(container: HTMLElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  setupRenderer(renderer);
  renderer.domElement.dataset.testid = 'sock-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const studio = createStudio(renderer, scene);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  camera.position.set(0.4, 0.25, 0.7);

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
    studio,
    requestRender,
    dispose: () => {
      ro.disconnect();
      controls.dispose();
      studio.dispose();
      renderer.dispose();
    },
  };
}
