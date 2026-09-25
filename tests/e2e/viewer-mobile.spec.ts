import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('visionneuse mobile : canvas pleine hauteur viewport', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('simulateur-chaussettes:dev');
    } catch {
      /* ignore */
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page.getByTestId('viewer-bar')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sock-canvas"]')!;
    const viewport = document.getElementById('viewport')!;
    const app = document.getElementById('app')!;
    return {
      canvasH: canvas.clientHeight,
      viewportH: viewport.clientHeight,
      appH: app.clientHeight,
      innerH: window.innerHeight,
    };
  });

  // Avant fix : ~50 % ; après : quasi 100 % du viewport
  expect(metrics.canvasH).toBeGreaterThan(metrics.innerH * 0.9);
  expect(metrics.viewportH).toBeGreaterThan(metrics.innerH * 0.9);
  expect(metrics.appH).toBe(metrics.innerH);

  await page.screenshot({ path: 'test-results/visuel-fix-viewer-mobile.png', fullPage: true });
  expect(fs.existsSync('test-results/visuel-fix-viewer-mobile.png')).toBe(true);
  expect(errors).toEqual([]);
});
