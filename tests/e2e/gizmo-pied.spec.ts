import { expect, test, type Page } from '@playwright/test';

/**
 * T61 — cadre image sous le talon : conversions motif↔grille qui sautent le talon.
 * Actions à la souris ; `__SIM__` en lecture.
 */

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

async function addExampleImage(page: Page): Promise<string> {
  const before = await computeId(page);
  await page.getByTestId('dock-add-image').click();
  await expect(page.getByTestId('library-dialog')).toBeVisible();
  await page.getByTestId('lib-image-example').click();
  await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
  await waitCompute(page, before);
  const id = await page.evaluate(() => {
    const layers = window.__SIM__!.design.layers;
    const image = [...layers].reverse().find((l) => l.kind === 'image');
    return image?.id ?? '';
  });
  expect(id).not.toBe('');
  return id;
}

async function imageY(page: Page, id: string): Promise<number> {
  return page.evaluate((layerId) => {
    const layer = window.__SIM__!.design.layers.find((l) => l.id === layerId && l.kind === 'image') as
      | { y: number }
      | undefined;
    return layer?.y ?? -1;
  }, id);
}

async function dragOnFlat(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const box = await page.getByTestId('flat-canvas').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + from.x, box!.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box!.x + to.x, box!.y + to.y, { steps: 12 });
  await page.mouse.up();
}

test.describe('T61 cadre sous le talon', () => {
  test('glisser sous le talon : mailles owner dans le cadre ; clic centre sélectionne', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    const imageId = await addExampleImage(page);
    await page.getByTestId(`layer-card-${imageId}`).click();

    // Capture avant : image encore sur la tige.
    await page.evaluate((id) => {
      const layer = window.__SIM__!.design.layers.find((l) => l.id === id) as { x: number; y: number };
      window.__SIM__!.flatRevealMotif(layer.x, layer.y);
    }, imageId);
    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-T61-avant-pied.png' });

    // Glisser vers le bas à la souris, par étapes, jusqu'à passer sous le talon (y > 180).
    for (let attempt = 0; attempt < 10; attempt++) {
      const y = await imageY(page, imageId);
      if (y > 195) break;
      await page.evaluate((id) => {
        const layer = window.__SIM__!.design.layers.find((l) => l.id === id) as { x: number; y: number };
        window.__SIM__!.flatRevealMotif(layer.x, layer.y);
      }, imageId);
      const center = await page.evaluate((id) => window.__SIM__!.gizmoClient(id)?.imageCenter ?? null, imageId);
      expect(center, `centre visible tentative ${attempt}`).not.toBeNull();
      const before = await computeId(page);
      await dragOnFlat(page, center!, { x: center!.x, y: center!.y + 100 });
      await waitCompute(page, before);
    }

    const finalY = await imageY(page, imageId);
    expect(finalY).toBeGreaterThan(180);

    await page.evaluate((id) => {
      const layer = window.__SIM__!.design.layers.find((l) => l.id === id) as { x: number; y: number };
      window.__SIM__!.flatRevealMotif(layer.x, layer.y);
    }, imageId);
    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-T61-apres-pied.png' });

    // Mailles owner ⊆ cadre gizmo (polygone motif), tolérance 1 maille.
    const check = await page.evaluate((id) => {
      const sim = window.__SIM__!;
      const gizmo = sim.gizmoClient(id);
      const corners = gizmo?.motifCorners;
      if (!corners || corners.length < 4) return { ok: false, reason: 'corners' as const };
      const poly = corners;
      const W = sim.grid.width;
      const cuff = sim.design.dimensions.cuffRows;
      const leg = sim.design.dimensions.legRows;
      const heel = sim.design.dimensions.heelRows;

      function wrapDx(dx: number): number {
        return ((((dx + W / 2) % W) + W) % W) - W / 2;
      }
      /** Distance signée au polygone (négatif = dedans), en mailles, X circulaire. */
      function distOutside(col: number, row: number): number {
        let minOut = Infinity;
        let inside = true;
        for (let i = 0; i < poly.length; i++) {
          const [ax, ay] = poly[i]!;
          const [bx, by] = poly[(i + 1) % poly.length]!;
          const abx = wrapDx(bx - ax);
          const aby = by - ay;
          const apx = wrapDx(col - ax);
          const apy = row - ay;
          const cross = abx * apy - aby * apx;
          if (cross < 0) inside = false;
          const len = Math.hypot(abx, aby) || 1;
          const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (len * len)));
          const qx = wrapDx(ax + t * abx - col);
          const qy = ay + t * aby - row;
          minOut = Math.min(minOut, Math.hypot(qx, qy));
        }
        return inside ? -minOut : minOut;
      }

      let ownerCount = 0;
      let outside = 0;
      let maxDist = 0;
      for (let gridRow = 0; gridRow < sim.grid.height; gridRow++) {
        let motifRow: number | null = null;
        if (gridRow >= cuff && gridRow < cuff + leg) motifRow = gridRow - cuff;
        else if (gridRow >= cuff + leg + heel) {
          motifRow = leg + (gridRow - (cuff + leg + heel));
        }
        if (motifRow === null) continue;
        for (let col = 0; col < W; col++) {
          if (sim.stackLayerAt(col, motifRow) !== id) continue;
          ownerCount += 1;
          const d = distOutside(col + 0.5, motifRow + 0.5);
          if (d > 1.01) {
            outside += 1;
            maxDist = Math.max(maxDist, d);
          }
        }
      }
      const layer = sim.design.layers.find((l) => l.id === id) as unknown as { y: number };
      return { ok: outside === 0 && ownerCount > 0, ownerCount, outside, maxDist, y: layer.y };
    }, imageId);

    expect(check.ok, JSON.stringify(check)).toBe(true);
    if ('y' in check) expect(check.y).toBeGreaterThan(180);

    // Clic au centre → sélection.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`layer-card-${imageId}`)).toHaveAttribute('aria-selected', 'false');
    const center = await page.evaluate((id) => window.__SIM__!.gizmoClient(id)?.imageCenter ?? null, imageId);
    // Si plus sélectionnée, le gizmo peut être absent : révéler puis cliquer la maille owner.
    if (!center) {
      await page.evaluate((id) => {
        const layer = window.__SIM__!.design.layers.find((l) => l.id === id) as { x: number; y: number };
        window.__SIM__!.flatRevealMotif(layer.x, layer.y);
      }, imageId);
    }
    const clickAt = await page.evaluate((id) => {
      const sim = window.__SIM__!;
      const layer = sim.design.layers.find((l) => l.id === id) as unknown as { x: number; y: number };
      return sim.flatMotifCenter(Math.round(layer.x), Math.round(layer.y));
    }, imageId);
    expect(clickAt).not.toBeNull();
    const box = (await page.getByTestId('flat-canvas').boundingBox())!;
    await page.mouse.click(box.x + clickAt!.x, box.y + clickAt!.y);
    await expect(page.getByTestId(`layer-card-${imageId}`)).toHaveAttribute('aria-selected', 'true');

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
