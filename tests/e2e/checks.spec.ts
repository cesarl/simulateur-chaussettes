import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('ajuster la largeur ramène le décalage du raccord à zéro', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  // Passer en taille libre pour pouvoir forcer un décalage de raccord.
  await page.getByTestId('ctl-free-tile-size').check();
  await page.getByTestId('ctl-tile-width').fill('20');
  await page.waitForFunction(() => {
    const d = window.__SIM__?.design;
    return d != null && d.dimensions.needles % (d.layout.tileStitches + d.layout.gapStitches) !== 0;
  });
  await expect(page.getByTestId('check-seam')).toContainText(/décalage/i);
  await page.getByTestId('ctl-fit-seam').click();
  await expect(page.getByTestId('check-seam')).toContainText('tombe juste');
  const mismatch = await page.evaluate(() => {
    const design = window.__SIM__?.design;
    if (!design) return -1;
    const period = design.layout.tileStitches + design.layout.gapStitches;
    return design.dimensions.needles % period;
  });
  expect(mismatch).toBe(0);
  expect(errors).toEqual([]);
});
