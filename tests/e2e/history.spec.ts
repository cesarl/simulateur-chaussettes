import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('reset section, undo, reset-all avec confirmation', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  const id0 = await page.evaluate(() => window.__SIM__!.computeId);
  await page.evaluate(() => window.__SIM__?.loadFixture('carreau-test-etoile.svg'));
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, id0);

  await page.getByTestId('calep-thumb-g-suite').click();
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.genere.ordre === 'suite');

  await page.getByTestId('tab-chaussette').click();
  await page.getByTestId('ctl-heel-height').fill('95');
  await page.getByTestId('ctl-heel-height').blur();
  await page.waitForFunction(() => window.__SIM__?.design.zones.heelHeightMm === 95);

  await page.getByTestId('ctl-max-colors').fill('3');
  await page.waitForFunction(() => window.__SIM__?.design.quantize.maxColors === 3);

  await expect(page.getByTestId('dirty-zones')).toBeVisible();
  await expect(page.getByTestId('dirty-pixels')).toBeVisible();

  await page.getByTestId('tab-calque').click();
  await expect(page.getByTestId('dirty-calepinage')).toBeVisible();
  await page.getByTestId('reset-calepinage').click();
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.genere.ordre === 'unique');
  expect(await page.evaluate(() => window.__SIM__!.design.zones.heelHeightMm)).toBe(95);
  expect(await page.evaluate(() => window.__SIM__!.design.quantize.maxColors)).toBe(3);

  await page.getByTestId('undo').click();
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.genere.ordre === 'suite');

  const tilesBefore = await page.evaluate(() => window.__SIM__!.design.layout.tileIds.length);
  await page.getByTestId('reset-all').click();
  await expect(page.getByTestId('reset-all')).toHaveText('Confirmer ?');
  await page.getByTestId('reset-all').click();
  await page.waitForFunction(() => window.__SIM__?.design.zones.heelHeightMm === 55);
  expect(await page.evaluate(() => window.__SIM__!.design.quantize.maxColors)).toBe(4);
  expect(await page.evaluate(() => window.__SIM__!.design.layout.calepinage.genere.ordre)).toBe('unique');
  expect(await page.evaluate(() => window.__SIM__!.design.layout.tileIds.length)).toBe(tilesBefore);

  expect(errors).toEqual([]);
});
