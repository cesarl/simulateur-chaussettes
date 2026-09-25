/**
 * Décor « carreaux de ciment posés » : sol et/ou mur générés à partir des SVG de la collection.
 *
 * Rendu réaliste sans modèle ni photo :
 *  - chaque carreau est dessiné avec sa rotation (même moteur de calepinage que la chaussette) ;
 *  - joints creusés, légère variation de teinte d'un carreau à l'autre (fabrication artisanale),
 *    grain du ciment, bords légèrement arrondis, finition cirée satinée (rugosité plus faible que le joint) ;
 *  - cartes de relief (normales) et de rugosité calculées à partir d'une carte de hauteur ;
 *  - le sol s'estompe en douceur vers le fond (vignette) pour garder l'aspect « photo produit ».
 *
 * Canvas 2D + Three.js (navigateur). Le calcul de la carte de normales est isolé et testable.
 */
import * as THREE from 'three';
import { hash01, planPlacements, type CalepinageSpec, type Preset } from '../calepinage/calepinage';

export type DecorMode = 'aucun' | 'sol' | 'mur' | 'coin';

export interface DecorOptions {
  mode: DecorMode;
  /** Côté d'un carreau en cm (format de la collection : 20, 15, 10…). */
  tileCm: number;
  /** Largeur du joint en mm. */
  groutMm: number;
  groutColor: string;
  /** 0 = carreaux neufs et identiques, 1 = variations et usure marquées. */
  patina: number;
  /** Nombre de carreaux par côté (sol carré). */
  tilesPerSide: number;
  /** Distance du mur au centre de la chaussette (m). */
  wallDistance: number;
  /** 0 = couleurs franches (défaut), 1 = décor très pâle. */
  attenuation: number;
  /** Intensité du grain de ciment (texture photo) : 0 à 1. */
  grainStrength: number;
}

export const DEFAULT_DECOR: DecorOptions = {
  mode: 'aucun',
  tileCm: 20,
  groutMm: 1.5,
  groutColor: '#f3f1ec', // joint blanc cassé, comme une pose soignée
  patina: 0.3,
  tilesPerSide: 12,
  wallDistance: 0.45,
  attenuation: 0,
  grainStrength: 0.7,
};

/** Côté du carreau en cm d'après le champ `format` de la collection (« 20x20 », « 10x10 »…). */
export function tileCmFromFormat(format: string | null | undefined, fallback = 20): number {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i.exec(format ?? '');
  if (!m) return fallback;
  const a = parseFloat(m[1]!.replace(',', '.'));
  return a > 0 && a <= 60 ? a : fallback;
}

export type TileSource = CanvasImageSource & { width: number; height: number };

// ------------------------------------------------------------------ calcul pur
/**
 * Carte de normales (RGBA) depuis une carte de hauteur (0..1). `strength` = accentuation du relief.
 * Pur : testable sans navigateur.
 */
