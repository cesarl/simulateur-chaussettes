import { expect, test, type Page } from '@playwright/test';

/** T64 — bascule des vues 2D / 3D. */

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
  await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, 0, { timeout: 60_000 });
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

test.describe('T64 bascule vues', () => {
  test('masquer 2D puis 3D puis réafficher ; aspect caméra', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    const shot = async (name: string) => {
      await page.screenshot({ path: `test-results/visuel-T64-${name}.png` });
    };

    await shot('2d-3d');

    await page.getByTestId('ctl-view-2d').click();
    await expect(page.getByTestId('view2d-wrap')).toBeHidden();
    await shot('3d-seul');

    await page.getByTestId('ctl-view-3d').click();
    await expect(page.getByTestId('view3d-wrap')).toBeHidden();
    await shot('aucune');

    const panel = (await page.getByTestId('panel').boundingBox())!;
    const dock = (await page.getByTestId('layers-dock').boundingBox())!;
    expect(boxesOverlap(panel, dock)).toBe(false);

    await page.getByTestId('ctl-view-2d').click();
    await expect(page.getByTestId('view2d-wrap')).toBeVisible();
    await shot('2d-seul');

    await page.getByTestId('ctl-view-3d').click();
    await expect(page.getByTestId('view3d-wrap')).toBeVisible();
    await page.waitForTimeout(100); // laisser le resize
    const aspect = await page.evaluate(() => window.__SIM__!.cameraAspect);
    const box = (await page.getByTestId('viewport').boundingBox())!;
    expect(Math.abs(aspect - box.width / box.height)).toBeLessThan(aspect * 0.01 + 0.01);

    // Pas de chevauchement zones visibles
    const b2 = (await page.getByTestId('view2d-wrap').boundingBox())!;
    const b3 = (await page.getByTestId('view3d-wrap').boundingBox())!;
    const bp = (await page.getByTestId('panel').boundingBox())!;
    expect(boxesOverlap(b2, b3)).toBe(false);
    expect(boxesOverlap(b2, bp)).toBe(false);
    expect(boxesOverlap(b3, bp)).toBe(false);

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
