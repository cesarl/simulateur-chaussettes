import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function captureView(page: Page, view: 'dos' | 'profil-interieur', path: string): Promise<void> {
  await page.evaluate(async (v) => {
    const dataUrl = await window.__SIM__!.captureView(v, 512, '#ecebe8');
    (window as unknown as { __cap?: string }).__cap = dataUrl;
  }, view);
  const dataUrl = await page.evaluate(() => (window as unknown as { __cap?: string }).__cap ?? '');
  expect(dataUrl.startsWith('data:image/png')).toBe(true);
  const buf = Buffer.from(dataUrl.split(',')[1]!, 'base64');
  const fs = await import('node:fs');
  fs.writeFileSync(path, buf);
}

test('raccord dos puis intérieur : captures dos et profil intérieur', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.evaluate(() => window.__SIM__!.loadFixture('carreau-test-etoile.svg'));
  await expect(page.getByTestId('tile-thumb')).toHaveCount(1, { timeout: 15_000 });

  // Mode libre, largeur qui ne tombe pas juste
  await page.getByTestId('ctl-free-tile-size').check();
  await page.getByTestId('ctl-tile-width').fill('25');
  await page.waitForFunction(() => window.__SIM__?.design.layout.tileStitches === 25);

  await page.getByTestId('ctl-seam').selectOption('dos');
  await page.waitForFunction(() => window.__SIM__?.design.layout.seam === 'dos');
  await captureView(page, 'dos', 'test-results/visuel-T37-raccord-dos-vue-dos.png');
  await captureView(page, 'profil-interieur', 'test-results/visuel-T37-raccord-dos-vue-interieur.png');

  await page.getByTestId('ctl-seam').selectOption('interieur');
  await page.waitForFunction(() => window.__SIM__?.design.layout.seam === 'interieur');
  await captureView(page, 'dos', 'test-results/visuel-T37-raccord-interieur-vue-dos.png');
  await captureView(page, 'profil-interieur', 'test-results/visuel-T37-raccord-interieur-vue-interieur.png');

  await page.getByTestId('view-flat').click();
  await expect(page.getByTestId('flat-canvas')).toBeVisible();
  await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-T37-raccord-plat.png' });

  expect(errors).toEqual([]);
});
