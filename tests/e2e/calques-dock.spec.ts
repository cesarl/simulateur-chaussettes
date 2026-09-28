import { expect, test, type Locator, type Page } from '@playwright/test';
import { dockAdd } from './helpers/dock';

/**
 * T54 — dock des calques, à la souris uniquement pour les actions testées.
 * `window.__SIM__` ne sert qu'à lire l'état (ordre de pile, couleurs), jamais à agir.
 */

const CARD = '[data-testid^="layer-card-"]';

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

/** Ids des calques, du dessous vers le dessus (layers[0] = Fond). */
async function layerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const design = window.__SIM__?.design as { layers?: Array<{ id: string }> } | undefined;
    return (design?.layers ?? []).map((layer) => layer.id);
  });
}

async function layerStates(
  page: Page,
): Promise<Array<{ id: string; kind: string; name: string; hidden: boolean }>> {
  return page.evaluate(() => {
    const design = window.__SIM__?.design as
      | { layers?: Array<{ id: string; kind: string; name: string; hidden: boolean }> }
      | undefined;
    return (design?.layers ?? []).map((layer) => ({
      id: layer.id,
      kind: layer.kind,
      name: layer.name,
      hidden: layer.hidden,
    }));
  });
}

/** Couleurs lues DANS la vue 2D (bitmap du canvas) pour une liste de mailles. */
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

const WITNESS: Array<[number, number]> = [];
for (let col = 8; col <= 80; col += 12) {
  for (let row = 45; row <= 195; row += 25) WITNESS.push([col, row]);
}

async function addMotifFromLibrary(page: Page, collectionId: string): Promise<void> {
  const before = await computeId(page);
  await dockAdd(page, 'motif');
  await expect(page.getByTestId('library-dialog')).toBeVisible();
  await page.getByTestId(`lib-collection-${collectionId}`).click();
  await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
  await waitCompute(page, before);
}

async function addExampleImage(page: Page): Promise<void> {
  const before = await computeId(page);
  await dockAdd(page, 'image');
  await expect(page.getByTestId('library-dialog')).toBeVisible();
  await page.getByTestId('lib-image-example').click();
  await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
  await waitCompute(page, before);
}

/** Glisse la carte `from` sur le bord gauche de la carte `to`, à la souris. */
async function dragCardBefore(page: Page, from: Locator, to: Locator): Promise<void> {
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  if (!source || !target) throw new Error('carte introuvable');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 - 20, source.y + source.height / 2, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.move(target.x + 3, target.y + target.height / 2, { steps: 4 });
  await expect(page.getByTestId('dock-insert-marker')).toBeVisible();
  await page.mouse.up();
}

