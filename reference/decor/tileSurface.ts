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
  /** 0 = couleurs franches, 1 = décor très pâle : laisse la chaussette ressortir. */
  attenuation: number;
}

export const DEFAULT_DECOR: DecorOptions = {
  mode: 'aucun',
  tileCm: 20,
  groutMm: 2,
  groutColor: '#d9d3c7',
  patina: 0.35,
  tilesPerSide: 12,
  wallDistance: 0.45,
  attenuation: 0.25,
};

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

/** Grain du ciment : bruit fin et quelques taches, réutilisé (décalé) sur chaque carreau. */
function grainCanvas(size: number, seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = hash01(i % size, Math.floor(i / size), seed, 7);
    const v = 128 + (n - 0.5) * 60;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // taches douces
  for (let k = 0; k < 14; k++) {
    const x = hash01(k, 1, seed, 8) * size;
    const y = hash01(k, 2, seed, 8) * size;
    const r = (0.08 + hash01(k, 3, seed, 8) * 0.2) * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = hash01(k, 4, seed, 8) < 0.5;
    g.addColorStop(0, dark ? 'rgba(90,90,90,0.18)' : 'rgba(170,170,170,0.18)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

export function buildTileSurface(input: TileSurfaceInput): TileSurfaceMaps {
  const S = input.pxPerTile ?? 192;
  const { cols, rows, options: o } = input;
  const seed = input.seed ?? 11;
  const W = cols * S;
  const H = rows * S;
  const groutPx = Math.max(1, (o.groutMm / (o.tileCm * 10)) * S);
  const [color, cctx] = canvas(W, H);
  const [rough, rctx] = canvas(W, H);
  const height = new Float32Array(W * H);

  // joint
  cctx.fillStyle = o.groutColor;
  cctx.fillRect(0, 0, W, H);
  rctx.fillStyle = 'rgb(245,245,245)'; // joint : très mat
  rctx.fillRect(0, 0, W, H);

  const plan = planPlacements(input.spec, { tileCount: input.tiles.length, preset: input.preset, tilesAround: null }, cols, rows);
  const grain = grainCanvas(S, seed);
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
      cctx.translate(x0 + size / 2, y0 + size / 2);
      cctx.rotate((p.rot * Math.PI) / 180);
      cctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
      cctx.drawImage(img, -size / 2, -size / 2, size, size);
      cctx.restore();

      // variation de teinte d'un carreau à l'autre + grain
      const v = (hash01(tx, ty, seed, 21) - 0.5) * 0.12 * o.patina;
      cctx.fillStyle = v > 0 ? `rgba(255,250,240,${v})` : `rgba(40,30,20,${-v})`;
      cctx.fillRect(x0, y0, size, size);
      cctx.save();
      cctx.globalCompositeOperation = 'overlay';
      cctx.globalAlpha = 0.25 + 0.35 * o.patina;
      const gx = Math.floor(hash01(tx, ty, seed, 22) * S);
      cctx.translate(x0 - gx, y0);
      cctx.drawImage(grain, 0, 0);
      cctx.drawImage(grain, S, 0);
      cctx.restore();
      // bords légèrement ombrés (arête arrondie)
      cctx.strokeStyle = `rgba(0,0,0,${0.08 + 0.1 * o.patina})`;
      cctx.lineWidth = Math.max(1, groutPx * 0.6);
      cctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);

      // rugosité : cire satinée, un peu irrégulière
      const r = Math.round(120 + hash01(tx, ty, seed, 23) * 40 * o.patina + 20);
      rctx.fillStyle = `rgb(${r},${r},${r})`;
      rctx.fillRect(x0, y0, size, size);

      // hauteur : carreau plein, bord arrondi sur ~1,5 % du carreau
      const bevel = Math.max(1.5, S * 0.015);
      for (let y = Math.floor(y0); y < Math.ceil(y0 + size); y++) {
        for (let x = Math.floor(x0); x < Math.ceil(x0 + size); x++) {
          const d = Math.min(x - x0, y - y0, x0 + size - x, y0 + size - y);
          const e = Math.min(1, Math.max(0, d / bevel));
          const micro = (hash01(x, y, seed, 24) - 0.5) * 0.04 * (0.5 + o.patina);
          height[y * W + x] = Math.sin((e * Math.PI) / 2) + micro;
        }
      }
    }
  }

  // atténuation : on éclaircit tout le décor pour que la chaussette reste le sujet
  if (o.attenuation > 0) {
    cctx.fillStyle = `rgba(245,243,238,${Math.min(0.85, o.attenuation)})`;
    cctx.fillRect(0, 0, W, H);
  }

  const [normal, nctx] = canvas(W, H);
  const img = nctx.createImageData(W, H);
  img.data.set(heightToNormal(height, W, H, 3.5));
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
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: roughT,
      roughness: 1,
      metalness: 0,
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
