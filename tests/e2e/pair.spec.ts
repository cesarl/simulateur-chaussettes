import { writeFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('export paire 2048 : deux silhouettes distinctes', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  const result = await page.evaluate(async () => {
    const capture = window.__SIM__?.capturePair;
    if (!capture) throw new Error('capturePair absent');
    const dataUrl = await capture(2048, '#ecebe8');
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bg: [number, number, number] = [0xec, 0xeb, 0xe8];
    const tol = 6;
    const mask = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      const dr = Math.abs((data[p] ?? 0) - bg[0]);
      const dg = Math.abs((data[p + 1] ?? 0) - bg[1]);
      const db = Math.abs((data[p + 2] ?? 0) - bg[2]);
      mask[i] = dr > tol || dg > tol || db > tol ? 1 : 0;
    }
    const seen = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    let count = 0;
    const minArea = Math.floor(width * height * 0.005);
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || seen[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      let area = 0;
      while (head < tail) {
        const i = queue[head++]!;
        area += 1;
        const x = i % width;
        const y = Math.floor(i / width);
        for (const n of [i - 1, i + 1, i - width, i + width]) {
          if (n < 0 || n >= mask.length) continue;
          const nx = n % width;
          const ny = Math.floor(n / width);
          if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
          if (!mask[n] || seen[n]) continue;
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
      if (area >= minArea) count += 1;
    }
    return { count, width, height, dataUrl };
  });

  expect(result.width).toBe(2048);
  expect(result.height).toBe(2048);
  expect(result.count).toBeGreaterThanOrEqual(2);

  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/visuel-T22-paire.png`, Buffer.from(result.dataUrl.split(',')[1] ?? '', 'base64'));

  expect(errors).toEqual([]);
});
