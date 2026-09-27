/**
 * Visionneuse publique : bascule 3D ↔ À plat (comme le décor).
 */
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('visionneuse publique : bascule 3D / À plat', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('simulateur-chaussettes:dev');
    } catch {
      /* ignore */
    }
  });

  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.getByTestId('tab-global').click();
  await page.getByTestId('leave-dev').click();

  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page.getByTestId('viewer-bar')).toBeVisible();
  await expect(page.getByTestId('viewer-flat-toggle')).toBeVisible();
  await expect(page.getByTestId('viewer-flat-toggle')).not.toBeChecked();
  // Switcher coin réservé au mode ?dev
  await expect(page.getByTestId('view-flat')).toBeHidden();

  await page.screenshot({ path: 'test-results/visuel-viewer-flat-off.png' });

  await page.getByTestId('viewer-flat-toggle').check();
  await expect(page.getByTestId('viewer-flat-toggle')).toBeChecked();
  await expect(page.getByTestId('flat-canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/visuel-viewer-flat-on.png' });

  await page.getByTestId('viewer-flat-toggle').uncheck();
  await expect(page.getByTestId('viewer-flat-toggle')).not.toBeChecked();
  await expect(page.getByTestId('flat-canvas')).toBeHidden();

  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});
