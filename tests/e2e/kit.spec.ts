import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function saveCapture(src: string, name: string): void {
  const dirs = ['docs/captures/v11', '/cursor/stores/self/media/v11'];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, name));
  }
}

test('T90 kit : menu, Échap, un seul menu, infobulle', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/kit.html');
  await expect(page.getByTestId('kit-demo')).toBeVisible();

  await page.screenshot({ path: 'test-results/visuel-t90-kit-apres.png', fullPage: true });
  saveCapture('test-results/visuel-t90-kit-apres.png', 'visuel-t90-kit-apres.png');

  // Menu s'ouvre
  await page.getByTestId('kit-more-a').click();
  await expect(page.getByTestId('kit-menu')).toBeVisible();
  await expect(page.getByTestId('kit-menu-item-open')).toBeVisible();

  // Échap ferme
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('kit-menu')).toHaveCount(0);

  // Un seul menu ouvert à la fois
  await page.getByTestId('kit-more-a').click();
  await expect(page.getByTestId('kit-menu')).toBeVisible();
  await page.getByTestId('kit-more-b').click();
  await expect(page.getByTestId('kit-menu')).toHaveCount(1);
  await expect(page.getByTestId('kit-menu-item-copy')).toBeVisible();
  await expect(page.getByTestId('kit-menu-item-open')).toHaveCount(0);

  // Clic dehors ferme
  await page.locator('h1').click({ position: { x: 20, y: 10 } });
  await expect(page.getByTestId('kit-menu')).toHaveCount(0);

  // Navigation clavier
  await page.getByTestId('kit-more-a').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');

  // Infobulle au survol (délai 400 ms)
  await page.getByTestId('kit-btn-undo').hover();
  await expect(page.getByTestId('kit-tooltip')).toBeVisible({ timeout: 2000 });
  await expect(page.getByTestId('kit-tooltip')).toContainText('Annuler');
  await expect(page.getByTestId('kit-tooltip')).toContainText('Ctrl+Z');

  // Toast
  await page.getByTestId('kit-toast-trigger').click();
  await expect(page.getByTestId('kit-toast')).toBeVisible();
  await expect(page.getByTestId('kit-toast')).toContainText('Lien copié');

  // Dialog
  await page.getByTestId('kit-dialog-trigger').click();
  await expect(page.getByTestId('kit-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('kit-dialog')).toHaveCount(0);

  expect(errors).toEqual([]);
});
