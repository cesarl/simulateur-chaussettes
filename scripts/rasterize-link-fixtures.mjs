#!/usr/bin/env node
/**
 * V7 — PNG des carreaux des deux liens réels de César (tests/fixtures/liens/), recolorés avec les
 * couleurs du lien, même règle que src/io/tiles.ts (SVG → petit côté ≥ 512 px).
 * Usage : node scripts/rasterize-link-fixtures.mjs   (ne pas régénérer sans raison)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tests/fixtures/liens');
const SVG_MIN = 512;

// Couleurs des liens (codes nuancier → hex, relevés dans public/carreaux/catalogue.json)
const JOBS = [
  { prefix: 'JARDIN-D-DAZUR', vars: ['VAR1', 'VAR2', 'VAR3'], hex: { 'zone-1': '#f7f7f7', 'zone-2': '#4368b1' } },
  { prefix: 'PALM-BEACH', vars: ['VAR1', 'VAR2'], hex: { 'zone-1': '#f3b0b0', 'zone-2': '#e67641' } },
];

// PNG RGBA filtre 0 (le seul que lit src/io/pngCodec.ts)
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.subarray(y * w * 4, (y + 1) * w * 4)).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function recolorSvg(svg, hexByZone) {
  const rules = Object.entries(hexByZone).map(([z, hex]) => `#${z},#${z} *{fill:${hex} !important}`).join('');
  const style = `<style data-chaussettes="recoloration">${rules}</style>`;
  const i = svg.lastIndexOf('</svg>');
  return i < 0 ? svg : svg.slice(0, i) + style + svg.slice(i);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const job of JOBS) {
  for (const v of job.vars) {
    const svg = recolorSvg(fs.readFileSync(path.join(dir, `${job.prefix}-${v}.svg`), 'utf8'), job.hex);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const px = await page.evaluate(async ({ dataUrl, minSide }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('illisible')); img.src = dataUrl; });
      let w = img.naturalWidth, h = img.naturalHeight;
      const side = Math.min(w, h);
      if (side < minSide) { const s = minSide / side; w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return { w, h, rgba: Array.from(c.getContext('2d').getImageData(0, 0, w, h).data) };
    }, { dataUrl, minSide: SVG_MIN });
    const out = path.join(dir, `${job.prefix.toLowerCase()}-${v}.png`);
    fs.writeFileSync(out, encodePng(Uint8Array.from(px.rgba), px.w, px.h));
    console.log('écrit', path.relative(root, out));
  }
}
await browser.close();
