import * as THREE from 'three';
import { hexToRgb } from '../core/color';
import type { StitchGrid } from '../core/types';
import { Zone } from '../core/types';
import { viewById, type ViewId } from '../render/views';
import { encodeIndexedBmp } from './exportBmp';

/** Échelle du plat lisible : au moins 8 px de large par maille, hauteur au rapport réel. */
const READABLE_SCALE = 8;
const DOWNLOAD_GAP_MS = 250;

const ZONE_LABEL: Record<number, string> = {
  [Zone.Cuff]: 'Bord-côte',
  [Zone.Leg]: 'Tige',
  [Zone.Heel]: 'Talon',
  [Zone.Foot]: 'Pied',
  [Zone.Toe]: 'Pointe',
  [Zone.Empty]: 'Hors tricot',
};

export type FlatKind = 'exact' | 'lisible';

export interface ExportRequest {
  views: ViewId[];
  flats: FlatKind[];
  size: 1024 | 2048 | 4096;
  background: string;
  transparent: boolean;
  /** BMP 8 bits indexé (1 px = 1 maille). */
  bmp: boolean;
  /** Planche : 4 vues + grille + palette. */
  board: boolean;
}

export interface ExportSource {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  mesh: THREE.Object3D | null;
  grid: StitchGrid;
  aspect: number;
  modelName: string;
  sizeId: string;
  redraw: () => void;
}

function slug(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'modele';
}

export function exportFileName(modelName: string, sizeId: string, view: string): string {
  return `${slug(modelName)}_${slug(sizeId)}_${view}.png`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function rgbaToPng(pixels: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas 2D indisponible.'));
  const image = context.createImageData(width, height);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Encodage PNG impossible.'));
    }, 'image/png');
  });
}

function flipY(pixels: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const source = (height - 1 - y) * stride;
    out.set(pixels.subarray(source, source + stride), y * stride);
  }
  return out;
}

/** Pixels du plat exact : 1 px = 1 maille, sans quadrillage ni légende. */
export function exactFlatPixels(grid: StitchGrid): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let index = 0; index < grid.colorIndex.length; index++) {
    const hex = grid.palette[grid.colorIndex[index] ?? 0] ?? '#000000';
    const rgb = hexToRgb(hex);
    const offset = index * 4;
    pixels[offset] = rgb.r;
    pixels[offset + 1] = rgb.g;
    pixels[offset + 2] = rgb.b;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function placeCamera(camera: THREE.PerspectiveCamera, box: THREE.Box3, direction: THREE.Vector3): void {
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let distance = sphere.radius / Math.tan(fov / 2);
  const corner = new THREE.Vector3();
  for (let pass = 0; pass < 2; pass++) {
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 200, 0.001);
    camera.far = distance + sphere.radius * 8;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    let maxNdc = 0.001;
    const xs = [box.min.x, box.max.x];
    const ys = [box.min.y, box.max.y];
    const zs = [box.min.z, box.max.z];
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          corner.set(x, y, z).project(camera);
          maxNdc = Math.max(maxNdc, Math.abs(corner.x), Math.abs(corner.y));
        }
      }
    }
    distance *= maxNdc / 0.85;
  }
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 200, 0.001);
  camera.far = distance + sphere.radius * 8;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

async function renderView(
  source: ExportSource,
  viewId: ViewId,
  size: number,
  background: string,
  transparent: boolean,
): Promise<Blob> {
  if (!source.mesh) throw new Error('La chaussette n’est pas prête.');
  const view = viewById(viewId);
  const direction = new THREE.Vector3(...view.direction).normalize();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const box = new THREE.Box3().setFromObject(source.mesh);
  if (box.isEmpty()) throw new Error('Rien à exporter.');
  placeCamera(camera, box, direction);

  const target = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
  });
  const previousTarget = source.renderer.getRenderTarget();
  const previousBackground = source.scene.background;
  const previousColor = source.renderer.getClearColor(new THREE.Color());
  const previousAlpha = source.renderer.getClearAlpha();
  try {
    if (transparent) {
      source.scene.background = null;
      source.renderer.setClearColor(0x000000, 0);
    } else {
      source.scene.background = new THREE.Color(background);
      source.renderer.setClearColor(background, 1);
    }
    source.renderer.setRenderTarget(target);
    source.renderer.clear();
    source.renderer.render(source.scene, camera);
    const pixels = new Uint8Array(size * size * 4);
    source.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    return await rgbaToPng(flipY(pixels, size, size), size, size);
  } finally {
    source.scene.background = previousBackground;
    source.renderer.setClearColor(previousColor, previousAlpha);
    source.renderer.setRenderTarget(previousTarget);
    target.dispose();
    source.redraw();
  }
}

function readableCells(aspect: number): { w: number; h: number } {
  const w = READABLE_SCALE;
  const h = Math.max(1, Math.round(READABLE_SCALE * aspect));
  return { w, h };
}

