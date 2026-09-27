import { expect, test, type Page } from '@playwright/test';

/**
 * T60 — palette unique + Fond remplace la couleur du pied.
 * Actions à la souris ; `__SIM__` en lecture seule.
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

async function layerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const design = window.__SIM__?.design as { layers?: Array<{ id: string }> } | undefined;
    return (design?.layers ?? []).map((l) => l.id);
  });
}

async function useSockMotif(page: Page, collectionId: string): Promise<string> {
  const list = await layerIds(page);
  expect(list.length).toBeGreaterThanOrEqual(2);
  const motifId = list[1]!;
  await page.getByTestId(`layer-card-${motifId}`).click();
  await expect(page.getByTestId('section-collections')).toBeVisible();
  await page.getByTestId('coll-search').fill(collectionId);
  const before = await computeId(page);
  await page.getByTestId(`coll-item-${collectionId}`).click();
  await waitCompute(page, before);
  return motifId;
}

async function addMotifFromLibrary(page: Page, collectionId: string): Promise<string> {
  const before = await computeId(page);
  await page.getByTestId('dock-add-motif').click();
  await expect(page.getByTestId('library-dialog')).toBeVisible();
  await page.getByTestId('lib-search').fill(collectionId);
  await page.getByTestId(`lib-collection-${collectionId}`).click();
  await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
  await waitCompute(page, before);
  const ids = await layerIds(page);
  return ids[ids.length - 1]!;
}

async function setFondYarn(page: Page, yarnId: string): Promise<void> {
  const before = await computeId(page);
  await page.getByTestId('layer-card-fond').click();
  await expect(page.getByTestId('section-fond')).toBeVisible();
  await page.getByTestId(`fond-yarn-${yarnId}`).click();
  await waitCompute(page, before);
}

async function layerColorChips(page: Page, layerId: string): Promise<string[]> {
  await page.getByTestId(`layer-card-${layerId}`).click();
  await expect(page.getByTestId('section-transparence')).toBeVisible();
  return page.locator('[data-testid^="layer-color-"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.testid?.replace('layer-color-', '') ?? ''),
  );
}

test.describe('T60 palette bandeau et Fond', () => {
  test('bandeau : recouvrement, transparence, curseur couleurs', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    // Motif du dessous : Fleurs (7 couleurs) — trop pour la machine si visible.
    await useSockMotif(page, 'fleurs-roda');
    // Motif du dessus : Jardin (2 couleurs) qui recouvre tout.
    const topId = await addMotifFromLibrary(page, 'jardin-d-dazur');

    await page.getByTestId('tab-chaussette').click();
    await expect(page.getByTestId('ctl-palette-mode')).toHaveValue('calques');
    // Curseur « Couleurs du motif » masqué en mode calques.
    await expect(page.getByTestId('ctl-max-colors')).toBeHidden();
    // Le dessus masque les 7 couleurs → pas de bandeau.
    await expect(page.getByTestId('stack-palette-banner')).toBeHidden();

    await page.screenshot({ path: 'test-results/visuel-T60-pas-bandeau.png' });

    // Rendre transparentes les couleurs du Motif du dessus → Fleurs apparaît (> 6).
    const chips = await layerColorChips(page, topId);
    expect(chips.length).toBeGreaterThanOrEqual(2);
    for (const hex of chips) {
      const before = await computeId(page);
      await page.getByTestId(`layer-color-${hex}`).click();
      await waitCompute(page, before);
    }

    await page.getByTestId('tab-chaussette').click();
    await expect(page.getByTestId('stack-palette-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('stack-palette-reduce')).toBeVisible();
    await page.screenshot({ path: 'test-results/visuel-T60-bandeau.png' });

    const beforeReduce = await computeId(page);
    await page.getByTestId('stack-palette-reduce').click();
    await waitCompute(page, beforeReduce);
    await expect(page.getByTestId('stack-palette-banner')).toBeHidden();
    const paletteLen = await page.evaluate(() => window.__SIM__!.patternPalette.length);
    expect(paletteLen).toBeLessThanOrEqual(6);
    expect(paletteLen).toBeGreaterThan(0);

    // Curseur visible en mode manuel (après Réduire).
    await expect(page.getByTestId('ctl-palette-mode')).toHaveValue('manuelle');
    await expect(page.getByTestId('ctl-max-colors')).toBeVisible();

    // Retour calques → curseur masqué.
    const beforeMode = await computeId(page);
    await page.getByTestId('ctl-palette-mode').selectOption('calques');
    await waitCompute(page, beforeMode);
    await expect(page.getByTestId('ctl-max-colors')).toBeHidden();

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });

  test('pied uni = couleur du Fond ; plus de ctl-foot-color', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await useSockMotif(page, 'Dunes');

    await page.getByTestId('tab-chaussette').click();
    await expect(page.getByTestId('ctl-foot-color')).toHaveCount(0);

    let before = await computeId(page);
    await page.getByTestId('ctl-pattern-foot').uncheck();
    await waitCompute(page, before);

    await setFondYarn(page, 'BK001'); // noir onyx
    const fondHex = await page.evaluate(() => {
      const design = window.__SIM__!.design as unknown as {
        layers: Array<{ kind: string; color?: string }>;
      };
      const fond = design.layers.find((l) => l.kind === 'fond');
      return fond?.color?.toLowerCase() ?? '';
    });
    expect(fondHex).toBe('#1a1a1a');

    const footColor = await page.evaluate(() => {
      const sim = window.__SIM__!;
      for (let row = 0; row < sim.grid.height; row++) {
        for (let col = 0; col < sim.grid.width; col++) {
          const s = sim.getStitch(col, row);
          // Zone.Foot = 3 (voir types.ts)
          if (s && s.zone === 3) return s.color.toLowerCase();
        }
      }
      return null;
    });
    expect(footColor).toBe(fondHex);

    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-T60-pied-fond.png' });

    // Autre couleur de Fond → le pied suit.
    before = await computeId(page);
    await setFondYarn(page, 'BL017');
    const fond2 = await page.evaluate(() => {
      const design = window.__SIM__!.design as unknown as {
        layers: Array<{ kind: string; color?: string }>;
      };
      return design.layers.find((l) => l.kind === 'fond')?.color?.toLowerCase() ?? '';
    });
    const foot2 = await page.evaluate(() => {
      const sim = window.__SIM__!;
      for (let row = 0; row < sim.grid.height; row++) {
        for (let col = 0; col < sim.grid.width; col++) {
          const s = sim.getStitch(col, row);
          if (s && s.zone === 3) return s.color.toLowerCase();
        }
      }
      return null;
    });
    expect(foot2).toBe(fond2);
    expect(fond2).toBe('#39507f');

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
