import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';

/**
 * Captures bilan V5 : visionneuse, lien, décor Medina / Lianes.
 */
test('T39 captures bilan V5', async ({ page }) => {
  // CI SwiftShader : décor + captureView peuvent dépasser 60 s.
  test.setTimeout(180_000);
  page.setDefaultTimeout(120_000);

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('simulateur-chaussettes:dev');
    } catch {
      /* ignore */
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page.getByTestId('viewer-bar')).toBeVisible();
  await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-T39-visionneuse.png' });

  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeVisible();
  await page.waitForFunction(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0);

  await page.getByTestId('coll-search').fill('medina');
  await page.getByTestId('coll-item-medina').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(4, { timeout: 15_000 });

  const beforeDecor = await page.evaluate(() => window.__SIM__?.decorBuildId ?? 0);
  await page.getByTestId('ctl-decor-mode').selectOption('coin');
  await page.waitForFunction(() => window.__SIM__?.design.decor.mode === 'coin');
  await page.waitForFunction((b) => (window.__SIM__?.decorBuildId ?? 0) > b, beforeDecor, {
    timeout: 90_000,
  });
  await page.evaluate(
    () =>
      new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );

  const medina = await page.evaluate(async () => {
    return window.__SIM__!.captureView('trois-quarts', 1024, '#ecebe8');
  });
  expect(medina.startsWith('data:image/png')).toBe(true);
  fs.writeFileSync('test-results/visuel-T39-medina-decor.png', Buffer.from(medina.split(',')[1]!, 'base64'));

  const beforeLianes = await page.evaluate(() => window.__SIM__?.decorBuildId ?? 0);
  await page.getByTestId('coll-search').fill('lianes');
  await page.getByTestId('coll-item-lianes').scrollIntoViewIfNeeded();
  await page.getByTestId('coll-item-lianes').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(2, { timeout: 15_000 });
  await page.waitForFunction((b) => (window.__SIM__?.decorBuildId ?? 0) > b, beforeLianes, {
    timeout: 90_000,
  });
  await page.evaluate(
    () =>
      new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  const lianes = await page.evaluate(async () => {
    return window.__SIM__!.captureView('trois-quarts', 1024, '#ecebe8');
  });
  fs.writeFileSync('test-results/visuel-T39-lianes-decor.png', Buffer.from(lianes.split(',')[1]!, 'base64'));

  await page.getByTestId('panel-copy-link').click();
  await expect(page.getByTestId('share-hint')).toBeVisible({ timeout: 5_000 });
});