async function renderReadable(grid: StitchGrid, aspect: number): Promise<Blob> {
  const { w, h } = readableCells(aspect);
  const marginLeft = 120;
  const marginTop = 28;
  const legend = 28 + grid.palette.length * 22;
  const width = marginLeft + grid.width * w + 16;
  const height = marginTop + grid.height * h + legend + 12;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible.');
  context.fillStyle = '#f4f1ec';
  context.fillRect(0, 0, width, height);

  const buckets = new Map<string, number[]>();
  const counts = new Array<number>(grid.palette.length).fill(0);
  for (let index = 0; index < grid.colorIndex.length; index++) {
    const colorIndex = grid.colorIndex[index] ?? 0;
    counts[colorIndex] = (counts[colorIndex] ?? 0) + 1;
    const color = grid.palette[colorIndex] ?? '#000000';
    const bucket = buckets.get(color);
    if (bucket) bucket.push(index);
    else buckets.set(color, [index]);
  }
  const originX = marginLeft;
  const originY = marginTop;
  for (const [color, indices] of buckets) {
    context.fillStyle = color;
    context.beginPath();
    for (const index of indices) {
      const col = index % grid.width;
      const row = Math.floor(index / grid.width);
      context.rect(originX + col * w, originY + row * h, w, h);
    }
    context.fill();
  }
  context.strokeStyle = 'rgba(29, 29, 27, 0.35)';
  context.lineWidth = 1;
  context.beginPath();
  for (let col = 0; col <= grid.width; col += 1) {
    const x = originX + col * w + 0.5;
    context.moveTo(x, originY);
    context.lineTo(x, originY + grid.height * h);
  }
  for (let row = 0; row <= grid.height; row += 1) {
    const y = originY + row * h + 0.5;
    context.moveTo(originX, y);
    context.lineTo(originX + grid.width * w, y);
  }
  context.stroke();

  context.fillStyle = '#1d1d1b';
  context.font = '14px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  for (let col = 0; col < grid.width; col += 10) {
    context.fillText(String(col), originX + col * w + w / 2, 14);
  }
  context.textAlign = 'right';
  for (let row = 0; row < grid.height; row += 10) {
    context.fillText(String(row), marginLeft - 10, originY + row * h + h / 2);
  }
  context.textAlign = 'left';
  let row = 0;
  while (row < grid.height) {
    const zone = grid.zone[row * grid.width] ?? Zone.Empty;
    let end = row + 1;
    while (end < grid.height && (grid.zone[end * grid.width] ?? Zone.Empty) === zone) end += 1;
    const top = originY + row * h;
    const bottom = originY + end * h;
    const color = grid.palette[grid.colorIndex[row * grid.width] ?? 0] ?? '#000000';
    context.fillStyle = color;
    context.fillRect(8, top, 8, Math.max(4, bottom - top));
    if (bottom - top >= 16) {
      context.fillStyle = '#1d1d1b';
      context.fillText(ZONE_LABEL[zone] ?? 'Zone', 22, (top + bottom) / 2);
    }
    row = end;
  }

  let legendY = originY + grid.height * h + 16;
  context.font = '14px system-ui, sans-serif';
  grid.palette.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(marginLeft, legendY, 16, 16);
    context.fillStyle = '#1d1d1b';
    context.textAlign = 'left';
    context.fillText(`${color} · ${counts[index] ?? 0} mailles`, marginLeft + 24, legendY + 8);
    legendY += 22;
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Encodage PNG impossible.'));
    }, 'image/png');
  });
}

/** Quatre vues de la planche (face, trois-quarts, profil extérieur, dos). */
export const BOARD_VIEWS: readonly ViewId[] = ['face', 'trois-quarts', 'profil-exterieur', 'dos'];

const BOARD_TILE = 512;
const BOARD_GAP = 16;
const BOARD_FLAT_SCALE = 4;

async function renderViewPixels(
  source: ExportSource,
  viewId: ViewId,
  size: number,
  background: string,
): Promise<Uint8ClampedArray> {
  if (!source.mesh) throw new Error('La chaussette n’est pas prête.');
  const view = viewById(viewId);
  const direction = new THREE.Vector3(...view.direction).normalize();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const box = new THREE.Box3().setFromObject(source.mesh);
  if (box.isEmpty()) throw new Error('Rien à exporter.');
  placeCamera(camera, box, direction);

  const target = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
  });
  const previousTarget = source.renderer.getRenderTarget();
  const previousBackground = source.scene.background;
  const previousColor = source.renderer.getClearColor(new THREE.Color());
  const previousAlpha = source.renderer.getClearAlpha();
  try {
    source.scene.background = new THREE.Color(background);
    source.renderer.setClearColor(background, 1);
    source.renderer.setRenderTarget(target);
    source.renderer.clear();
    source.renderer.render(source.scene, camera);
    const pixels = new Uint8Array(size * size * 4);
    source.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    return flipY(pixels, size, size);
  } finally {
    source.scene.background = previousBackground;
    source.renderer.setClearColor(previousColor, previousAlpha);
    source.renderer.setRenderTarget(previousTarget);
    target.dispose();
    source.redraw();
  }
}

