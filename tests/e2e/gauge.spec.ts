import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('jauge verticale : carreaux sur le tour inchangés, encadré mis à jour', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  await page.getByTestId('ctl-tiles-around').fill('5');
  await page.waitForFunction(() => window.__SIM__?.design.layout.tilesAround === 5);
  await page.waitForFunction(() => window.__SIM__?.design.layout.tileSizeMode === 'around');

  const before = await page.evaluate(() => ({
    around: window.__SIM__?.design.layout.tilesAround,
    width: window.__SIM__?.design.layout.tileStitches,
    rows: window.__SIM__?.design.layout.tileRows,
    readout: document.querySelector('[data-testid="gauge-readout"]')?.textContent ?? '',
  }));
  expect(before.around).toBe(5);
  expect(before.width).toBeCloseTo(168 / 5, 5);
  expect(before.readout).toMatch(/5 carreaux sur le tour/);

  const rowsBefore = before.rows ?? 0;
  await page.getByTestId('section-machine').evaluate((el) => {
    if (el instanceof HTMLDetailsElement) el.open = true;
  });
  await page.getByTestId('ctl-rows-per-cm').fill('12');
  await page.waitForFunction(() => window.__SIM__?.design.dimensions.rowsPerCm === 12);

  const after = await page.evaluate(() => ({
    around: window.__SIM__?.design.layout.tilesAround,
    width: window.__SIM__?.design.layout.tileStitches,
    rows: window.__SIM__?.design.layout.tileRows,
    readout: document.querySelector('[data-testid="gauge-readout"]')?.textContent ?? '',
  }));
  expect(after.around).toBe(5);
  expect(after.width).toBeCloseTo(before.width ?? 0, 5);
  expect(after.rows).not.toBe(rowsBefore);
  expect(after.readout).toMatch(/5 carreaux sur le tour/);
  expect(after.readout).not.toBe(before.readout);
  await expect(page.getByTestId('section-machine')).toBeVisible();

  expect(errors).toEqual([]);
});
