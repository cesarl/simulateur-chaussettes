import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

async function sampleCanvasColors(
  page: Page,
  points: Array<[number, number]>,
): Promise<string[]> {
  return page.evaluate((cells) => {
    const sim = window.__SIM__;
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flat-canvas"]');
    const context = canvas?.getContext('2d');
    if (!sim || !context) return [];
    const out: string[] = [];
    for (const [col, row] of cells) {
      const point = sim.flatCenter(col, row);
      if (!point) {
        out.push('missing');
        continue;
      }
      const data = context.getImageData(point.x, point.y, 1, 1).data;
      out.push(`${data[0]},${data[1]},${data[2]}`);
    }
    return out;
  }, points);
}

function copyCapture(name: string): void {
  const src = join('test-results', name);
  if (!existsSync(src)) return;
  for (const dir of ['docs/captures/v9', '/cursor/stores/self/media/v9']) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(src, join(dir, name));
  }
}

test.describe('T71 calque Dessin', () => {
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

  test('+ Dessin dans le dock', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await dockAdd(page, 'dessin');
    await expect(page.locator('[data-testid^="layer-card-dessin-"]')).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('layer-options-title')).toContainText(/Dessin/i);
    await expect(page.getByTestId('dessin-painted-count')).toBeVisible();

    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-t71-dessin-vide.png' });
    copyCapture('visuel-t71-dessin-vide.png');
    expect(errors).toEqual([]);
  });

  test('Transformer en dessin conserve le rendu 2D', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);
    await expect(page.locator('[data-testid^="layer-card-dessin-"]')).toHaveCount(0);

    const samples: Array<[number, number]> = [
      [20, 40],
      [60, 80],
      [100, 50],
      [42, 100],
      [80, 120],
    ];
    await page.waitForFunction(() => window.__SIM__?.flatCenter(20, 40) != null);
    const beforeColors = await sampleCanvasColors(page, samples);
    expect(beforeColors.every((c) => c !== 'missing')).toBe(true);

    const motifId = await page.evaluate(() => {
      const layers = window.__SIM__?.design.layers ?? [];
      return layers.find((l) => l.kind === 'motif')?.id ?? null;
    });
    expect(motifId).toBeTruthy();

    await page.getByTestId(`layer-menu-${motifId}`).click();
    await expect(page.getByTestId(`layer-menu-to-dessin-${motifId}`)).toBeVisible();
    await page.getByTestId(`layer-menu-to-dessin-${motifId}`).click();
    await expect(page.locator('[data-testid^="layer-card-dessin-"]')).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect(page.getByTestId(`layer-eye-${motifId}`)).toHaveAttribute('data-state', 'off');
    await expect(page.getByTestId('layer-options-title')).toContainText(/Dessin/i);

    const afterColors = await sampleCanvasColors(page, samples);
    expect(afterColors).toEqual(beforeColors);

    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-t71-transform-dessin.png' });
    copyCapture('visuel-t71-transform-dessin.png');

    expect(errors).toEqual([]);
  });
});
