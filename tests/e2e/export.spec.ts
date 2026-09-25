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

test('les exports face et plat exact ont la bonne taille et les bonnes couleurs', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);
  await page.getByTestId('export-size').selectOption('1024');

  const faceEvent = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const face = await faceEvent;
  expect(face.suggestedFilename()).toBe('modele_homme_face.png');
  await face.saveAs('test-results/visuel-t10-face.png');
  const faceBytes = readFileSync('test-results/visuel-t10-face.png');
  expect([...faceBytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
  expect(pngSize(faceBytes)).toEqual({ width: 1024, height: 1024 });

  await page.getByTestId('export-face').uncheck();
  await page.getByTestId('export-plat-exact').check();
  const flatEvent = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const flat = await flatEvent;
  expect(flat.suggestedFilename()).toBe('modele_homme_plat-exact.png');
  await flat.saveAs('test-results/visuel-t10-plat-exact.png');
  const flatBytes = readFileSync('test-results/visuel-t10-plat-exact.png');
  const expected = await page.evaluate(() => ({
    width: window.__SIM__?.grid.width ?? 0,
    height: window.__SIM__?.grid.height ?? 0,
    palette: window.__SIM__?.grid.palette.length ?? 0,
  }));
  expect(pngSize(flatBytes)).toEqual({ width: expected.width, height: expected.height });

  const counted = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return -1;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let index = 0; index < pixels.length; index += 4) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    }
    return colors.size;
  }, flatBytes.toString('base64'));
  expect(counted).toBeGreaterThan(0);
  expect(counted).toBeLessThanOrEqual(expected.palette);

  expect(errors).toEqual([]);
});
