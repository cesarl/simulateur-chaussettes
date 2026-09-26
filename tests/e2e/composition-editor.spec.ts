/**
 * T46 — mode composition : bibliothèque → flèche ×10 → empreinte change ; supprimer → fond.
 */
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('composition : ajouter, déplacer, supprimer change la grille', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  await page.getByTestId('mode-composition').click();
  await expect(page.getByTestId('comp-editor')).toBeVisible();

  await page.getByTestId('comp-add-library').click();
  const first = page.locator('[data-testid^="comp-lib-"]').first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  const before = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  await first.click();
  await page.waitForFunction((prev) => window.__SIM__?.gridHash !== prev, before);

  const afterAdd = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(afterAdd).not.toBe(before);

  // Sélection via panneau calques (plus fiable que le hit-test canvas avant chargement image)
  const layerRow = page.locator('[data-testid^="comp-layer-"]').first();
  await expect(layerRow).toBeVisible();
  await layerRow.click();
  await page.getByTestId('comp-canvas').focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await page.waitForFunction((prev) => window.__SIM__?.gridHash !== prev, afterAdd, {
    timeout: 15_000,
  });
  const afterMove = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(afterMove).not.toBe(afterAdd);

  await page.keyboard.press('Delete');
  await page.waitForFunction((prev) => window.__SIM__?.gridHash !== prev, afterMove, {
    timeout: 15_000,
  });
  const afterDel = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  // Fond seul : proche de l’état initial composition vide
  expect(afterDel).not.toBe(afterMove);

  await page.screenshot({ path: 'test-results/visuel-t46-composition.png', fullPage: true });
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});
