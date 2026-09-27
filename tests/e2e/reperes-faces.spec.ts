import { expect, test, type Page } from '@playwright/test';

/** T63 — repères des faces sur la vue 2D. */

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

test.describe('T63 repères faces', () => {
  test('Repères actifs par défaut ; désactiver persiste au reload', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await expect(page.getByTestId('ctl-face-guides')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-T63-reperes.png' });

    await page.getByTestId('ctl-face-guides').click();
    await expect(page.getByTestId('ctl-face-guides')).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await waitReady(page);
    await expect(page.getByTestId('ctl-face-guides')).toHaveAttribute('aria-pressed', 'false');

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
