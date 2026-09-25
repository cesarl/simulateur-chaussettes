import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('enregistrer, recharger et ouvrir retrouve la même grille', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.getByTestId('tile-fixture').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(1, { timeout: 15_000 });
  await page.getByTestId('ctl-size').selectOption('femme');
  await page.waitForFunction(() => {
    const sim = window.__SIM__;
    return sim?.design.dimensions.size === 'femme' && (sim.patternPalette.length ?? 0) > 0;
  });
  const hash = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(hash).not.toBe('');

  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('project-save').click();
  const download = await downloadEvent;
  const file = await download.path();
  if (!file) throw new Error('Fichier de projet absent.');

  await page.getByTestId('ctl-size').selectOption('homme');
  await page.waitForFunction(() => window.__SIM__?.design.dimensions.size === 'homme');

  await page.reload();
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.getByTestId('project-file').setInputFiles(file);
  await page.waitForFunction((expected) => window.__SIM__?.gridHash === expected, hash);
  const size = await page.evaluate(() => window.__SIM__?.design.dimensions.size);
  expect(size).toBe('femme');
  expect(errors).toEqual([]);
});
