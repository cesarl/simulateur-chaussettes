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

async function capture(page: Page, name: string, view: 'trois-quarts' | 'profil-exterieur' = 'trois-quarts'): Promise<void> {
  const dataUrl = await page.evaluate(
    async ({ viewName }) => {
      const fn = window.__SIM__?.captureView;
      if (!fn) throw new Error('captureView absent');
      return fn(viewName, 1200, '#ecebe8');
    },
    { viewName: view },
  );
  writeFileSync(`test-results/${name}.png`, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
}

test('T28 captures bilan V3', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);
  mkdirSync('test-results', { recursive: true });

  for (const name of ['carreau-test-etoile.svg', 'carreau-test-quart.svg', 'carreau-test-damier.png']) {
    const id = await page.evaluate(() => window.__SIM__!.computeId);
    await page.evaluate((n) => window.__SIM__?.loadFixture(n), name);
    await page.waitForFunction((c) => (window.__SIM__?.computeId ?? 0) > c, id);
  }

  // 1. À la suite, rotation aléatoire
  await page.getByTestId('calep-thumb-g-suite-rotalea').click();
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.genere.rotation === 'aleatoire-90');
  await capture(page, 'visuel-T28-suite-rotalea');

  // 2. Rosace
  await page.getByTestId('calep-filter').selectOption('tous');
  await page.getByTestId('calep-thumb-rosace').click();
  await page.waitForFunction(() => window.__SIM__?.design.layout.calepinage.presetId === 'rosace');
  await capture(page, 'visuel-T28-rosace');

  // 3. Ophis
  const ophis = page.locator('[data-testid^="calep-thumb-ophis"]').first();
  await expect(ophis).toBeVisible();
  const ophisId = await ophis.getAttribute('data-testid');
  await ophis.click();
  await page.waitForFunction((id) => {
    const pid = window.__SIM__?.design.layout.calepinage.presetId;
    return !!pid && id?.endsWith(pid);
  }, ophisId);
  await capture(page, 'visuel-T28-ophis');

  // 4. Talon bas
  const builds = await page.evaluate(() => window.__SIM__!.geometryBuilds);
  await page.getByTestId('tab-chaussette').click();
  await page.getByTestId('ctl-heel-height').fill('40');
  await page.getByTestId('ctl-heel-height').blur();
  await page.waitForFunction(
    (b) => window.__SIM__?.design.zones.heelHeightMm === 40 && (window.__SIM__?.geometryBuilds ?? 0) > b,
    builds,
  );
  await capture(page, 'visuel-T28-talon-bas', 'profil-exterieur');

  expect(errors).toEqual([]);
});
