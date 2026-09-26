/**
 * T48 — aides jacquard : bulle ?, aperçu gros pixels, pastille détails.
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

test('composition : guide ?, aperçu gros pixels, pastille détails', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  await page.getByTestId('mode-composition').click();
  await page.getByTestId('comp-help').click();
  await expect(page.getByTestId('comp-help-bubble')).toBeVisible();
  await expect(page.getByTestId('comp-help-bubble')).toContainText(/aplats|SVG/i);

  await page.getByTestId('comp-add-library').click();
  await page.locator('[data-testid^="comp-lib-"]').first().click();
  await page.waitForFunction(() => {
    const p = window.__SIM__?.design.pattern;
    return p?.kind === 'composition' && (p.composition?.layers?.length ?? 0) === 1;
  });
  await page.waitForTimeout(600);

  await expect(page.getByTestId('check-detail')).toBeVisible();
  await page.getByTestId('comp-pixel-preview').click();
  await expect(page.getByTestId('comp-pixel-preview-canvas')).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: 'test-results/visuel-t48-aides.png' });
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});
