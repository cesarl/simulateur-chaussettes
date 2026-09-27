import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('visionneuse par défaut : pas de panneau, canvas plein écran', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('simulateur-chaussettes:dev');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page.getByTestId('viewer-bar')).toBeVisible();
  await expect(page.getByTestId('viewer-copy-link')).toBeVisible();
  // Bascule À plat dans la barre visionneuse (comme le décor)
  await expect(page.getByTestId('viewer-flat-toggle')).toBeVisible();
  await expect(page.getByTestId('view-flat')).toBeHidden();

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sock-canvas"]')!;
    const app = document.getElementById('app')!;
    return {
      canvasW: canvas.clientWidth,
      canvasH: canvas.clientHeight,
      appW: app.clientWidth,
      appH: app.clientHeight,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
    };
  });
  expect(metrics.canvasW).toBeGreaterThan(metrics.innerW * 0.9);
  expect(metrics.canvasH).toBeGreaterThan(metrics.innerH * 0.85);
  expect(metrics.appW).toBe(metrics.innerW);
  expect(errors).toEqual([]);
});

test('?dev active le panneau, retire le paramètre, mémorise, leave-dev revient à la visionneuse', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const flag = 'simulateur-chaussettes:dev-cleared';
    try {
      if (sessionStorage.getItem(flag) === '1') return;
      localStorage.removeItem('simulateur-chaussettes:dev');
      sessionStorage.setItem(flag, '1');
    } catch {
      /* ignore */
    }
  });

  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeVisible();
  await page.getByTestId('tab-global').click();
  await expect(page.getByTestId('leave-dev')).toBeVisible();
  await expect(page.getByTestId('viewer-bar')).toBeHidden();
  expect(page.url()).not.toMatch(/[?&]dev(=|&|$)/);
  expect(new URL(page.url()).searchParams.has('dev')).toBe(false);

  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeVisible();

  await page.getByTestId('tab-global').click();
  await page.getByTestId('leave-dev').click();
  await page.reload();
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page.getByTestId('viewer-bar')).toBeVisible();
  expect(errors).toEqual([]);
});
