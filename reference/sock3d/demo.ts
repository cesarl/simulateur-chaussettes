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
import { DEFAULT_CALEPINAGE, GENERATED_PRESETS, normalizePresets, type CalepinageSpec } from '../calepinage/calepinage';
import { samplePattern } from '../calepinage/sampler';
import rawPresets from '../calepinage/calepinages.json';

const { presets: PRESETS } = normalizePresets(rawPresets);
const ALL_TILES = ['carreau-test-etoile.svg', 'carreau-test-quart.svg', 'carreau-test-damier.png'];
const MULTI_PAL = { tile: ['#f1e9dc', '#1f3a5f', '#c0392b', '#2e6b4f', '#d9a441', '#1d1d1b'], cuff: '#1f3a5f', heel: '#c0392b', toe: '#c0392b' };

/** Grille multi-motifs via le moteur de calepinage de référence. */
function makeMultiGrid(tiles: ImageData[], choice: string, size: keyof typeof SIZES, cuff: boolean): GridLike {
  const d = SIZES[size];
  const W = d.needles;
  const cuffRows = cuff ? d.cuffRows : 0;
  const H = cuffRows + d.legRows + d.heelRows + d.footRows + d.toeRows;
  let spec: CalepinageSpec = { ...DEFAULT_CALEPINAGE, graine: 3 };
  let preset = null;
  let use = tiles;
  if (choice.startsWith('p:')) {
    preset = PRESETS.find((p) => p.id === choice.slice(2)) ?? null;
    spec = { ...spec, source: 'prereglage', presetId: preset?.id ?? null };
    if (choice === 'p:rosace') use = [tiles[1]!];
  } else {
    const g = GENERATED_PRESETS.find((x) => x.id === choice)!;
    spec = { ...spec, genere: g.genere, appareil: g.appareil ?? 'droit' };
  }
  const tw = W / 6;
  const geo = { needles: W, tileStitches: tw, tileRows: Math.round(tw / 0.75), gapStitches: 0, gapRows: 0, offsetStitches: 0, offsetRows: 0, appareil: spec.appareil };
  const rows = d.legRows + d.footRows;
  const rgb = samplePattern(use.map((t) => ({ width: t.width, height: t.height, rgba: t.data })), spec, geo, preset, { rows, gapColor: [241, 233, 220], sampling: 'majoritaire' });
  const palette = [...MULTI_PAL.tile, MULTI_PAL.cuff, MULTI_PAL.heel, MULTI_PAL.toe];
  const pr = MULTI_PAL.tile.map(hex);
  const nearest = (o: number) => {
    let best = 0, bd = Infinity;
    pr.forEach((p, i) => { const dd = (p[0] - rgb[o]!) ** 2 + (p[1] - rgb[o + 1]!) ** 2 + (p[2] - rgb[o + 2]!) ** 2; if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  const colorIndex = new Uint8Array(W * H);
  let pRow = 0;
  for (let r = 0; r < H; r++) {
    const zone = r < cuffRows ? 'c' : r < cuffRows + d.legRows ? 'l' : r < cuffRows + d.legRows + d.heelRows ? 'h' : r < H - d.toeRows ? 'f' : 't';
    for (let c = 0; c < W; c++) {
      colorIndex[r * W + c] = zone === 'c' ? 6 : zone === 'h' ? 7 : zone === 't' ? 8 : nearest((pRow * W + c) * 3);
    }
    if (zone === 'l' || zone === 'f') pRow++;
  }
  return { width: W, height: H, palette, colorIndex };
}

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
  const choice = sel('calep').value;
  let pal = PALETTES[file]!;
  let grid: GridLike;
  if (choice) {
    pal = MULTI_PAL;
    const tiles = await Promise.all(ALL_TILES.map((f) => loadTile(`/fixtures/${f}`)));
    grid = makeMultiGrid(tiles, choice, size, cuff);
  } else {
    const tile = await loadTile(`/fixtures/${file}`);
    grid = makeGrid(tile, size, cuff, pal);
  }
  const d = SIZES[size];
  const heelHeight = +sel('heelH').value;
  const heelDepth = +sel('heelD').value;
  const heelSpread = +sel('heelS').value / 100;
  document.getElementById('heelHv')!.textContent = String(heelHeight);
  document.getElementById('heelDv')!.textContent = String(heelDepth);
  document.getElementById('heelSv')!.textContent = String(Math.round(heelSpread * 100));
  const shape: SockShapeInput = { ...d, cuffRows: cuff ? d.cuffRows : 0, rowsPerCm: 10, size, heelHeight, heelDepth, heelSpread };
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
['size', 'tile', 'cuff', 'heelH', 'heelD', 'heelS', 'calep'].forEach((id) => sel(id).addEventListener('change', rebuild));

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

declare global {
  interface Window { __DEMO__?: { ready: boolean; capture: (v: ViewName, size: number) => Promise<string>; set: (o: { calep?: string; size?: string; tile?: string; cuff?: boolean; heelH?: number; heelD?: number; heelS?: number }) => Promise<void> } }
}
await rebuild();
window.__DEMO__ = {
  ready: true,
  async capture(view, size) {
    const blob = await capturePng(renderer, scene, sock!.mesh, view, size);
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
  },
  async set(o) {
    if (o.calep !== undefined) sel('calep').value = o.calep;
    if (o.size) sel('size').value = o.size;
    if (o.tile) sel('tile').value = o.tile;
    if (o.cuff !== undefined) sel('cuff').checked = o.cuff;
    if (o.heelH !== undefined) sel('heelH').value = String(o.heelH);
    if (o.heelD !== undefined) sel('heelD').value = String(o.heelD);
    if (o.heelS !== undefined) sel('heelS').value = String(o.heelS);
    await rebuild();
  },
};