export function heightToNormal(height: Float32Array, w: number, h: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const H = (x: number, y: number) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      out[o + 1] = ((dy / l) * 0.5 + 0.5) * 255; // repère Three.js (v vers le haut)
      out[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

// ------------------------------------------------------------------ texture
export interface TileSurfaceInput {
  tiles: TileSource[]; // variations déjà recolorées (SVG pixelisés ou images)
  /** Photo de grain de ciment (niveaux de gris), ex. public/textures/grain-ciment.jpg. Facultatif. */
  grain?: TileSource | null;
  spec: CalepinageSpec;
  preset: Preset | null;
  cols: number;
  rows: number;
  options: DecorOptions;
  /** Pixels par carreau dans la texture (192 = bon compromis qualité / mémoire). */
  pxPerTile?: number;
  seed?: number;
}

export interface TileSurfaceMaps {
  color: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/**
 * Prépare la photo de grain : niveaux ramenés autour du gris moyen (128) pour un mélange « lumière douce »
 * qui garde les couleurs du carreau et n'ajoute que la matière (grain, petites piqûres, fines fissures).
 */
function prepareGrain(src: TileSource, contrast = 3): HTMLCanvasElement {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i]!;
  const mean = sum / (d.length / 4);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, 128 + (d[i]! - mean) * contrast));
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Grain de secours si aucune photo n'est fournie : bruit très fin autour de 128. */
function fallbackGrain(size: number, seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (hash01(i % size, Math.floor(i / size), seed, 7) - 0.5) * 36;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function buildTileSurface(input: TileSurfaceInput): TileSurfaceMaps {
  const S = input.pxPerTile ?? 256;
  const { cols, rows, options: o } = input;
  const seed = input.seed ?? 11;
  const W = cols * S;
  const H = rows * S;
  const groutPx = Math.max(1, (o.groutMm / (o.tileCm * 10)) * S);
  const [color, cctx] = canvas(W, H);
  const [rough, rctx] = canvas(W, H);
  const height = new Float32Array(W * H).fill(1);

  // joint : blanc cassé, à peine en retrait, très mat
  cctx.fillStyle = o.groutColor;
  cctx.fillRect(0, 0, W, H);
  rctx.fillStyle = 'rgb(248,248,248)';
  rctx.fillRect(0, 0, W, H);

  const plan = planPlacements(input.spec, { tileCount: input.tiles.length, preset: input.preset, tilesAround: null }, cols, rows);
  const grain = input.grain ? prepareGrain(input.grain) : fallbackGrain(S, seed);
  const inset = groutPx / 2;
  const size = S - groutPx;

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const p = plan[ty * cols + tx]!;
      const img = input.tiles[p.tile % input.tiles.length]!;
      const x0 = tx * S + inset;
      const y0 = ty * S + inset;
      cctx.save();
      cctx.beginPath();
      cctx.rect(x0, y0, size, size);
      cctx.clip();
      cctx.save();
      cctx.translate(x0 + size / 2, y0 + size / 2);
      cctx.rotate((p.rot * Math.PI) / 180);
      cctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
      cctx.drawImage(img, -size / 2, -size / 2, size, size);
      cctx.restore();

      // matière : un morceau différent de la photo de grain pour chaque carreau (décalage + quart de tour)
      const gs = Math.min(grain.width, grain.height);
      const crop = Math.min(gs, Math.max(64, gs * (o.tileCm / 20) * 0.9)); // 20 cm ≈ la photo entière
      const gx = hash01(tx, ty, seed, 22) * (grain.width - crop);
      const gy = hash01(tx, ty, seed, 23) * (grain.height - crop);
      const q = Math.floor(hash01(tx, ty, seed, 24) * 4);
      cctx.globalCompositeOperation = 'soft-light';
      cctx.globalAlpha = Math.max(0, Math.min(1, o.grainStrength));
      cctx.translate(x0 + size / 2, y0 + size / 2);
      cctx.rotate((q * Math.PI) / 2);
      cctx.drawImage(grain, gx, gy, crop, crop, -size / 2, -size / 2, size, size);
      cctx.restore();

      // fabrication artisanale : très légère différence de teinte d'un carreau à l'autre
      const v = (hash01(tx, ty, seed, 21) - 0.5) * 0.06 * o.patina;
      if (v !== 0) {
        cctx.fillStyle = v > 0 ? `rgba(255,252,246,${v})` : `rgba(60,48,36,${-v})`;
        cctx.fillRect(x0, y0, size, size);
      }

      // rugosité : ciment mat (pas de reflet)
      const r = Math.round(228 + hash01(tx, ty, seed, 25) * 14 * o.patina);
      rctx.fillStyle = `rgb(${r},${r},${r})`;
      rctx.fillRect(x0, y0, size, size);
    }
  }

  // relief : seul le joint est légèrement en retrait (pas de biseau, pas d'effet « embossé »)
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const x0 = tx * S + inset;
      const y0 = ty * S + inset;
      for (let y = ty * S; y < (ty + 1) * S; y++) {
        for (let x = tx * S; x < (tx + 1) * S; x++) {
          const inside = x >= x0 && x < x0 + size && y >= y0 && y < y0 + size;
          if (!inside) height[y * W + x] = 0.7;
        }
      }
    }
  }

  // atténuation (facultative)
  if (o.attenuation > 0) {
    cctx.fillStyle = `rgba(245,243,238,${Math.min(0.85, o.attenuation)})`;
    cctx.fillRect(0, 0, W, H);
  }

  const [normal, nctx] = canvas(W, H);
  const img = nctx.createImageData(W, H);
  img.data.set(heightToNormal(height, W, H, 1.2));
  nctx.putImageData(img, 0, 0);
  // le canal vert de la rugosité (convention glTF / Three) : on garde du gris, c'est équivalent
  return { color, normal, roughness: rough };
}

// ------------------------------------------------------------------ objets 3D
export interface DecorHandle {
  group: THREE.Group;
  /** Oriente le mur face à la caméra (à appeler avant chaque rendu ou capture). */
  faceCamera(camera: THREE.Camera, target: THREE.Vector3): void;
  dispose(): void;
}

function tex(c: HTMLCanvasElement, srgb: boolean, anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Vignette : le sol s'estompe vers les bords (transparence radiale). */
function fadeMap(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.55, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createDecor(maps: TileSurfaceMaps, o: DecorOptions, center: THREE.Vector3, renderer: THREE.WebGLRenderer): DecorHandle {
  const group = new THREE.Group();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const colorT = tex(maps.color, true, aniso);
  const normalT = tex(maps.normal, false, aniso);
  const roughT = tex(maps.roughness, false, aniso);
  const fade = fadeMap();
  const side = (o.tilesPerSide * o.tileCm) / 100;
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];

  const makeMat = (withFade: boolean) => {
    const m = new THREE.MeshStandardMaterial({
      map: colorT,
      normalMap: normalT,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: roughT,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.6, // ciment mat : peu de reflets d'environnement
      transparent: withFade,
      alphaMap: withFade ? fade : null,
      depthWrite: true,
    });
    mats.push(m);
    return m;
  };

  let wall: THREE.Mesh | null = null;
  if (o.mode === 'sol' || o.mode === 'coin') {
    const g = new THREE.PlaneGeometry(side, side);
    geos.push(g);
    const floor = new THREE.Mesh(g, makeMat(o.mode === 'sol'));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, 0, center.z);
    floor.receiveShadow = true;
    floor.renderOrder = -1;
    group.add(floor);
  }
  if (o.mode === 'mur' || o.mode === 'coin') {
    const g = new THREE.PlaneGeometry(side, side * 0.6);
    // carreaux carrés sur le mur : on ne prend que 60 % de la hauteur de la texture
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.6);
    uv.needsUpdate = true;
    geos.push(g);
    wall = new THREE.Mesh(g, makeMat(false));
    wall.receiveShadow = true;
    group.add(wall);
  }

  return {
    group,
    faceCamera(camera, target) {
      if (!wall) return;
      // mur derrière la chaussette, face à la caméra (en horizontal), posé au sol
      const dir = new THREE.Vector3().subVectors(camera.position, target).setY(0).normalize();
      wall.position.copy(target).addScaledVector(dir, -o.wallDistance);
      wall.position.y = (side * 0.6) / 2;
      wall.lookAt(wall.position.clone().add(dir));
    },
    dispose() {
      [colorT, normalT, roughT, fade].forEach((t) => t.dispose());
      mats.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
    },
  };
}
