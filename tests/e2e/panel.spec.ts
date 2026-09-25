import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('quinconce, 3 couleurs et taille femme se reflètent dans le simulateur', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.getByTestId('tile-fixture').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(1);
  await page.getByTestId('calep-thumb-g-quinconce').click();
  await page.getByTestId('ctl-max-colors').fill('3');
  await page.getByTestId('ctl-size').selectOption('femme');
  await page.waitForFunction(() => {
    const sim = window.__SIM__;
    if (!sim) return false;
    return sim.design.layout.calepinage.appareil === 'quinconce-h'
      && sim.design.quantize.maxColors === 3
      && sim.design.dimensions.size === 'femme'
      && sim.patternPalette.length > 0
      && sim.patternPalette.length <= 3;
  });
  expect(errors).toEqual([]);
});

test('décocher le bord-côte retire ses rangs', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  const before = await page.evaluate(() => ({
    height: window.__SIM__?.grid.height ?? 0,
    cuff: window.__SIM__?.design.dimensions.cuffRows ?? 0,
  }));
  await page.getByTestId('ctl-cuff-enabled').uncheck();
  await page.waitForFunction(
    ([height, cuff]) => {
      if (typeof height !== 'number' || typeof cuff !== 'number') return false;
      return window.__SIM__?.grid.height === height - cuff;
    },
    [before.height, before.cuff],
  );
  expect(errors).toEqual([]);
});

test('une tige trop haute est ramenée au maximum', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  const max = await page.evaluate(() => window.__SIM__?.design.dimensions.legRows ?? 0);
  await page.getByTestId('ctl-leg-rows').fill(String(max + 80));
  await page.getByTestId('ctl-leg-rows').blur();
  await expect(page.getByTestId('ctl-leg-rows')).toHaveValue(String(max), { timeout: 10_000 });
  await expect(page.getByTestId('ctl-leg-message')).toBeVisible();
  await expect(page.getByTestId('ctl-leg-message')).toContainText(String(max));
  const leg = await page.evaluate(() => window.__SIM__?.design.dimensions.legRows ?? 0);
  expect(leg).toBe(max);
  expect(errors).toEqual([]);
});