async function renderBoard(source: ExportSource, background: string): Promise<Blob> {
  const title = source.modelName || 'modele';
  const tile = BOARD_TILE;
  const gap = BOARD_GAP;
  const flatW = source.grid.width * BOARD_FLAT_SCALE;
  const flatH = Math.max(1, Math.round(source.grid.height * BOARD_FLAT_SCALE * source.aspect));
  const legendH = 28 + source.grid.palette.length * 22;
  const headerH = 48;
  const viewsW = tile * 2 + gap;
  const viewsH = tile * 2 + gap;
  const width = Math.max(viewsW, flatW) + gap * 2;
  const height = headerH + viewsH + gap + flatH + gap + legendH + gap;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible.');
  context.fillStyle = '#f4f1ec';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#1d1d1b';
  context.font = '600 22px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.fillText(title, gap, headerH / 2);

  const viewPixels: Uint8ClampedArray[] = [];
  for (const viewId of BOARD_VIEWS) {
    viewPixels.push(await renderViewPixels(source, viewId, tile, background));
  }
  for (let index = 0; index < BOARD_VIEWS.length; index++) {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = gap + col * (tile + gap);
    const y = headerH + row * (tile + gap);
    const image = context.createImageData(tile, tile);
    image.data.set(viewPixels[index] ?? new Uint8ClampedArray(tile * tile * 4));
    context.putImageData(image, x, y);
    context.fillStyle = '#1d1d1b';
    context.font = '13px system-ui, sans-serif';
    context.textBaseline = 'top';
    const label = viewById(BOARD_VIEWS[index]!).label;
    context.fillText(label, x + 8, y + 8);
  }

  const flatY = headerH + viewsH + gap;
  const flatX = gap;
  const flatPixels = exactFlatPixels(source.grid);
  const flatCanvas = document.createElement('canvas');
  flatCanvas.width = source.grid.width;
  flatCanvas.height = source.grid.height;
  const flatCtx = flatCanvas.getContext('2d');
  if (!flatCtx) throw new Error('Canvas 2D indisponible.');
  const flatImage = flatCtx.createImageData(source.grid.width, source.grid.height);
  flatImage.data.set(flatPixels);
  flatCtx.putImageData(flatImage, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(flatCanvas, flatX, flatY, flatW, flatH);

  let legendY = flatY + flatH + gap;
  context.font = '14px system-ui, sans-serif';
  context.textBaseline = 'middle';
  const counts = new Array<number>(source.grid.palette.length).fill(0);
  for (const index of source.grid.colorIndex) counts[index] = (counts[index] ?? 0) + 1;
  source.grid.palette.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(gap, legendY, 16, 16);
    context.fillStyle = '#1d1d1b';
    context.fillText(`${color} · ${counts[index] ?? 0} mailles`, gap + 24, legendY + 8);
    legendY += 22;
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Encodage PNG impossible.'));
    }, 'image/png');
  });
}

interface Job {
  filename: string;
  render: () => Promise<Blob>;
}

export async function runExports(source: ExportSource, request: ExportRequest): Promise<void> {
  const jobs: Job[] = [];
  for (const viewId of request.views) {
    jobs.push({
      filename: exportFileName(source.modelName, source.sizeId, viewId),
      render: () => renderView(source, viewId, request.size, request.background, request.transparent),
    });
  }
  if (request.flats.includes('exact')) {
    jobs.push({
      filename: exportFileName(source.modelName, source.sizeId, 'plat-exact'),
      render: () => rgbaToPng(exactFlatPixels(source.grid), source.grid.width, source.grid.height),
    });
  }
  if (request.flats.includes('lisible')) {
    jobs.push({
      filename: exportFileName(source.modelName, source.sizeId, 'plat-lisible'),
      render: () => renderReadable(source.grid, source.aspect),
    });
  }
  if (request.bmp) {
    jobs.push({
      filename: exportFileName(source.modelName, source.sizeId, 'grille').replace(/\.png$/, '.bmp'),
      render: async () => {
        const encoded = encodeIndexedBmp(source.grid);
        const copy = new Uint8Array(encoded.byteLength);
        copy.set(encoded);
        return new Blob([copy.buffer], { type: 'image/bmp' });
      },
    });
  }
  if (request.board) {
    jobs.push({
      filename: exportFileName(source.modelName, source.sizeId, 'planche'),
      render: () => renderBoard(source, request.transparent ? '#eeeae4' : request.background),
    });
  }
  if (jobs.length === 0) throw new Error('Cochez au moins une vue.');
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    if (!job) continue;
    if (index > 0) await wait(DOWNLOAD_GAP_MS);
    downloadBlob(await job.render(), job.filename);
  }
}
