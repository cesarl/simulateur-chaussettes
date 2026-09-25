import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function waitDecorReady(page: Page, mode = 'coin'): Promise<void> {
  // Génération différée (idle) + textures lourdes en CI SwiftShader.
  await page.waitForFunction((m) => window.__SIM__?.design.decor.mode === m, mode);
  await page.waitForTimeout(2500);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function captureView(page: Page, view: 'trois-quarts' | 'dos', size: number, path: string): Promise<Buffer> {
  await page.evaluate(
    async ({ v, s }) => {
      const dataUrl = await window.__SIM__!.captureView(v, s, '#ecebe8');
      (window as unknown as { __cap?: string }).__cap = dataUrl;
    },
    { v: view, s: size },
  );
  const dataUrl = await page.evaluate(() => (window as unknown as { __cap?: string }).__cap ?? '');
  expect(dataUrl.startsWith('data:image/png')).toBe(true);
  const buf = Buffer.from(dataUrl.split(',')[1]!, 'base64');
  fs.writeFileSync(path, buf);
  return buf;
}

test('décor sol+mur : couleurs hors silhouette ; mur derrière en vue dos', async ({ page }) => {
  // CI : captureView + décor peut dépasser 60 s (SwiftShader).
  test.setTimeout(180_000);
  page.setDefaultTimeout(120_000);
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.waitForFunction(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0);

  await page.getByTestId('coll-search').fill('medina');
  await page.getByTestId('coll-item-medina').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(4, { timeout: 15000 });

  await page.getByTestId('ctl-decor-mode').selectOption('coin');
  await waitDecorReady(page, 'coin');

  const three = await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T38-medina-coin.png');
  expect(three.byteLength).toBeGreaterThan(30_000);

  // Analyse dans la page : pixels hors boîte centrale vs palette collection
  const analysis = await page.evaluate(async () => {
    const dataUrl = (window as unknown as { __cap?: string }).__cap!;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('img'));
      img.src = dataUrl;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const isBg = (i: number) => {
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      return Math.abs(r - 236) < 12 && Math.abs(g - 235) < 12 && Math.abs(b - 232) < 12;
    };
    // Coins : hors silhouette typique
    const corners = [
      [8, 8],
      [width - 9, 8],
      [8, height - 9],
      [width - 9, height - 9],
      [Math.floor(width * 0.15), Math.floor(height * 0.75)],
      [Math.floor(width * 0.85), Math.floor(height * 0.75)],
    ] as const;
    let nonBgCorners = 0;
    for (const [x, y] of corners) {
      const i = (y * width + x) * 4;
      if (!isBg(i)) nonBgCorners += 1;
    }
    // Centre = chaussette (vue dos plus bas)
    return { nonBgCorners, width, height };
  });
  expect(analysis.nonBgCorners).toBeGreaterThanOrEqual(2);

  await captureView(page, 'dos', 1024, 'test-results/visuel-T38-medina-dos.png');
  const centerIsSock = await page.evaluate(async () => {
    const dataUrl = (window as unknown as { __cap?: string }).__cap!;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('img'));
      img.src = dataUrl;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height * 0.45);
    const i = (cy * width + cx) * 4;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    // Pas le gris studio, et pas un beige trop clair de joint — motif / maille
    const isBg = Math.abs(r - 236) < 12 && Math.abs(g - 235) < 12 && Math.abs(b - 232) < 12;
    return { r, g, b, isBg };
  });
  expect(centerIsSock.isBg).toBe(false);

  // Captures sol / mur / coin Lianes
  await page.getByTestId('ctl-decor-mode').selectOption('sol');
  await waitDecorReady(page, 'sol');
  await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T38-medina-sol.png');

  await page.getByTestId('ctl-decor-mode').selectOption('mur');
  await waitDecorReady(page, 'mur');
  await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T38-medina-mur.png');

  await page.getByTestId('coll-search').fill('lianes');
  await page.getByTestId('coll-item-lianes').scrollIntoViewIfNeeded();
  await page.getByTestId('coll-item-lianes').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(2, { timeout: 15000 });
  await page.getByTestId('ctl-decor-mode').selectOption('coin');
  await waitDecorReady(page, 'coin');
  await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T38-lianes-coin.png');

  expect(errors).toEqual([]);
});