test.describe('T54 dock des calques', () => {
  test('ajouter 2 Motifs et 1 Image, réordonner, masquer, replier', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    // Au départ : Fond + le Motif du modèle de base.
    await expect(page.locator(CARD)).toHaveCount(2);

    await addMotifFromLibrary(page, 'medina');
    await addMotifFromLibrary(page, 'Dunes');
    await addExampleImage(page);

    const states = await layerStates(page);
    expect(states.filter((l) => l.kind === 'motif')).toHaveLength(3);
    expect(states.filter((l) => l.kind === 'image')).toHaveLength(1);
    await expect(page.locator(CARD)).toHaveCount(5);
    // Le Fond est la carte la plus à droite.
    const fondBox = await page.getByTestId('layer-card-fond').boundingBox();
    const others = await page.locator(`${CARD}:not([data-testid="layer-card-fond"])`).all();
    for (const card of others) {
      const box = await card.boundingBox();
      expect(box!.x).toBeLessThan(fondBox!.x);
    }

    // Supprimer le Motif vide du modèle de base par le menu « ⋯ ».
    const emptyId = (await layerIds(page))[1]!;
    let before = await computeId(page);
    await page.getByTestId(`layer-menu-${emptyId}`).click();
    await page.getByTestId(`layer-menu-delete-${emptyId}`).click();
    await waitCompute(page, before);
    await expect(page.locator(CARD)).toHaveCount(4);

    // Glisser la carte du bas (juste avant le Fond) tout en haut de la pile.
    const idsBefore = await layerIds(page);
    const bottomId = idsBefore[1]!;
    const topId = idsBefore[idsBefore.length - 1]!;
    const colorsBefore = await flatColors(page, WITNESS);
    expect(colorsBefore.length).toBeGreaterThan(4);

    before = await computeId(page);
    await dragCardBefore(
      page,
      page.getByTestId(`layer-card-${bottomId}`),
      page.getByTestId(`layer-card-${topId}`),
    );
    await waitCompute(page, before);

    const idsAfter = await layerIds(page);
    expect(idsAfter).not.toEqual(idsBefore);
    expect(idsAfter[idsAfter.length - 1]).toBe(bottomId);
    const colorsAfter = await flatColors(page, WITNESS);
    expect(colorsAfter.some((color, i) => color !== colorsBefore[i])).toBe(true);

    // Masquer puis démasquer le calque remonté (œil de sa carte).
    before = await computeId(page);
    await page.getByTestId(`layer-eye-${bottomId}`).click();
    await waitCompute(page, before);
    expect((await layerStates(page)).find((l) => l.id === bottomId)?.hidden).toBe(true);
    const colorsHidden = await flatColors(page, WITNESS);
    expect(colorsHidden.some((color, i) => color !== colorsAfter[i])).toBe(true);

    before = await computeId(page);
    await page.getByTestId(`layer-eye-${bottomId}`).click();
    await waitCompute(page, before);
    expect((await layerStates(page)).find((l) => l.id === bottomId)?.hidden).toBe(false);
    expect(await flatColors(page, WITNESS)).toEqual(colorsAfter);

    // Replier puis déplier.
    await page.getByTestId('dock-toggle').click();
    await expect(page.locator('#app')).toHaveClass(/dock-collapsed/);
    await expect(page.getByTestId('layers-dock-list')).toBeHidden();
    await expect(page.getByTestId('dock-selected-name')).toBeVisible();
    await expect(page.getByTestId('dock-selected-name')).not.toBeEmpty();
    await page.getByTestId('dock-toggle').click();
    await expect(page.locator('#app')).not.toHaveClass(/dock-collapsed/);
    await expect(page.getByTestId('layers-dock-list')).toBeVisible();

    await page.screenshot({ path: 'test-results/visuel-T54-dock-3-calques.png' });
    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });

  test('16 calques sans ascenseur, ajout refusé au-delà', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    // Deux duplications par le menu « ⋯ », le reste au clavier (Ctrl+D).
    for (let i = 0; i < 2; i += 1) {
      const id = (await layerIds(page))[1]!;
      const before = await computeId(page);
      await page.getByTestId(`layer-menu-${id}`).click();
      await page.getByTestId(`layer-menu-duplicate-${id}`).click();
      await waitCompute(page, before);
    }
    await expect(page.locator(CARD)).toHaveCount(4);

    // Focus sur une carte (pas le Fond) pour les raccourcis clavier du dock.
    await page.getByTestId(`layer-card-${(await layerIds(page))[1]}`).click();
    while ((await page.locator(CARD).count()) < 16) {
      const before = await computeId(page);
      await page.keyboard.press('Control+d');
      await waitCompute(page, before);
    }
    await expect(page.locator(CARD)).toHaveCount(16);

    const metrics = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="layers-dock-list"]');
      const dock = document.querySelector('[data-testid="layers-dock"]');
      if (!(list instanceof HTMLElement) || !(dock instanceof HTMLElement)) return null;
      return {
        listScroll: list.scrollWidth,
        listClient: list.clientWidth,
        dockScroll: dock.scrollWidth,
        dockClient: dock.clientWidth,
        bodyScroll: document.body.scrollWidth,
        bodyClient: document.body.clientWidth,
      };
    });
    expect(metrics).not.toBeNull();
    expect(metrics!.listScroll).toBeLessThanOrEqual(metrics!.listClient);
    expect(metrics!.dockScroll).toBeLessThanOrEqual(metrics!.dockClient);
    expect(metrics!.bodyScroll).toBeLessThanOrEqual(metrics!.bodyClient);

    // Au-delà de 16 : refus avec message.
    await dockAdd(page, 'motif');
    await expect(page.getByTestId('dock-message')).toContainText('16 calques au maximum');
    await expect(page.getByTestId('library-dialog')).toBeHidden();
    await expect(page.locator(CARD)).toHaveCount(16);

    await page.screenshot({ path: 'test-results/visuel-T54-dock-16-calques.png' });
    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });

  test('captures du dock : 3 puis 12 calques', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    // 3 calques : Fond + Motif (collection) + Image, après suppression du Motif vide.
    await addMotifFromLibrary(page, 'medina');
    await addExampleImage(page);
    const emptyId = (await layerIds(page))[1]!;
    let before = await computeId(page);
    await page.getByTestId(`layer-menu-${emptyId}`).click();
    await page.getByTestId(`layer-menu-delete-${emptyId}`).click();
    await waitCompute(page, before);
    await expect(page.locator(CARD)).toHaveCount(3);
    // Le Fond n’a ni œil ni menu, et ne se glisse pas.
    await expect(page.getByTestId('layer-eye-fond')).toBeHidden();
    await expect(page.getByTestId('layer-menu-fond')).toBeHidden();
    await page.getByTestId('layers-dock').screenshot({ path: 'test-results/visuel-T54-dock-3.png' });
    await page.getByTestId('layer-card-fond').screenshot({ path: 'test-results/visuel-T54-carte-fond.png' });
    const motifCard = (await layerIds(page))[1]!;
    await page
      .getByTestId(`layer-card-${motifCard}`)
      .screenshot({ path: 'test-results/visuel-T54-carte-motif.png' });

    // 12 calques par duplications (menu puis clavier).
    const motifId = (await layerIds(page))[1]!;
    await page.getByTestId(`layer-card-${motifId}`).click();
    while ((await page.locator(CARD).count()) < 12) {
      before = await computeId(page);
      await page.keyboard.press('Control+d');
      await waitCompute(page, before);
    }
    await expect(page.locator(CARD)).toHaveCount(12);
    await page.getByTestId('layers-dock').screenshot({ path: 'test-results/visuel-T54-dock-12.png' });

    // Barre fine repliée : elle affiche encore le calque sélectionné.
    await page.getByTestId('dock-toggle').click();
    await expect(page.locator('#app')).toHaveClass(/dock-collapsed/);
    await page.getByTestId('layers-dock').screenshot({ path: 'test-results/visuel-T54-dock-replie.png' });

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });

  test('renommer, menu monter/descendre, clavier, repli mémorisé', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    await addMotifFromLibrary(page, 'medina');
    const ids = await layerIds(page);
    const motifId = ids[ids.length - 1]!;

    // Clic sur la carte : sélection + onglet « Calque ».
    await page.getByTestId(`layer-card-${motifId}`).click();
    await expect(page.getByTestId(`layer-card-${motifId}`)).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('tab-calque')).toHaveClass(/active/);

    // Double-clic sur le nom : renommer.
    await page.getByTestId(`layer-name-${motifId}`).dblclick();
    const input = page.getByTestId(`layer-rename-${motifId}`);
    await expect(input).toBeVisible();
    await input.fill('Bandeau haut');
    await input.press('Enter');
    await expect(page.getByTestId(`layer-name-${motifId}`)).toHaveText('Bandeau haut');
    expect((await layerStates(page)).find((l) => l.id === motifId)?.name).toBe('Bandeau haut');

    // Menu « ⋯ » : descendre puis monter.
    let before = await computeId(page);
    await page.getByTestId(`layer-menu-${motifId}`).click();
    await page.getByTestId(`layer-menu-down-${motifId}`).click();
    await waitCompute(page, before);
    expect((await layerIds(page)).indexOf(motifId)).toBe(1);

    before = await computeId(page);
    await page.getByTestId(`layer-menu-${motifId}`).click();
    await page.getByTestId(`layer-menu-up-${motifId}`).click();
    await waitCompute(page, before);
    expect((await layerIds(page)).indexOf(motifId)).toBe(2);

    // Clavier dans le dock : ↓ / ↑ sélectionnent, H masque, Suppr supprime.
    await page.getByTestId(`layer-card-${motifId}`).click();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId(`layer-card-${motifId}`)).not.toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId(`layer-card-${motifId}`)).toHaveAttribute('data-selected', 'true');

    before = await computeId(page);
    await page.keyboard.press('h');
    await waitCompute(page, before);
    expect((await layerStates(page)).find((l) => l.id === motifId)?.hidden).toBe(true);

    before = await computeId(page);
    await page.keyboard.press('Delete');
    await waitCompute(page, before);
    expect((await layerIds(page)).includes(motifId)).toBe(false);

    // Le Fond ne se supprime jamais.
    await page.getByTestId('layer-card-fond').click();
    await page.keyboard.press('Delete');
    expect((await layerIds(page)).includes('fond')).toBe(true);

    // Repli mémorisé après rechargement.
    await page.getByTestId('dock-toggle').click();
    await expect(page.locator('#app')).toHaveClass(/dock-collapsed/);
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#app')).toHaveClass(/dock-collapsed/);
    await page.getByTestId('dock-toggle').click();
    await expect(page.locator('#app')).not.toHaveClass(/dock-collapsed/);

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
