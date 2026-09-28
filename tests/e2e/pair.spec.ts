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

test('export paire 2048 (4:5) : une de face, une de profil', async ({ page }) => {
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
    // Silhouette de la paire : boîte englobante, et où tombent la pointe de face (la plus basse)
    // et la pointe de profil (la plus à droite).
    let minX = width, maxX = -1, minY = height, maxY = -1, lowX = 0, rightY = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      if (x < minX) minX = x;
      if (x > maxX) { maxX = x; rightY = y; }
      if (y < minY) minY = y;
      if (y > maxY) { maxY = y; lowX = x; }
    }
    return { width, height, minX, maxX, minY, maxY, lowX, rightY, dataUrl };
  });

  expect(result.width).toBe(1638); // 4:5
  expect(result.height).toBe(2048);
  // Pose V10 : une chaussette de face (pointe vers l'objectif, en bas à gauche), l'autre de profil
  // (pointe vers la droite), environ 80° entre les deux pieds.
  expect(result.maxX - result.minX).toBeGreaterThan(result.width * 0.55);
  expect(result.maxY - result.minY).toBeGreaterThan(result.height * 0.5);
  expect(result.lowX).toBeLessThan(result.width / 2); // pointe de face à gauche, au premier plan
  expect(result.rightY).toBeLessThan(result.maxY); // pointe de profil plus haut (en retrait)

  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/visuel-T22-paire.png`, Buffer.from(result.dataUrl.split(',')[1] ?? '', 'base64'));

  expect(errors).toEqual([]);
});
