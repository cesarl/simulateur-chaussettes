import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function distinctColors(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="viewport"] canvas');
    if (!canvas) return 0;
    const copy = document.createElement('canvas');
    copy.width = 64;
    copy.height = 64;
    const context = copy.getContext('2d');
    if (!context) return 0;
    context.drawImage(canvas, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size;
  });
}

test('la vue 3D montre une chaussette homme puis femme', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await page.waitForFunction(() => (window.__SIM__?.geometryBuilds ?? 0) >= 1);
  await expect.poll(() => distinctColors(page)).toBeGreaterThan(2);
  await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-t06-homme.png' });

  const before = await page.evaluate(() => ({
    id: window.__SIM__?.computeId ?? 0,
    width: window.__SIM__?.grid.width ?? 0,
  }));
  await page.evaluate(() => {
    window.__SIM__?.setDesign({ dimensions: { size: 'femme' } });
  });
  await page.waitForFunction((id) => window.__SIM__?.computeId !== id, before.id);
  await expect.poll(() => distinctColors(page)).toBeGreaterThan(2);
  const after = await page.evaluate(() => window.__SIM__?.grid.width ?? 0);
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before.width);
  await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-t06-femme.png' });
  expect(errors).toEqual([]);
});
