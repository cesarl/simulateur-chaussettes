import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('3 carreaux à la suite, rotation aléatoire : motifs visibles 3D et à plat', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  for (const name of ['carreau-test-etoile.svg', 'carreau-test-quart.svg', 'carreau-test-damier.png']) {
    const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
    await page.evaluate((n) => window.__SIM__?.loadFixture(n), name);
    await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, before);
  }
  await expect(page.getByTestId('tile-thumb')).toHaveCount(3);

  await page.getByTestId('calep-thumb-g-suite-rotalea').click();
  await page.waitForFunction(() => {
    const c = window.__SIM__?.design.layout.calepinage;
    return c?.genere.ordre === 'suite' && c.genere.rotation === 'aleatoire-90';
  });
  await page.waitForFunction(() => (window.__SIM__?.patternPalette.length ?? 0) >= 2);

  mkdirSync('test-results', { recursive: true });
  const dataUrl = await page.evaluate(async () => {
    const capture = window.__SIM__?.captureView;
    if (!capture) throw new Error('captureView absent');
    return capture('trois-quarts', 1200, '#ecebe8');
  });
  writeFileSync('test-results/visuel-T25-suite-rotalea-3d.png', Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));

  await expect(page.getByTestId('flat-canvas')).toBeVisible();
  await page.locator('[data-testid="flat-canvas"]').screenshot({ path: 'test-results/visuel-T25-suite-rotalea-plat.png' });

  expect(errors).toEqual([]);
});
