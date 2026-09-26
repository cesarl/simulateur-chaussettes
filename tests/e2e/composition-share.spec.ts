/**
 * T47 — composition bibliothèque → lien → visionneuse (même empreinte).
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

test('composition bibliothèque : lien ouvre la même grille en visionneuse', async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  await page.getByTestId('mode-composition').click();
  await page.getByTestId('comp-add-library').click();
  const first = page.locator('[data-testid^="comp-lib-"]').first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.click();
  await page.waitForFunction(() => {
    const p = window.__SIM__?.design.pattern;
    return p?.kind === 'composition' && (p.composition?.layers?.length ?? 0) > 0;
  });
  await page.waitForTimeout(800);
  const hash = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(hash).not.toBe('');

  await expect(page.getByTestId('panel-copy-link')).toBeEnabled();
  await page.getByTestId('panel-copy-link').click();
  await expect(page.getByTestId('share-hint')).toContainText(/Lien copié/i);

  const url = page.url();
  expect(url).toMatch(/#p=/);

  const viewer = await context.newPage();
  const viewerErrors = trackErrors(viewer);
  // Visionneuse publique (sans ?dev)
  const publicUrl = url.replace('?dev', '').replace('/?dev', '/');
  await viewer.goto(publicUrl);
  await viewer.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
  await viewer.waitForFunction((expected) => window.__SIM__?.gridHash === expected, hash, {
    timeout: 30_000,
  });
  const viewerHash = await viewer.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(viewerHash).toBe(hash);
  await viewer.screenshot({ path: 'test-results/visuel-t47-share-viewer.png' });
  expect(viewerErrors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  await viewer.close();
});
