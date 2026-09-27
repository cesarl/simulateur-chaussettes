import { expect, test, type Page } from '@playwright/test';

/** T67 — œil (transparence) et remplacement de couleurs. */

const BLANC = '#f7f7f7';

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

async function layers(page: Page): Promise<Array<{ id: string; kind: string }>> {
  return page.evaluate(() =>
    (window.__SIM__?.design?.layers ?? []).map((l) => ({ id: l.id, kind: l.kind })),
  );
}

/** Remplace la collection du Motif déjà présent (comme T55). */
async function useSockMotif(page: Page, collectionId: string): Promise<string> {
  const list = await layers(page);
  const motifId = list.find((l) => l.kind === 'motif')?.id;
  expect(motifId).toBeTruthy();
  await page.getByTestId(`layer-card-${motifId!}`).click();
  await expect(page.getByTestId('section-collections')).toBeVisible();
  await page.getByTestId('coll-search').fill(collectionId);
  const before = await computeId(page);
  await page.getByTestId(`coll-item-${collectionId}`).click();
  await waitCompute(page, before);
  return motifId!;
}

test('T67 œil Motif + Remplacer Image + lien', async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?dev');
  await waitReady(page);

  const motifId = await useSockMotif(page, 'Dunes');

  let before = await computeId(page);
  await page.getByTestId('zone-swatch-zone-1').click();
  await expect(page.getByTestId('nuancier-picker')).toBeVisible();
  await page.getByTestId('nuancier-WT000').click();
  await waitCompute(page, before);
  before = await computeId(page);
  await page.getByTestId('zone-swatch-zone-2').click();
  await page.getByTestId('nuancier-YL001').click();
  await waitCompute(page, before);

  before = await computeId(page);
  await page.getByTestId('layer-card-fond').click();
  await expect(page.getByTestId('section-fond')).toBeVisible();
  await page.getByTestId('fond-yarn-BL017').click();
  await waitCompute(page, before);
  const fondHex = await page.evaluate(() => {
    const fond = window.__SIM__?.design?.layers?.find((l) => l.kind === 'fond') as { color?: string } | undefined;
    return fond?.color?.toLowerCase() ?? '';
  });

  await page.getByTestId(`layer-card-${motifId}`).click();
  await expect(page.getByTestId('section-transparence')).toBeVisible();
  const whiteEye = page.getByTestId(`layer-color-${BLANC.slice(1)}`);
  await expect(whiteEye.first()).toBeVisible();
  before = await computeId(page);
  await whiteEye.first().click();
  await waitCompute(page, before);
  await expect(whiteEye.first()).toHaveAttribute('aria-pressed', 'true');

  const transparentOk = await page.evaluate(
    ({ id, blanc }) => {
      const layer = window.__SIM__?.design?.layers?.find((l) => l.id === id) as
        | { transparentColors?: string[] }
        | undefined;
      return (layer?.transparentColors ?? []).map((c) => c.toLowerCase()).includes(blanc);
    },
    { id: motifId, blanc: BLANC },
  );
  expect(transparentOk).toBe(true);

  const fondSeen = await page.evaluate((fond) => {
    const sim = window.__SIM__;
    if (!sim?.grid || !fond) return false;
    const top = sim.design.zones.cuffEnabled ? sim.design.dimensions.cuffRows : 0;
    for (let y = top + 2; y < top + sim.design.dimensions.legRows; y += 2) {
      for (let x = 0; x < sim.grid.width; x += 2) {
        if (sim.getStitch?.(x, y)?.color?.toLowerCase() === fond) return true;
      }
    }
    return false;
  }, fondHex);
  expect(fondSeen).toBe(true);

  await page.screenshot({ path: 'test-results/visuel-t67-motif-oeil.png' });

  // Image : Remplacer… une couleur principale.
  before = await computeId(page);
  await page.getByTestId('project-library').click();
  await page.getByTestId('lib-tab-images').click();
  await page.getByTestId('lib-bib-logo').click();
  await waitCompute(page, before);
  await page.keyboard.press('Escape');

  const imageId = await page.evaluate(() => {
    const img = window.__SIM__?.design?.layers?.find((l) => l.kind === 'image');
    return img?.id ?? '';
  });
  expect(imageId).toBeTruthy();
  await page.getByTestId(`layer-card-${imageId}`).click();
  await expect(page.getByTestId('section-transparence')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => page.locator('[data-testid^="layer-recolor-"]').count(), {
    timeout: 30_000,
  }).toBeGreaterThan(0);
  const recolorBtn = page.locator('[data-testid^="layer-recolor-"]').first();
  await expect(recolorBtn).toBeVisible();
  const fromHex = `#${(await recolorBtn.getAttribute('data-testid'))?.replace('layer-recolor-', '')}`;
  await recolorBtn.click();
  await expect(page.getByTestId('recolor-dialog')).toBeVisible();
  const sockChoice = page.locator('[data-testid^="recolor-sock-"]').first();
  await expect(sockChoice).toBeVisible();
  const toHex = `#${(await sockChoice.getAttribute('data-testid'))?.replace('recolor-sock-', '')}`;
  before = await computeId(page);
  await sockChoice.click();
  await waitCompute(page, before);

  const recolored = await page.evaluate(
    ({ from, to }) => {
      const layer = window.__SIM__?.design?.layers?.find((l) => l.kind === 'image') as
        | { recolor?: Record<string, string> }
        | undefined;
      const map = layer?.recolor ?? {};
      return Object.entries(map).some(
        ([k, v]) => k.toLowerCase() === from.toLowerCase() && v.toLowerCase() === to.toLowerCase(),
      );
    },
    { from: fromHex, to: toHex },
  );
  expect(recolored).toBe(true);

  const toPresent = await page.evaluate((hex) => {
    const sim = window.__SIM__;
    if (!sim?.grid) return false;
    for (let y = 0; y < sim.grid.height; y += 2) {
      for (let x = 0; x < sim.grid.width; x += 2) {
        if (sim.getStitch?.(x, y)?.color?.toLowerCase() === hex.toLowerCase()) return true;
      }
    }
    return false;
  }, toHex);
  expect(toPresent).toBe(true);

  await page.screenshot({ path: 'test-results/visuel-t67-image-recolor.png' });

  await page.getByTestId('panel-copy-link').click();
  const hash = await page.evaluate(() => location.hash);
  expect(hash.length).toBeGreaterThan(10);

  const viewer = await context.newPage();
  await viewer.goto(`/?dev${hash}`);
  await waitReady(viewer);
  const survived = await viewer.evaluate(() => {
    const list = window.__SIM__?.design?.layers ?? [];
    const motif = list.find((l) => l.kind === 'motif') as { transparentColors?: string[] } | undefined;
    const image = list.find((l) => l.kind === 'image') as { recolor?: Record<string, string> } | undefined;
    return {
      hasTransparent: (motif?.transparentColors?.length ?? 0) > 0,
      hasRecolor: Object.keys(image?.recolor ?? {}).length > 0,
    };
  });
  expect(survived.hasTransparent).toBe(true);
  expect(survived.hasRecolor).toBe(true);
  await viewer.close();
});
