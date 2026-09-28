import { expect, test, type Page } from '@playwright/test';
import { dockAdd } from './helpers/dock';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true);
}

async function computeId(page: Page): Promise<number> {
  return page.evaluate(() => window.__SIM__?.computeId ?? -1);
}

async function waitCompute(page: Page, before: number): Promise<void> {
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? -1) > id, before, {
    timeout: 60_000,
  });
}

test.describe('T73 couleur du crayon', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
      try {
        indexedDB.deleteDatabase('cesar-bazaar');
      } catch {
        /* ignore */
      }
    });
  });

  test('choisir un fil du nuancier puis peindre la maille', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await dockAdd(page, 'dessin');
    await expect(page.getByTestId('dessin-toolbar')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('dessin-tool-crayon').click();
    await page.getByTestId('dessin-thickness').fill('1');

    await page.getByTestId('dessin-color').click();
    await expect(page.getByTestId('dessin-color-dialog')).toBeVisible();
    await page.getByTestId('dessin-color-search').fill('noir');
    // Premier fil public dont le nom/code contient « noir »
    const yarnBtn = page.locator('[data-testid^="dessin-color-yarn-"]').first();
    await expect(yarnBtn).toBeVisible({ timeout: 10_000 });
    const yarnHex = await yarnBtn.locator('i').evaluate((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return '';
      return `#${[m[1], m[2], m[3]]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')}`;
    });
    expect(yarnHex).toMatch(/^#[0-9a-f]{6}$/);
    await yarnBtn.click();
    await expect(page.getByTestId('dessin-color-dialog')).toBeHidden();

    await page.evaluate(() => window.__SIM__?.flatRevealMotif(20, 40));
    await page.waitForFunction(() => window.__SIM__?.flatMotifCenter(20, 40) != null);
    const pt = await page.evaluate(() => window.__SIM__!.flatMotifCenter(20, 40)!);
    const box = await page.getByTestId('flat-canvas').boundingBox();
    expect(box).toBeTruthy();
    const before = await computeId(page);
    await page.mouse.click(box!.x + pt.x, box!.y + pt.y);
    await waitCompute(page, before);

    const painted = await page.evaluate(({ col, row }) => {
      const sim = window.__SIM__;
      const gridRow = (sim?.motifRowOrigin ?? 0) + row;
      return sim?.getStitch(col, gridRow)?.color.toLowerCase() ?? '';
    }, { col: 20, row: 40 });
    expect(painted).toBe(yarnHex.toLowerCase());

    expect(errors).toEqual([]);
  });
});
