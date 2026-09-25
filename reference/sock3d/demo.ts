/**
 * Démo autonome du module de référence (npm run dev → /sock-demo.html).
 * Fabrique une grille de mailles simple à partir d'un carreau d'exemple, sans passer par l'appli.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSockObject, type SockObject } from './sockObject';
import { capturePng, createStudio, frameView, type ViewName } from './studio';
import type { GridLike } from './sockAtlas';
import type { SockShapeInput } from './sockShape';

const SIZES = {
  homme: { needles: 168, cuffRows: 30, legRows: 180, heelRows: 56, footRows: 200, toeRows: 50 },
  femme: { needles: 144, cuffRows: 28, legRows: 160, heelRows: 48, footRows: 170, toeRows: 44 },
};
const PALETTES: Record<string, { tile: string[]; cuff: string; heel: string; toe: string }> = {
  'carreau-test-etoile.svg': { tile: ['#f1e9dc', '#1f3a5f', '#c0392b'], cuff: '#1f3a5f', heel: '#c0392b', toe: '#c0392b' },
  'carreau-test-quart.svg': { tile: ['#f1e9dc', '#2e6b4f', '#d9a441'], cuff: '#2e6b4f', heel: '#d9a441', toe: '#d9a441' },
  'carreau-test-damier.png': { tile: ['#f1e9dc', '#1d1d1b', '#b5462f'], cuff: '#1d1d1b', heel: '#b5462f', toe: '#b5462f' },
};

async function loadTile(url: string, px = 256): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, px, px);
  return ctx.getImageData(0, 0, px, px);
}

function hex(h: string) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;
}

function makeGrid(tile: ImageData, size: keyof typeof SIZES, cuff: boolean, pal: (typeof PALETTES)[string]): GridLike {
  const d = SIZES[size];
  const W = d.needles;
  const cuffRows = cuff ? d.cuffRows : 0;
  const H = cuffRows + d.legRows + d.heelRows + d.footRows + d.toeRows;
  const palette = [...pal.tile, pal.cuff, pal.heel, pal.toe];
  const rgbs = pal.tile.map(hex);
  const colorIndex = new Uint8Array(W * H);
  const tw = W / 6; // 6 carreaux sur le tour : raccord juste
  const th = Math.round(tw / 0.75);
  let patternRow = 0;
  for (let r = 0; r < H; r++) {
    const zone = r < cuffRows ? 'c' : r < cuffRows + d.legRows ? 'l' : r < cuffRows + d.legRows + d.heelRows ? 'h' : r < H - d.toeRows ? 'f' : 't';
    for (let c = 0; c < W; c++) {
      let idx: number;
      if (zone === 'c') idx = pal.tile.length;
      else if (zone === 'h') idx = pal.tile.length + 1;
      else if (zone === 't') idx = pal.tile.length + 2;
      else {
        const ty = patternRow % th;
        const brick = Math.floor(patternRow / th) % 2 ? tw / 2 : 0; // quinconce
        const tx = (c + brick) % tw;
        const px = Math.floor(((tx + 0.5) / tw) * tile.width);
        const py = Math.floor(((ty + 0.5) / th) * tile.height);
        const o = (py * tile.width + px) * 4;
        let best = 0, bd = Infinity;
        rgbs.forEach((p, i) => {
          const dd = (p[0] - tile.data[o]!) ** 2 + (p[1] - tile.data[o + 1]!) ** 2 + (p[2] - tile.data[o + 2]!) ** 2;
          if (dd < bd) { bd = dd; best = i; }
        });
        idx = best;
      }
      colorIndex[r * W + c] = idx;
    }
    if (zone === 'l' || zone === 'f') patternRow++;
  }
  return { width: W, height: H, palette, colorIndex };
}

const host = document.getElementById('v')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
createStudio(renderer, scene);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
let sock: SockObject | null = null;

function resize() {
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const sel = (id: string) => document.getElementById(id) as HTMLSelectElement & HTMLInputElement;

async function rebuild() {
  const size = sel('size').value as keyof typeof SIZES;
  const file = sel('tile').value;
  const cuff = sel('cuff').checked;
  const pal = PALETTES[file]!;
  const tile = await loadTile(`/fixtures/${file}`);
  const grid = makeGrid(tile, size, cuff, pal);
  const d = SIZES[size];
  const shape: SockShapeInput = { ...d, cuffRows: cuff ? d.cuffRows : 0, rowsPerCm: 10, size };
  if (sock) { scene.remove(sock.mesh); sock.dispose(); }
  sock = createSockObject(shape, grid, { heel: pal.heel, toe: pal.toe });
  scene.add(sock.mesh);
  const c = frameView(camera, sock.mesh, 'trois-quarts');
  controls.target.copy(c);
  controls.update();
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    if (!sock) return;
    const c = frameView(camera, sock.mesh, b.dataset.view as ViewName);
    controls.target.copy(c);
    controls.update();
  }),
);
['size', 'tile', 'cuff'].forEach((id) => sel(id).addEventListener('change', rebuild));

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

declare global {
  interface Window { __DEMO__?: { ready: boolean; capture: (v: ViewName, size: number) => Promise<string>; set: (o: { size?: string; tile?: string; cuff?: boolean }) => Promise<void> } }
}
await rebuild();
window.__DEMO__ = {
  ready: true,
  async capture(view, size) {
    const blob = await capturePng(renderer, scene, sock!.mesh, view, size);
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
  },
  async set(o) {
    if (o.size) sel('size').value = o.size;
    if (o.tile) sel('tile').value = o.tile;
    if (o.cuff !== undefined) sel('cuff').checked = o.cuff;
    await rebuild();
  },
};
