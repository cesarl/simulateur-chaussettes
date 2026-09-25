import { expect, test, type Page } from '@playwright/test';

const ETOILE = 'public/fixtures/carreau-test-etoile.svg';
const QUART = 'public/fixtures/carreau-test-quart.svg';
const PAS_IMAGE = 'tests/fixtures/pas-une-image.txt';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openApp(page: Page): Promise<string[]> {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  return errors;
}

test('importer un SVG affiche une vignette', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('tile-file').setInputFiles(ETOILE);
  await expect(page.getByTestId('tile-thumb')).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(async () => page.getByTestId('tile-thumb').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThanOrEqual(512);
  expect(errors).toEqual([]);
});

test('importer deux fichiers puis en supprimer un', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('tile-file').setInputFiles([ETOILE, QUART]);
  await expect(page.getByTestId('tile-thumb')).toHaveCount(2, { timeout: 15_000 });
  await page.getByTestId('tile-remove').first().click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(1, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('un fichier non image affiche une erreur sans exception', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('tile-file').setInputFiles(PAS_IMAGE);
  await expect(page.getByTestId('tile-error')).toBeVisible();
  await expect(page.getByTestId('tile-error')).toContainText(/png|svg/i);
  await expect(page.getByTestId('tile-thumb')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('le bouton exemple et le réordonnancement fonctionnent', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('tile-fixture').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(1, { timeout: 15_000 });

  await page.evaluate(async () => {
    await window.__SIM__?.loadFixture('carreau-test-quart');
  });
  await expect(page.getByTestId('tile-thumb')).toHaveCount(2, { timeout: 15_000 });
  await page.getByTestId('tile-down').first().click();
  await expect(page.getByTestId('tile-name').first()).toContainText('quart');
  expect(errors).toEqual([]);
});
