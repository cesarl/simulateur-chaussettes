import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

async function addMotifFromLibrary(page: Page, collectionId: string): Promise<void> {
  const before = await computeId(page);
  await page.getByTestId('dock-add-motif').click();
  await expect(page.getByTestId('library-dialog')).toBeVisible();
  await page.getByTestId(`lib-collection-${collectionId}`).click();
  await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 60_000 });
  await waitCompute(page, before);
}

/** Première maille marquée flotté trop long, visible dans le canvas 2D. */
async function findFloatStitch(page: Page): Promise<{ col: number; row: number; color: string } | null> {
  return page.evaluate(() => {
    const sim = window.__SIM__;
    if (!sim) return null;
    const maxFloat = sim.design.quantize.maxFloat;
    const w = sim.grid.width;
    const h = sim.grid.height;
    // Cherche une suite horizontale > maxFloat de même couleur en zone motif.
    for (let row = 0; row < h; row++) {
      let run = 1;
      let prev = sim.getStitch(0, row);
      for (let col = 1; col <= w; col++) {
        const cur = col < w ? sim.getStitch(col, row) : null;
        const same =
          prev != null &&
          cur != null &&
          prev.color === cur.color &&
          prev.zone === cur.zone &&
          (prev.zone === 1 || prev.zone === 3); // Leg ou Foot
        if (same) {
          run += 1;
        } else {
          if (run > maxFloat && prev && (prev.zone === 1 || prev.zone === 3)) {
            const start = col - run;
            const mid = start + Math.floor(run / 2);
            if (sim.flatCenter(mid, row)) {
              return { col: mid, row, color: prev.color.toLowerCase() };
            }
          }
          run = 1;
          prev = cur;
        }
      }
    }
    return null;
  });
}

function copyCapture(name: string): void {
  const src = join('test-results', name);
  if (!existsSync(src)) return;
  for (const dir of ['docs/captures/v9', '/cursor/stores/self/media/v9']) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(src, join(dir, name));
  }
}

test.describe('T70 vue 2D vraies couleurs + alertes', () => {
  test('couleur exacte sur flotté ; Alertes visibles et mémorisées', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    // Design avec flottés : Classic 14 (demande collaboratrice).
    await addMotifFromLibrary(page, 'classique14');
    // Masquer le motif de base pour laisser Classic 14 seul.
    const eyeBase = page.getByTestId('layer-eye-motif-1');
    if (await eyeBase.count()) {
      const before = await computeId(page);
      await eyeBase.click();
      await waitCompute(page, before);
    }

    await expect(page.getByTestId('ctl-flat-alerts')).toBeVisible();
    await expect(page.getByTestId('ctl-flat-alerts')).toHaveAttribute('aria-pressed', 'false');

    const floatHit = await findFloatStitch(page);
    expect(floatHit).not.toBeNull();
    const hit = floatHit!;

    // Sans alertes : pixel canvas = couleur grille exacte (plus d'assombrissement).
    const colorMatch = await page.evaluate(({ col, row, color }) => {
      const sim = window.__SIM__;
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flat-canvas"]');
      const ctx = canvas?.getContext('2d');
      const center = sim?.flatCenter(col, row);
      if (!sim || !ctx || !center) return null;
      const pixel = ctx.getImageData(center.x, center.y, 1, 1).data;
      const r = Number.parseInt(color.slice(1, 3), 16);
      const g = Number.parseInt(color.slice(3, 5), 16);
      const b = Number.parseInt(color.slice(5, 7), 16);
      return {
        pixel: [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0],
        expected: [r, g, b],
        match: pixel[0] === r && pixel[1] === g && pixel[2] === b,
      };
    }, hit);
    expect(colorMatch?.match).toBe(true);

    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-t70-avant-alertes.png' });
    copyCapture('visuel-t70-avant-alertes.png');

    // Activer Alertes à la souris.
    await page.getByTestId('ctl-flat-alerts').click();
    await expect(page.getByTestId('ctl-flat-alerts')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('flat-alerts-legend')).toBeVisible();

    // Contours rouges sur le canvas de superposition.
    const overlayHasRed = await page.evaluate(({ col, row }) => {
      const sim = window.__SIM__;
      const overlay = document.querySelector<HTMLCanvasElement>('[data-testid="flat-overlay"]');
      const ctx = overlay?.getContext('2d');
      const center = sim?.flatCenter(col, row);
      if (!sim || !ctx || !center || !overlay) return false;
      // Cherche un pixel rouge dans un voisinage autour de la maille (contour).
      const x0 = Math.max(0, center.x - 12);
      const y0 = Math.max(0, center.y - 12);
      const w = Math.min(24, overlay.width - x0);
      const h = Math.min(24, overlay.height - y0);
      const data = ctx.getImageData(x0, y0, w, h).data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const a = data[i + 3] ?? 0;
        if (a > 80 && r > 150 && g < 100 && b < 100) return true;
      }
      return false;
    }, hit);
    expect(overlayHasRed).toBe(true);

    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-t70-apres-alertes.png' });
    copyCapture('visuel-t70-apres-alertes.png');

    // Recharger : Alertes toujours actif (localStorage).
    await page.reload();
    await waitReady(page);
    await expect(page.getByTestId('ctl-flat-alerts')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('flat-alerts-legend')).toBeVisible();

    // Pastilles Contrôles activent aussi Alertes.
    await page.getByTestId('ctl-flat-alerts').click(); // off
    await expect(page.getByTestId('ctl-flat-alerts')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('tab-chaussette').click();
    await page.getByTestId('check-floats').click();
    await expect(page.getByTestId('ctl-flat-alerts')).toHaveAttribute('aria-pressed', 'true');

    expect(errors).toEqual([]);
  });
});
