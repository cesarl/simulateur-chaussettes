import { expect, test, type Page } from '@playwright/test';

/** T66 — bibliothèque d’images intégrée (Logo magenta). */

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
  await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, 0, { timeout: 60_000 });
}

async function waitCompute(page: Page, previous: number): Promise<void> {
  await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, previous, {
    timeout: 60_000,
  });
}

/** True si au moins une maille de la grille est proche du magenta logo (#EC008C). */
async function hasMagentaStitch(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const sim = window.__SIM__;
    if (!sim?.grid) return false;
    const { width, height } = sim.grid;
    const target = { r: 0xec, g: 0x00, b: 0x8c };
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const stitch = sim.getStitch?.(x, y);
        const hex = stitch?.color;
        if (!hex || hex.length < 7) continue;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if (Math.abs(r - target.r) + Math.abs(g - target.g) + Math.abs(b - target.b) < 60) return true;
      }
    }
    return false;
  });
}

test('T66 bibliothèque Logo → calque Image → lien partageable', async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?dev');
  await waitReady(page);

  await page.getByTestId('project-library').click();
  await expect(page.getByTestId('library-dialog')).toBeVisible();
  await page.getByTestId('lib-tab-images').click();
  await expect(page.getByTestId('lib-bib-section')).toBeVisible();
  const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
  await page.getByTestId('lib-bib-logo').click();

  await page.waitForFunction(() => {
    const design = window.__SIM__?.design as { layers?: Array<{ kind: string; asset?: { kind: string } }> } | undefined;
    return design?.layers?.some((l) => l.kind === 'image' && l.asset?.kind === 'bibliotheque') === true;
  });
  await waitCompute(page, before);

  await expect.poll(() => hasMagentaStitch(page), { timeout: 60_000 }).toBe(true);

  await page.screenshot({ path: 'test-results/visuel-t66-logo-2d.png' });

  // Fermer le dialogue s’il est encore ouvert, puis copier le lien.
  await page.keyboard.press('Escape');
  await page.getByTestId('panel-copy-link').click();
  await expect(page.getByTestId('share-disabled-hint')).toBeHidden();

  const hash = await page.evaluate(() => location.hash);
  expect(hash.length).toBeGreaterThan(10);

  const viewer = await context.newPage();
  await viewer.goto(`/${hash}`);
  await waitReady(viewer);
  await expect.poll(() => hasMagentaStitch(viewer), { timeout: 60_000 }).toBe(true);
  const bodyText = await viewer.locator('body').innerText();
  expect(bodyText.toLowerCase()).not.toMatch(/images importées/);
  await viewer.close();
});
