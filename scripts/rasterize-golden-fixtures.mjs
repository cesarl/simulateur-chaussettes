#!/usr/bin/env node
/**
 * Génère les PNG RGBA (filtre 0) des carreaux pour tests/fixtures/golden/ (T41).
 * Même règle de taille que src/io/tiles.ts : SVG → petit côté ≥ 512 px.
 * Usage : node scripts/rasterize-golden-fixtures.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tests/fixtures/golden');
const mini = path.join(root, 'tests/fixtures/configurateur-mini');
const SVG_MIN = 512;

// --- encodePng filtre 0 (copie minimale de src/io/pngCodec.ts) ---
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function encodePng(rgba, width, height) {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1);
    raw[start] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), start + 1);
  }
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stream = new CompressionStream('deflate');
  const output = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  const copy = new Uint8Array(new ArrayBuffer(raw.byteLength));
  copy.set(raw);
  await writer.write(copy);
  await writer.close();
  const compressed = new Uint8Array(await output);
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const size = parts.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

fs.mkdirSync(outDir, { recursive: true });

const syncOut = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-sync-'));
execFileSync(process.execPath, [path.join(root, 'scripts/sync-carreaux.mjs'), '--source', mini, '--out', syncOut], {
  encoding: 'utf8',
});
const cat = JSON.parse(fs.readFileSync(path.join(syncOut, 'catalogue.json'), 'utf8'));
const nuancier = new Map(cat.nuancier.map((c) => [c.id, c]));

function recolorSvg(svg, hexByZone) {
  const rules = Object.entries(hexByZone)
    .filter(([z, hex]) => /^zone-\d+$/.test(z) && /^#[0-9a-fA-F]{6}$/.test(hex))
    .map(([z, hex]) => `#${z},#${z} *{fill:${hex} !important}`)
    .join('');
  if (!rules) return svg;
  const style = `<style data-chaussettes="recoloration">${rules}</style>`;
  const i = svg.lastIndexOf('</svg>');
  return i < 0 ? svg : svg.slice(0, i) + style + svg.slice(i);
}

function zoneHex(colors) {
  const out = {};
  for (const [z, id] of Object.entries(colors)) {
    const c = nuancier.get(id);
    if (c) out[z] = c.hex;
  }
  return out;
}

async function pixelsFromDataUrl(page, dataUrl, minSide) {
  return page.evaluate(async ({ dataUrl, minSide }) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = dataUrl;
    });
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (minSide > 0) {
      const side = Math.min(w, h);
      if (side < minSide) {
        const scale = minSide / side;
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, rgba: Array.from(data) };
  }, { dataUrl, minSide });
}

async function writeRgbaPng(page, dataUrl, outPath, minSide = 0) {
  const { width, height, rgba } = await pixelsFromDataUrl(page, dataUrl, minSide);
  const png = await encodePng(new Uint8ClampedArray(rgba), width, height);
  fs.writeFileSync(outPath, png);
  console.log('écrit', path.relative(root, outPath), `${width}×${height}`);
}

async function rasterizeSvg(page, svgText, outPath) {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await writeRgbaPng(page, dataUrl, outPath, SVG_MIN);
}

async function rasterizeFile(page, filePath, outPath) {
  const bytes = fs.readFileSync(filePath);
  if (filePath.toLowerCase().endsWith('.svg')) {
    await rasterizeSvg(page, bytes.toString('utf8'), outPath);
    return;
  }
  const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
  await writeRgbaPng(page, dataUrl, outPath, 0);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const fixtures = path.join(root, 'public/fixtures');
await rasterizeFile(page, path.join(fixtures, 'carreau-test-damier.png'), path.join(outDir, 'exemple-damier.png'));
await rasterizeFile(page, path.join(fixtures, 'carreau-test-etoile.svg'), path.join(outDir, 'exemple-etoile.png'));
await rasterizeFile(page, path.join(fixtures, 'carreau-test-quart.svg'), path.join(outDir, 'exemple-quart.png'));

const medina = cat.collections.find((c) => c.id === 'medina');
const medinaHex = zoneHex(medina.couleursParDefaut);
for (const v of medina.variations) {
  const raw = fs.readFileSync(path.join(syncOut, v.file), 'utf8');
  await rasterizeSvg(page, recolorSvg(raw, medinaHex), path.join(outDir, `medina-${v.name}.png`));
}

const lianes = cat.collections.find((c) => c.id === 'lianes');
const reco1 = { ...lianes.couleursParDefaut, ...lianes.recommandations[0] };
const lianesHex = zoneHex(reco1);
for (const v of lianes.variations) {
  const raw = fs.readFileSync(path.join(syncOut, v.file), 'utf8');
  await rasterizeSvg(page, recolorSvg(raw, lianesHex), path.join(outDir, `lianes-reco1-${v.name}.png`));
}

await browser.close();
fs.rmSync(syncOut, { recursive: true, force: true });
console.log('OK', outDir);
