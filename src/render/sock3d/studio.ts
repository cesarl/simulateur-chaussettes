/**
 * Mise en scène « photo produit » : lumière de studio douce, reflets d'environnement,
 * ombre de contact au sol, fond uni, cadrage automatique et captures PNG.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Studio {
  ground: THREE.Mesh;
  setBackground(color: string | null): void;
  dispose(): void;
}

export function setupRenderer(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // respecte les teintes (important pour les couleurs de fils)
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

export function createStudio(renderer: THREE.WebGLRenderer, scene: THREE.Scene, background = '#ecebe8'): Studio {
  setupRenderer(renderer);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color(background);

  const hemi = new THREE.HemisphereLight('#ffffff', '#d8d2c8', 0.35);
  scene.add(hemi);

  // lumière principale douce, en hauteur, légèrement de côté
  const key = new THREE.DirectionalLight('#fff6ec', 2.1);
  key.position.set(-0.45, 0.9, 0.55);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -0.3;
  key.shadow.camera.right = 0.3;
  key.shadow.camera.top = 0.3;
  key.shadow.camera.bottom = -0.3;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 3;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  scene.add(key);

  // contre-jour qui détache la silhouette
  const rim = new THREE.DirectionalLight('#eef2ff', 0.9);
  rim.position.set(0.6, 0.5, -0.8);
  scene.add(rim);

  // débouchage frontal
  const fill = new THREE.DirectionalLight('#ffffff', 0.25);
  fill.position.set(0.7, 0.25, 0.9);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  return {
    ground,
    setBackground(color) {
      scene.background = color ? new THREE.Color(color) : null;
    },
    dispose() {
      env.dispose();
      pmrem.dispose();
    },
  };
}

export type ViewName = 'trois-quarts' | 'profil-exterieur' | 'face' | 'dos' | 'profil-interieur' | 'trois-quarts-dos' | 'dessous';

/** Angle horizontal (degrés, 0 = devant, sens horaire vu du dessus) et hauteur de caméra. */
const VIEWS: Record<ViewName, { az: number; el: number }> = {
  face: { az: 0, el: 12 },
  'trois-quarts': { az: -48, el: 20 },
  'profil-exterieur': { az: -90, el: 6 },
  'trois-quarts-dos': { az: -140, el: 14 },
  dos: { az: 180, el: 10 },
  'profil-interieur': { az: 90, el: 6 },
  dessous: { az: -70, el: -55 }, // contrôle de la semelle
};

/** Place la caméra pour que l'objet remplisse ~85 % du cadre. Pour une chaussette gauche, inverser az. */
export function frameView(camera: THREE.PerspectiveCamera, object: THREE.Object3D, view: ViewName, fill = 0.85, mirror = false) {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const { az, el } = VIEWS[view];
  const a = THREE.MathUtils.degToRad(mirror ? -az : az);
  const e = THREE.MathUtils.degToRad(el);
  // chaussette droite : l'extérieur est du côté −X ; devant = +Z
  const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = sphere.radius / Math.sin(Math.min(fov, fov * camera.aspect) / 2) * fill;
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = dist / 50;
  camera.far = dist * 10;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
  return sphere.center.clone();
}

/**
 * Capture PNG à la taille demandée. On redimensionne temporairement le rendu (même canvas, même
 * tonemapping et espace couleur que l'écran), puis on restaure la vue de l'utilisateur.
 * Nécessite `preserveDrawingBuffer: true` sur le WebGLRenderer.
 */
export async function capturePng(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  object: THREE.Object3D,
  view: ViewName,
  size = 2048,
  background: string | null = '#ecebe8',
  mirror = false,
): Promise<Blob> {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  frameView(cam, object, view, 0.92, mirror);
  const prevBg = scene.background;
  const prevSize = renderer.getSize(new THREE.Vector2());
  const prevRatio = renderer.getPixelRatio();
  const prevAlpha = renderer.getClearAlpha();
  scene.background = background ? new THREE.Color(background) : null;
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearAlpha(background ? 1 : 0);
  renderer.render(scene, cam);
  const blob = await new Promise<Blob>((res, rej) =>
    renderer.domElement.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'),
  );
  scene.background = prevBg;
  renderer.setClearAlpha(prevAlpha);
  renderer.setPixelRatio(prevRatio);
  renderer.setSize(prevSize.x, prevSize.y, false);
  return blob;
}
