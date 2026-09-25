import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('galerie : 75+11 avec filtre tous ; rosace change la grille ; reroll aléatoire seulement', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  await page.getByTestId('calep-filter').selectOption('tous');
  await expect(page.getByTestId('calep-gallery')).toBeVisible();
  const thumbs = page.locator('[data-testid^="calep-thumb-"]');
  await expect(thumbs).toHaveCount(86); // 75 + 11

  const hashBefore = await page.evaluate(() => window.__SIM__!.gridHash);
  const id0 = await page.evaluate(() => window.__SIM__!.computeId);
  await page.evaluate(() => window.__SIM__?.loadFixture('carreau-test-quart.svg'));
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, id0);

  await page.getByTestId('calep-thumb-rosace').click();
  await page.waitForFunction((h) => window.__SIM__?.gridHash !== h, hashBefore);
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.presetId === 'rosace');

  // ramo : pas aléatoire → reroll ne change pas
  await page.getByTestId('calep-thumb-ramo').click();
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.presetId === 'ramo');
  await expect(page.getByTestId('calep-reroll')).toBeHidden();

  // aléatoire : reroll change
  await page.getByTestId('calep-thumb-aleatoire').click();
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.presetId === 'aleatoire');
  await expect(page.getByTestId('calep-reroll')).toBeVisible();
  const hashA = await page.evaluate(() => window.__SIM__!.gridHash);
  const seedA = await page.evaluate(() => window.__SIM__!.design.layout.calepinage.graine);
  await page.getByTestId('calep-reroll').click();
  await page.waitForFunction((s) => (window.__SIM__?.design.layout.calepinage.graine ?? 0) > s, seedA);
  await page.waitForFunction((h) => window.__SIM__?.gridHash !== h, hashA);

  mkdirSync('test-results', { recursive: true });
  await page.getByTestId('calep-gallery').screenshot({ path: 'test-results/visuel-T26-galerie.png' });
  expect(errors).toEqual([]);
});

test('filtre ≤ : damier_16 masqué avec 2 carreaux, damier_2 visible', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  for (const name of ['carreau-test-etoile.svg', 'carreau-test-quart.svg']) {
    const id = await page.evaluate(() => window.__SIM__!.computeId);
    await page.evaluate((n) => window.__SIM__?.loadFixture(n), name);
    await page.waitForFunction((c) => (window.__SIM__?.computeId ?? 0) > c, id);
  }
  await expect(page.getByTestId('tile-thumb')).toHaveCount(2);

  await page.getByTestId('calep-filter').selectOption('le');
  await expect(page.getByTestId('calep-thumb-damier_2')).toBeVisible();
  await expect(page.getByTestId('calep-thumb-damier_16')).toHaveCount(0);
  expect(errors).toEqual([]);
});
