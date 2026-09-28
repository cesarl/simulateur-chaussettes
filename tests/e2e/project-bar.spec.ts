import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function saveCapture(src: string, name: string): void {
  for (const dir of ['docs/captures/v11', '/cursor/stores/self/media/v11']) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, name));
  }
}

test('T91 barre projet : undo/redo, pas d’Enregistrer, export via ⋯, 1100 px', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  const bar = page.getByTestId('project-bar');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('bar-project-save')).toHaveCount(0);
  await expect(page.getByTestId('project-favori')).toBeVisible();
  await expect(page.getByTestId('project-undo')).toBeVisible();
  await expect(page.getByTestId('project-redo')).toBeVisible();

  await bar.screenshot({ path: 'test-results/visuel-t91-apres-barre-1440.png' });
  saveCapture('test-results/visuel-t91-apres-barre-1440.png', 'visuel-t91-apres-barre-1440.png');

  // Changer quelque chose pour activer Annuler
  const id0 = await page.evaluate(() => window.__SIM__!.computeId);
  await page.evaluate(() => window.__SIM__?.loadFixture('carreau-test-etoile.svg'));
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, id0);
  await expect(page.getByTestId('project-undo')).toBeEnabled();

  await page.getByTestId('project-undo').click();
  await page.waitForFunction(() => (window.__SIM__?.design.layers.length ?? 0) >= 1);
  // Recharger fixture puis Ctrl+Z / Ctrl+Y
  const id1 = await page.evaluate(() => window.__SIM__!.computeId);
  await page.evaluate(() => window.__SIM__?.loadFixture('carreau-test-etoile.svg'));
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, id1);
  const tilesAfter = await page.evaluate(() => window.__SIM__?.design.layers.length ?? 0);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+y');
  await page.waitForFunction(
    (n) => (window.__SIM__?.design.layers.length ?? 0) === n,
    tilesAfter,
  );

  // Menu ⋯ → Exporter le projet
  await page.getByTestId('project-more').click();
  await expect(page.getByTestId('project-more-menu')).toBeVisible();
  await expect(page.getByTestId('kit-menu-item-export')).toBeVisible();
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByTestId('kit-menu-item-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/i);

  // 1100 px : pas de chevauchement des zones de la barre
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(300);
  await bar.screenshot({ path: 'test-results/visuel-t91-apres-barre-1100.png' });
  saveCapture('test-results/visuel-t91-apres-barre-1100.png', 'visuel-t91-apres-barre-1100.png');

  const boxes = await page.evaluate(() => {
    const body = document.querySelector('.project-bar-body');
    if (!(body instanceof HTMLElement)) return [];
    return Array.from(body.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains('project-bar-sep'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, id: el.dataset.testid ?? el.className };
      })
      .filter((b) => b.w > 0 && b.h > 0);
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      expect(overlapX * overlapY, `${a.id} ∩ ${b.id}`).toBeLessThanOrEqual(2);
    }
  }

  expect(errors).toEqual([]);
});
