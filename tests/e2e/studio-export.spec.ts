import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('export studio : trois-quarts 2048, transparent, vue inchangée', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  const before = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sock-canvas"]');
    return {
      w: canvas?.width ?? 0,
      h: canvas?.height ?? 0,
      cam: window.__SIM__?.cameraPosition,
      target: window.__SIM__?.cameraTarget,
    };
  });

  await page.getByTestId('tab-export').click();
  await page.getByTestId('export-face').uncheck();
  await page.getByTestId('export-trois-quarts').check();
  await page.getByTestId('export-size').selectOption('2048');

  const tqEvent = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const tq = await tqEvent;
  expect(tq.suggestedFilename()).toBe('modele_homme_trois-quarts.png');
  await tq.saveAs('test-results/visuel-t20-trois-quarts.png');
  const tqBytes = readFileSync('test-results/visuel-t20-trois-quarts.png');
  expect(pngSize(tqBytes)).toEqual({ width: 2048, height: 2048 });

  await page.getByTestId('export-transparent').check();
  const trEvent = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const tr = await trEvent;
  await tr.saveAs('test-results/visuel-t20-transparent.png');
  const trBytes = readFileSync('test-results/visuel-t20-transparent.png');
  expect(pngSize(trBytes)).toEqual({ width: 2048, height: 2048 });

  const cornerAlpha = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return -1;
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3] ?? -1;
  }, trBytes.toString('base64'));
  expect(cornerAlpha).toBe(0);

  const after = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sock-canvas"]');
    return {
      w: canvas?.width ?? 0,
      h: canvas?.height ?? 0,
      cam: window.__SIM__?.cameraPosition,
      target: window.__SIM__?.cameraTarget,
    };
  });
  expect(after.w).toBe(before.w);
  expect(after.h).toBe(before.h);
  expect(after.cam).toEqual(before.cam);
  expect(after.target).toEqual(before.target);

  expect(errors).toEqual([]);
});
