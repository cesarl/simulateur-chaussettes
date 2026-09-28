import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { dockAdd } from './helpers/dock';

/**
 * T57 — Bibliothèque : dialogue modal, collections, import image.
 * Actions à la souris uniquement (sauf lecture d’état via __SIM__ pour les couleurs 2D).
 */

const DAMIER = path.join(process.cwd(), 'public/fixtures/carreau-test-damier.png');

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

async function computeId(page: Page): Promise<number> {
  return page.evaluate(() => window.__SIM__?.computeId ?? 0);
}

async function waitCompute(page: Page, previous: number): Promise<void> {
  await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, previous, {
    timeout: 60_000,
  });
}

/** Couleurs lues dans la vue 2D (bitmap du canvas). */
async function flatColors(page: Page, cells: Array<[number, number]>): Promise<string[]> {
  return page.evaluate((list) => {
    const canvas = document.querySelector('[data-testid="flat-canvas"]');
    const sim = window.__SIM__;
    if (!(canvas instanceof HTMLCanvasElement) || !sim) return [];
    const context = canvas.getContext('2d');
    if (!context) return [];
    const out: string[] = [];
    for (const [col, row] of list) {
      const point = sim.flatCenter(col, row);
      if (!point) continue;
      const data = context.getImageData(point.x, point.y, 1, 1).data;
      out.push(`${data[0]},${data[1]},${data[2]}`);
    }
    return out;
  }, cells);
}

test.describe('T57 bibliothèque', () => {
  test('dialogue au premier plan, filtre medina, Motif et import PNG', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await page.getByTestId('project-library').click();
    await expect(page.getByTestId('library-dialog')).toBeVisible();

    const onTop = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="library-dialog"]');
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const hit = document.elementFromPoint(cx, cy);
      return !!(dialog && (hit === dialog || dialog.contains(hit)));
    });
    expect(onTop).toBe(true);

    await page.getByTestId('library-dialog').screenshot({
      path: 'test-results/visuel-T57-bibliotheque-dialogue.png',
    });

    await page.getByTestId('lib-search').fill('medina');
    await expect(page.getByTestId('lib-collection-medina')).toBeVisible();

    const beforeMotif = await computeId(page);
    await page.getByTestId('lib-collection-medina').click();
    await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
    await waitCompute(page, beforeMotif);

    await expect(page.getByTestId('dock-selected-name')).toContainText(/Medina/i);
    const motifCards = page.locator('[data-testid^="layer-card-"]').filter({ hasText: /Medina/i });
    await expect(motifCards.first()).toHaveAttribute('data-selected', 'true');

    const beforeImage = await computeId(page);
    await dockAdd(page, 'image');
    await expect(page.getByTestId('library-dialog')).toBeVisible();
    await page.getByTestId('lib-tab-images').click();
    await page.getByTestId('lib-image-import').click();
    await page.getByTestId('lib-image-file').setInputFiles(DAMIER);
    await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
    await waitCompute(page, beforeImage);

    await expect(page.getByTestId('layer-options-title')).toContainText('Image');
    const witness: Array<[number, number]> = [
      [40, 80],
      [50, 90],
      [60, 100],
      [70, 110],
    ];
    const colors = await flatColors(page, witness);
    expect(colors.length).toBeGreaterThan(0);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
