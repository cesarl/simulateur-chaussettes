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
  await page.waitForFunction(() => window.__SIM__?.design.pattern?.kind === 'composition');
  const before = await page.evaluate(() => window.__SIM__?.gridHash ?? '');

  await page.getByTestId('comp-add-library').click();
  const first = page.locator('[data-testid^="comp-lib-"]').first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.click();
  await page.waitForFunction(() => {
    const p = window.__SIM__?.design.pattern;
    return (
      p?.kind === 'composition' &&
      (p.composition?.layers?.length ?? 0) === 1 &&
      p.composition.layers[0]?.hidden === false
    );
  });
  await page.waitForFunction((prev) => window.__SIM__?.gridHash !== prev, before, {
    timeout: 20_000,
  });
  const afterAdd = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(afterAdd).not.toBe(before);

  const xBefore = await page.evaluate(() => {
    const p = window.__SIM__?.design.pattern;
    if (p?.kind !== 'composition') return null;
    return p.composition.layers[0]?.x ?? null;
  });
  expect(xBefore).not.toBeNull();

  // selectedId déjà posé à l’ajout — focus canvas sans recliquer la ligne (évite le bouton cacher)
  await page.getByTestId('comp-canvas').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForFunction(
    (prevX) => {
      const p = window.__SIM__?.design.pattern;
      if (p?.kind !== 'composition') return false;
      const layer = p.composition.layers[0];
      return !!layer && !layer.hidden && layer.x === (prevX as number) + 10;
    },
    xBefore,
    { timeout: 10_000 },
  );
  await page.waitForFunction((prev) => window.__SIM__?.gridHash !== prev, afterAdd, {
    timeout: 15_000,
  });
  const afterMove = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(afterMove).not.toBe(afterAdd);
  expect(afterMove).not.toBe(before);

  await page.getByTestId('comp-canvas').focus();
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => {
    const p = window.__SIM__?.design.pattern;
    return p?.kind === 'composition' && (p.composition?.layers?.length ?? -1) === 0;
  });
  await page.waitForFunction((prev) => window.__SIM__?.gridHash === prev, before, {
    timeout: 15_000,
  });
  const afterDel = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(afterDel).toBe(before);
  expect(afterDel).not.toBe(afterMove);

  await page.screenshot({ path: 'test-results/visuel-t46-composition.png', fullPage: true });
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});
