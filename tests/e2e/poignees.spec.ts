import { expect, test, type Page } from '@playwright/test';
import { dockAdd } from './helpers/dock';

/**
 * T56 — vue 2D : grille réelle et poignées (souris uniquement pour les actions).
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
  await dockAdd(page, 'image');
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

async function imageLayer(
  page: Page,
  id: string,
): Promise<{ x: number; y: number; widthStitches: number; rotation: number }> {
  return page.evaluate((layerId) => {
    const layer = window.__SIM__!.design.layers.find((l) => l.id === layerId && l.kind === 'image') as
      | { x: number; y: number; widthStitches: number; rotation: number }
      | undefined;
    if (!layer) throw new Error('Calque image introuvable');
    return {
      x: layer.x,
      y: layer.y,
      widthStitches: layer.widthStitches,
      rotation: layer.rotation,
    };
  }, id);
}

async function motifLayoutOffset(page: Page, id: string): Promise<number> {
  return page.evaluate((layerId) => {
    const layer = window.__SIM__!.design.layers.find((l) => l.id === layerId && l.kind === 'motif') as
      | { layout: { offsetStitches: number } }
      | undefined;
    return layer?.layout.offsetStitches ?? 0;
  }, id);
}

async function findImageStitch(
  page: Page,
  imageId: string,
): Promise<{ col: number; motifRow: number; color: string }> {
  const handle = await page.waitForFunction(
    ({ layerId }) => {
      const sim = window.__SIM__;
      if (!sim) return null;
      for (let motifRow = 0; motifRow < 200; motifRow += 1) {
        for (let col = 0; col < sim.grid.width; col += 1) {
          if (sim.stackLayerAt(col, motifRow) !== layerId) continue;
          const read = sim.getStitch(col, sim.motifRowOrigin + motifRow);
          if (!read) continue;
          return { col, motifRow, color: read.color.toLowerCase() };
        }
      }
      return null;
    },
    { layerId: imageId },
    { timeout: 60_000 },
  );
  return handle.jsonValue() as Promise<{ col: number; motifRow: number; color: string }>;
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
  await page.mouse.move(box!.x + to.x, box!.y + to.y, { steps: 15 });
  await page.mouse.up();
}

test.describe('T56 poignées vue 2D', () => {
  test('déplacer, tourner, agrandir une image ; décaler un Motif ; bande', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    const imageId = await addExampleImage(page);

    const witness = await findImageStitch(page, imageId);
    await page.evaluate(
      ({ c, r }) => window.__SIM__!.flatRevealMotif(c, r),
      { c: witness.col, r: witness.motifRow },
    );
    await page.getByTestId(`layer-card-${imageId}`).click();
    const g0 = await page.evaluate((id) => window.__SIM__!.gizmoClient(id), imageId);
    expect(g0?.imageCenter).toBeTruthy();
    const start = g0!.imageCenter!;
    const cellW = 4;
    const xBefore = (await imageLayer(page, imageId)).x;
    let compute = await computeId(page);
    await dragOnFlat(page, start, { x: start.x + 20 * cellW, y: start.y });
    await waitCompute(page, compute);
    const xAfter = (await imageLayer(page, imageId)).x;
    const width = await page.evaluate(() => window.__SIM__!.grid.width);
    const delta = ((xAfter - xBefore) % width + width) % width;
    expect(delta).toBeGreaterThanOrEqual(19);
    expect(delta).toBeLessThanOrEqual(21);

    const targetCol = (witness.col + 20) % width;
    expect(await page.evaluate(
      ({ c, r, id }) => window.__SIM__!.stackLayerAt(c, r) === id,
      { c: targetCol, r: witness.motifRow, id: imageId },
    )).toBe(true);
    expect(await page.evaluate(
      ({ c, r, id }) => window.__SIM__!.stackLayerAt(c, r) === id,
      { c: witness.col, r: witness.motifRow, id: imageId },
    )).toBe(false);

    const gizmo = await page.evaluate((id) => window.__SIM__!.gizmoClient(id), imageId);
    expect(gizmo?.rotate && gizmo.imageCenter).toBeTruthy();
    compute = await computeId(page);
    await dragOnFlat(
      page,
      gizmo!.rotate!,
      { x: gizmo!.imageCenter!.x + 48, y: gizmo!.imageCenter!.y },
    );
    await waitCompute(page, compute);
    const afterRot = await imageLayer(page, imageId);
    expect(Math.abs(afterRot.rotation - 90)).toBeLessThanOrEqual(1);

    const beforeW = afterRot.widthStitches;
    const g2 = await page.evaluate((id) => window.__SIM__!.gizmoClient(id), imageId);
    expect(g2?.scaleCorner && g2.imageCenter).toBeTruthy();
    const cx = g2!.imageCenter!.x;
    const cy = g2!.imageCenter!.y;
    const sx = g2!.scaleCorner!.x;
    const sy = g2!.scaleCorner!.y;
    const dist0 = Math.hypot(sx - cx, sy - cy);
    compute = await computeId(page);
    await dragOnFlat(
      page,
      { x: sx, y: sy },
      { x: cx + (sx - cx) * 2, y: cy + (sy - cy) * 2 },
    );
    await waitCompute(page, compute);
    const afterW = (await imageLayer(page, imageId)).widthStitches;
    expect(afterW / beforeW).toBeGreaterThan(1.9);
    expect(afterW / beforeW).toBeLessThan(2.1);
    void dist0;

    const motifId = await page.evaluate(() => {
      const m = window.__SIM__!.design.layers.find((l) => l.kind === 'motif');
      return m?.id ?? '';
    });
    await page.getByTestId(`layer-card-${motifId}`).click();
    const offsetBefore = await motifLayoutOffset(page, motifId);
    const mg = await page.evaluate((id) => window.__SIM__!.gizmoClient(id), motifId);
    expect(mg?.motifMove).toBeTruthy();
    compute = await computeId(page);
    await dragOnFlat(
      page,
      mg!.motifMove!,
      { x: mg!.motifMove!.x + 28, y: mg!.motifMove!.y + 10 },
    );
    await waitCompute(page, compute);
    expect(await motifLayoutOffset(page, motifId)).not.toBe(offsetBefore);

    await page.getByTestId('ctl-bounds-bande').click();
    await page.waitForFunction(
      (id) => {
        const layer = window.__SIM__!.design.layers.find((l) => l.id === id && l.kind === 'motif') as
          | { bounds?: { kind: string } }
          | undefined;
        return layer?.bounds?.kind === 'bande';
      },
      motifId,
      { timeout: 30_000 },
    );
    const bandBefore = await page.evaluate((id) => {
      const layer = window.__SIM__!.design.layers.find((l) => l.id === id && l.kind === 'motif') as
        | { bounds: { kind: string; toRow?: number } }
        | undefined;
      return layer?.bounds.kind === 'bande' ? layer.bounds.toRow : 0;
    }, motifId);
    const bg = await page.evaluate((id) => window.__SIM__!.gizmoClient(id), motifId);
    expect(bg?.bandBottom).toBeTruthy();
    compute = await computeId(page);
    await dragOnFlat(
      page,
      bg!.bandBottom!,
      { x: bg!.bandBottom!.x, y: bg!.bandBottom!.y + 40 },
    );
    await waitCompute(page, compute);
    const bandAfter = await page.evaluate((id) => {
      const layer = window.__SIM__!.design.layers.find((l) => l.id === id && l.kind === 'motif') as
        | { bounds: { kind: string; toRow?: number } }
        | undefined;
      return layer?.bounds.kind === 'bande' ? layer.bounds.toRow : 0;
    }, motifId);
    expect(bandAfter).toBeGreaterThan(bandBefore ?? 0);

    await page.getByTestId(`layer-card-${imageId}`).click();
    await page.getByTestId(`layer-card-${motifId}`).click();
    await page.getByTestId('flat-canvas').screenshot({ path: 'test-results/visuel-T56-poignees.png' });

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
