import { expect, test, type Page } from '@playwright/test';

/** T65 — onglet Global. */

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
  await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, 0, { timeout: 60_000 });
}

test('T65 onglet Global : boutons déplacés, plus de options-footer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?dev');
  await waitReady(page);

  await page.getByTestId('tab-global').click();
  await expect(page.getByTestId('pane-global')).toBeVisible();
  await expect(page.getByTestId('reset-all')).toBeVisible();
  await expect(page.getByTestId('admin-collections-link')).toBeVisible();
  await expect(page.getByTestId('leave-dev')).toBeVisible();
  await expect(page.getByTestId('compute-ms')).toBeVisible();
  await expect(page.locator('.options-footer')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/visuel-t65-onglet-global.png', fullPage: true });
});
