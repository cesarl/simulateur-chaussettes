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

async function captureView(
  page: Page,
  view: 'trois-quarts' | 'dos',
  size: number,
  path: string,
): Promise<Buffer> {
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

test('décor v2 mats : Medina 20cm et RAMO 10cm (sol + mur)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.waitForFunction(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0);

  // Medina 20 × 20
  await page.getByTestId('coll-search').fill('medina');
  await page.getByTestId('coll-item-medina').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(4, { timeout: 15000 });

  await page.getByTestId('tab-decor').click();
  await page.getByTestId('ctl-decor-mode').selectOption('sol');
  await waitDecorBuild(page, 'sol');
  const medinaSol = await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T40-medina-sol.png');
  expect(medinaSol.byteLength).toBeGreaterThan(30_000);

  await page.getByTestId('ctl-decor-mode').selectOption('mur');
  await waitDecorBuild(page, 'mur');
  await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T40-medina-mur.png');

  // Vérifie défauts v2 : joint clair, atténuation 0, grain > 0, tileCm 20
  const medinaDefaults = await page.evaluate(() => {
    const d = window.__SIM__!.design.decor;
    return {
      tileCm: d.tileCm,
      groutMm: d.groutMm,
      groutColor: d.groutColor,
      attenuation: d.attenuation,
      grainStrength: d.grainStrength,
    };
  });
  expect(medinaDefaults.tileCm).toBe(20);
  expect(medinaDefaults.groutMm).toBeLessThanOrEqual(2);
  expect(medinaDefaults.attenuation).toBe(0);
  expect(medinaDefaults.grainStrength).toBeGreaterThan(0);
  expect(medinaDefaults.groutColor.toLowerCase()).toBe('#f3f1ec');

  // RAMO 10 × 10
  await page.getByTestId('tab-calque').click();
  await page.getByTestId('coll-search').fill('ramo');
  await page.getByTestId('coll-item-RAMO').scrollIntoViewIfNeeded();
  await page.getByTestId('coll-item-RAMO').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(8, { timeout: 15000 });

  // Réactiver le décor pour préremplir tileCm depuis le format
  await page.getByTestId('tab-decor').click();
  await page.getByTestId('ctl-decor-mode').selectOption('aucun');
  await waitDecorBuild(page, 'aucun');
  await page.getByTestId('ctl-decor-mode').selectOption('sol');
  await waitDecorBuild(page, 'sol');

  const ramoTileCm = await page.evaluate(() => window.__SIM__!.design.decor.tileCm);
  expect(ramoTileCm).toBe(10);

  await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T40-ramo-sol.png');

  await page.getByTestId('ctl-decor-mode').selectOption('mur');
  await waitDecorBuild(page, 'mur');
  await captureView(page, 'trois-quarts', 1024, 'test-results/visuel-T40-ramo-mur.png');

  // Grain UI présent
  await expect(page.getByTestId('ctl-decor-grain')).toBeVisible();

  expect(errors).toEqual([]);
});
