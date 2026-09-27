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
    timeout: 90_000,
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

test.describe('T72 dessin tendon d’Achille', () => {
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

  test('trait 2 mailles au dos de la tige à la souris', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await page.getByTestId('dock-add-dessin').click();
    await expect(page.getByTestId('dessin-toolbar')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('dessin-tool-trait').click();
    await page.getByTestId('dessin-thickness').fill('2');
    await page.getByTestId('dessin-thickness').dispatchEvent('input');
    await page.getByTestId('dessin-thickness').dispatchEvent('change');
    await expect(page.getByTestId('dessin-thickness')).toHaveValue('2');
    await page.getByTestId('dessin-snap').check();

    // Centrer le haut de tige (Dos = 42), mesurer le pas vertical, glisser sur 180 rangs.
    await page.evaluate(() => {
      window.__SIM__?.flatRevealMotif(42, 0);
    });
    await page.waitForFunction(() => window.__SIM__?.flatMotifCenter(42, 0) != null);

    const metrics = await page.evaluate(() => {
      const sim = window.__SIM__!;
      const top = sim.flatMotifCenter(42, 0)!;
      const next = sim.flatMotifCenter(42, 1);
      const cellH = next ? next.y - top.y : 4;
      return { top, cellH };
    });
    const canvasBox = await page.getByTestId('flat-canvas').boundingBox();
    expect(canvasBox).toBeTruthy();
    const x0 = canvasBox!.x + metrics.top.x;
    const y0 = canvasBox!.y + metrics.top.y;
    const y1 = y0 + metrics.cellH * 179;

    const before = await computeId(page);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(x0, y1, { steps: 40 });
    await page.keyboard.up('Shift');
    await page.mouse.up();
    await waitCompute(page, before);

    const painted = await page.evaluate(() => {
      const sim = window.__SIM__;
      if (!sim) return null;
      const layer = sim.design.layers.find((l) => l.kind === 'dessin');
      if (!layer || layer.kind !== 'dessin') return null;
      // Vérifier via getStitch sur la grille composée (owner dessin).
      const checks: Array<{ row: number; c42: string; c43: string; c41: string; c44: string }> = [];
      for (const row of [0, 90, 179]) {
        // Motif row → grid via motifRowOrigin
        const gridRow = sim.motifRowOrigin + row;
        const a = sim.getStitch(42, gridRow);
        const b = sim.getStitch(43, gridRow);
        const left = sim.getStitch(41, gridRow);
        const right = sim.getStitch(44, gridRow);
        checks.push({
          row,
          c42: a?.color ?? '',
          c43: b?.color ?? '',
          c41: left?.color ?? '',
          c44: right?.color ?? '',
        });
      }
      const afterHeel = sim.getStitch(42, sim.motifRowOrigin + 180);
      return { checks, afterHeel: afterHeel?.color ?? null, layerId: layer.id };
    });
    expect(painted).not.toBeNull();
    for (const c of painted!.checks) {
      expect(c.c42.toLowerCase()).toBe('#1d1d1b');
      expect(c.c43.toLowerCase()).toBe('#1d1d1b');
      expect(c.c41.toLowerCase()).not.toBe('#1d1d1b');
      expect(c.c44.toLowerCase()).not.toBe('#1d1d1b');
    }
    // Rang 180 = 1er rang pied : pas de trait (ou hors tige motif selon patternOnFoot)
    // Le critère : rien au rang 180 du motif peint comme trait vertical — owner dessin absent.
    const owner180 = await page.evaluate(() => {
      const sim = window.__SIM__;
      if (!sim) return 'none';
      return sim.stackLayerAt(42, 180);
    });
    expect(owner180 === painted!.layerId).toBe(false);

    // Annuler → plus rien ; Rétablir → revenu
    const beforeUndo = await computeId(page);
    await page.getByTestId('project-undo').click();
    await waitCompute(page, beforeUndo);
    const afterUndo = await page.evaluate(() => {
      const sim = window.__SIM__;
      const gridRow = (sim?.motifRowOrigin ?? 0) + 90;
      return sim?.getStitch(42, gridRow)?.color.toLowerCase() ?? '';
    });
    expect(afterUndo).not.toBe('#1d1d1b');

    const beforeRedo = await computeId(page);
    await page.getByTestId('project-redo').click();
    await waitCompute(page, beforeRedo);
    const afterRedo = await page.evaluate(() => {
      const sim = window.__SIM__;
      const gridRow = (sim?.motifRowOrigin ?? 0) + 90;
      return sim?.getStitch(42, gridRow)?.color.toLowerCase() ?? '';
    });
    expect(afterRedo).toBe('#1d1d1b');

    // Lien de partage (hash auto) → rouvrir → même trait
    await page.waitForFunction(() => window.location.hash.startsWith('#p=2.'), null, { timeout: 10_000 });
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash.startsWith('#p=2.')).toBe(true);

    await page.goto(`/${hash}`);
    await waitReady(page);
    const restored = await page.evaluate(() => {
      const sim = window.__SIM__;
      const gridRow = (sim?.motifRowOrigin ?? 0) + 90;
      return {
        c42: sim?.getStitch(42, gridRow)?.color.toLowerCase() ?? '',
        c43: sim?.getStitch(43, gridRow)?.color.toLowerCase() ?? '',
        hasDessin: sim?.design.layers.some((l) => l.kind === 'dessin') ?? false,
      };
    });
    expect(restored.hasDessin).toBe(true);
    expect(restored.c42).toBe('#1d1d1b');
    expect(restored.c43).toBe('#1d1d1b');

    // Captures 2D / 3D dos (recharger en ?dev pour toolbars)
    await page.goto(`/?dev${hash}`);
    await waitReady(page);
    await page.evaluate(() => {
      window.__SIM__?.flatRevealMotif(42, 90);
    });
    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-t72-achille-2d.png' });
    copyCapture('visuel-t72-achille-2d.png');

    await page.keyboard.press('KeyD');
    await page.waitForFunction(() => {
      const p = window.__SIM__?.cameraPosition;
      return p != null && Math.abs(p.z) > 0.01;
    });
    await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-t72-achille-3d-dos.png' });
    copyCapture('visuel-t72-achille-3d-dos.png');

    expect(errors).toEqual([]);
  });

  test('crayon symétrie, pot visible, pipette', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await page.getByTestId('dock-add-dessin').click();
    await expect(page.getByTestId('dessin-toolbar')).toBeVisible({ timeout: 30_000 });

    // Symétrie Devant ↔ Dos + crayon
    await page.getByTestId('dessin-tool-crayon').click();
    await page.getByTestId('dessin-symmetry').selectOption('devant-dos');
    await page.getByTestId('dessin-thickness').fill('1');

    await page.evaluate(() => window.__SIM__?.flatRevealMotif(30, 50));
    await page.waitForFunction(() => window.__SIM__?.flatMotifCenter(30, 50) != null);
    const pt = await page.evaluate(() => window.__SIM__!.flatMotifCenter(30, 50)!);
    const box = await page.getByTestId('flat-canvas').boundingBox();
    expect(box).toBeTruthy();
    const before = await computeId(page);
    await page.mouse.click(box!.x + pt.x, box!.y + pt.y);
    await waitCompute(page, before);

    const mirror = await page.evaluate(() => {
      const sim = window.__SIM__;
      const origin = sim?.motifRowOrigin ?? 0;
      // axe W/4 = 42 → miroir de 30 = 2*42 - 30 - 1 = 53
      return {
        a: sim?.getStitch(30, origin + 50)?.color.toLowerCase() ?? '',
        b: sim?.getStitch(53, origin + 50)?.color.toLowerCase() ?? '',
      };
    });
    expect(mirror.a).toBe('#1d1d1b');
    expect(mirror.b).toBe('#1d1d1b');

    // Pipette
    await page.getByTestId('dessin-tool-pipette').click();
    await page.mouse.click(box!.x + pt.x, box!.y + pt.y);
    const bg = await page.getByTestId('dessin-color').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg.replace(/\s/g, '')).toMatch(/rgb\(29,29,27\)/i);

    expect(errors).toEqual([]);
  });
});
