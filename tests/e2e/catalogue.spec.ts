import { expect, test } from '@playwright/test';

test('sans public/carreaux/, message discret et pas d’erreur console', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.route('**/carreaux/**', async (route) => {
    // Simuler l’absence sans 404 navigateur (qui pollue console.error).
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
  // V12 : sans catalogue local, des collections partagées seules lèvent `missing`.
  // Répondre 200 avec liste vide (pas 503) pour éviter un console.error navigateur.
  await page.route('**/api/collections**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ collections: [] }),
    });
  });

  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('catalogue-missing')).toBeVisible();
  await expect(page.getByTestId('catalogue-missing')).toContainText('npm run sync:carreaux');
  expect(await page.evaluate(() => window.__SIM__?.catalogueMissing === true)).toBe(true);
  expect(await page.evaluate(() => window.__SIM__?.catalogue)).toBeNull();
  await expect(page.getByTestId('panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('avec catalogue synchronisé, pas de bandeau d’absence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('catalogue-missing')).toBeHidden();
  expect(await page.evaluate(() => window.__SIM__?.catalogueMissing)).toBe(false);
  expect(await page.evaluate(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0)).toBe(true);
  expect(errors).toEqual([]);
});
