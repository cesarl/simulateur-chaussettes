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

async function waitDecorBuild(page: Page, mode: string): Promise<void> {
  const before = await page.evaluate(() => window.__SIM__?.decorBuildId ?? 0);
  await page.waitForFunction((m) => window.__SIM__?.design.decor.mode === m, mode);
  await page.waitForFunction((b) => (window.__SIM__?.decorBuildId ?? 0) > b, before, {
    timeout: 90_000,
  });
}

async function captureView(page: Page, path: string): Promise<void> {
  await page.evaluate(async () => {
    const dataUrl = await window.__SIM__!.captureView('trois-quarts', 1024, '#ecebe8');
    (window as unknown as { __cap?: string }).__cap = dataUrl;
  });
  const dataUrl = await page.evaluate(() => (window as unknown as { __cap?: string }).__cap ?? '');
  expect(dataUrl.startsWith('data:image/png')).toBe(true);
  fs.writeFileSync(path, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

test('visionneuse publique : bascule décor on/off', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('simulateur-chaussettes:dev');
    } catch {
      /* ignore */
    }
  });

  // Prépare Medina + décor coin en ?dev, puis quitte le mode dev
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.waitForFunction(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0);
  await page.getByTestId('coll-search').fill('medina');
  await page.getByTestId('coll-item-medina').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(4, { timeout: 15000 });
  await page.getByTestId('tab-decor').click();
  await page.getByTestId('ctl-decor-mode').selectOption('coin');
  await waitDecorBuild(page, 'coin');
  await page.getByTestId('tab-global').click();
  await page.getByTestId('leave-dev').click();

  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page.getByTestId('viewer-bar')).toBeVisible();
  await expect(page.getByTestId('viewer-decor-toggle')).toBeVisible();
  await expect(page.getByTestId('viewer-decor-toggle')).toBeChecked();

  await captureView(page, 'test-results/visuel-fix-decor-toggle-on.png');

  // Décoche → décor off
  await page.getByTestId('viewer-decor-toggle').uncheck();
  await waitDecorBuild(page, 'aucun');
  expect(await page.evaluate(() => window.__SIM__!.design.decor.mode)).toBe('aucun');
  await captureView(page, 'test-results/visuel-fix-decor-toggle-off.png');

  // Recoche → retrouve coin
  await page.getByTestId('viewer-decor-toggle').check();
  await waitDecorBuild(page, 'coin');
  expect(await page.evaluate(() => window.__SIM__!.design.decor.mode)).toBe('coin');

  // Persistance via état design (share / IndexedDB) : le mode est dans design.decor
  const modeInDesign = await page.evaluate(() => window.__SIM__!.design.decor.mode);
  expect(modeInDesign).toBe('coin');

  expect(errors).toEqual([]);
});
