import * as THREE from 'three';
import { hexToRgb } from '../core/color';
import type { StitchGrid } from '../core/types';
import { Zone } from '../core/types';
import { viewById, type ViewId } from '../render/views';
import { capturePng } from '../render/sock3d/studio';
import { createSockObject } from '../render/sock3d/sockObject';
import type { SockShapeInput } from '../render/sock3d/sockShape';
import type { ZoneColorsLike } from '../render/sock3d/sockAtlas';
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
  /** Deux chaussettes (droite + gauche) côte à côte. */
  pair: boolean;
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
  /** Dimensions/forme sans `side` (la paire force droite + gauche). */
  pairShape: SockShapeInput;
  pairZones: ZoneColorsLike;
  /** Inverser l’azimut de cadrage (chaussette gauche seule). */
  mirrorView: boolean;
  /** Légende fabricant : hex → « CODE · Nom ». */
  paletteLabels?: Map<string, string> | Record<string, string>;
  /** Avant chaque capture 3D (ex. mur décor face caméra). */
  beforeRender?: (camera: THREE.PerspectiveCamera, target: THREE.Vector3) => void;
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

export async function renderPair(
  source: ExportSource,
  size: number,
  background: string,
  transparent: boolean,
): Promise<Blob> {
  const right = createSockObject({ ...source.pairShape, side: 'droite' }, source.grid, source.pairZones);
  const left = createSockObject({ ...source.pairShape, side: 'gauche' }, source.grid, source.pairZones);
  // Gauche légèrement en retrait et tournée de 15° ; écart pour deux silhouettes séparées.
  right.mesh.position.set(0.12, 0, 0.02);
  left.mesh.position.set(-0.12, 0, -0.05);
  left.mesh.rotation.y = THREE.MathUtils.degToRad(15);
  const group = new THREE.Group();
  group.add(right.mesh, left.mesh);
  const wasVisible = source.mesh?.visible ?? true;
  if (source.mesh) source.mesh.visible = false;
  // Masquer l’ombre de contact : elle relierait sinon les deux silhouettes.
  const grounds: THREE.Object3D[] = [];
  source.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShadowMaterial) {
      grounds.push(obj);
    }
  });
  const groundVis = grounds.map((g) => g.visible);
  for (const g of grounds) g.visible = false;
  source.scene.add(group);
  try {
    return await capturePng(
      source.renderer,
      source.scene,
      group,
      'trois-quarts',
      size,
      transparent ? null : background,
      false,
      source.beforeRender,
    );
  } finally {
    source.scene.remove(group);
    right.dispose();
    left.dispose();
    if (source.mesh) source.mesh.visible = wasVisible;
    grounds.forEach((g, i) => {
      g.visible = groundVis[i] ?? true;
    });
    source.redraw();
  }
}

async function renderView(
  source: ExportSource,
  viewId: ViewId,
  size: number,
  background: string,
  transparent: boolean,
): Promise<Blob> {
  if (!source.mesh) throw new Error('La chaussette n’est pas prête.');
  try {
    return await capturePng(
      source.renderer,
      source.scene,
      source.mesh,
      viewId,
      size,
      transparent ? null : background,
      source.mirrorView,
      source.beforeRender,
    );
  } finally {
    source.redraw();
  }
}

async function blobToRgba(blob: Blob, size: number): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, size, size).data;
}

function readableCells(aspect: number): { w: number; h: number } {
  const w = READABLE_SCALE;
  const h = Math.max(1, Math.round(READABLE_SCALE * aspect));
  return { w, h };
}

function labelForColor(
  color: string,
  labels?: Map<string, string> | Record<string, string>,
): string | null {
  if (!labels) return null;
  const key = color.toLowerCase();
  if (labels instanceof Map) return labels.get(key) ?? labels.get(color) ?? null;
  return labels[key] ?? labels[color] ?? null;
}

async function renderReadable(
  grid: StitchGrid,
  aspect: number,
  paletteLabels?: Map<string, string> | Record<string, string>,
): Promise<Blob> {
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
    const named = labelForColor(color, paletteLabels);
    const text = named
      ? `${named} · ${counts[index] ?? 0} mailles`
      : `${color} · ${counts[index] ?? 0} mailles`;
    context.fillText(text, marginLeft + 24, legendY + 8);
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
  const blob = await renderView(source, viewId, size, background, false);
  return blobToRgba(blob, size);
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
    const named = labelForColor(color, source.paletteLabels);
    const text = named
      ? `${named} · ${counts[index] ?? 0}`
      : `${color} · ${counts[index] ?? 0}`;
    context.fillText(text, gap + 24, legendY + 8);
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
  if (request.pair) {
    jobs.push({
      filename: exportFileName(source.modelName, source.sizeId, 'paire'),
      render: () => renderPair(source, request.size, request.background, request.transparent),
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
      render: () => renderReadable(source.grid, source.aspect, source.paletteLabels),
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
      render: () => renderBoard(source, request.transparent ? '#ecebe8' : request.background),
    });
  }
  if (jobs.length === 0) throw new Error('Cochez au moins une vue ou la paire.');
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    if (!job) continue;
    if (index > 0) await wait(DOWNLOAD_GAP_MS);
    downloadBlob(await job.render(), job.filename);
  }
}
