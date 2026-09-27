import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') errors.push(text);
    if (message.type() === 'warning' && /webgl|shader/i.test(text)) errors.push(text);
  });
  return errors;
}

async function zoomViewport(page: Page): Promise<void> {
  const viewport = page.getByTestId('viewport');
  const box = await viewport.boundingBox();
  if (!box) throw new Error('viewport absent');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.42);
  for (let step = 0; step < 6; step++) await page.mouse.wheel(0, -220);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('rendu simple et fidèle : captures et export plat inchangé', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);
  const beforeFixture = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
  await page.evaluate(() => window.__SIM__?.loadFixture('carreau-test-etoile.svg'));
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, beforeFixture);

  await page.getByTestId('tab-chaussette').click();
  await page.getByTestId('ctl-knit-fidelity').selectOption('simple');
  await page.waitForFunction(() => window.__SIM__?.knitFidelity === 'simple');
  await zoomViewport(page);
  await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-t14-simple.png' });

  await page.getByTestId('ctl-knit-fidelity').selectOption('fidele');
  await page.waitForFunction(() => window.__SIM__?.knitFidelity === 'fidele');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-t14-fidele.png' });

  await page.getByTestId('tab-export').click();
  await page.getByTestId('export-face').uncheck();
  await page.getByTestId('export-plat-exact').check();
  const flatEvent = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const flat = await flatEvent;
  expect(flat.suggestedFilename()).toBe('modele_homme_plat-exact.png');
  const path = await flat.path();
  expect(path).toBeTruthy();

  expect(errors).toEqual([]);
});
