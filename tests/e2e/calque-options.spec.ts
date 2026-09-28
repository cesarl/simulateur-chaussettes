import { expect, test, type Page } from '@playwright/test';
import { dockAdd } from './helpers/dock';

/**
 * T55 — options du calque sélectionné.
 * Les actions testées se font **à la souris** (`click`, `page.mouse.*`) ;
 * `window.__SIM__` ne sert qu'à lire l'état (dimensions, calques, palette).
 */

/** Blanc WT000 et jaune YL001 du nuancier ; bleu BL017 et noir BK001 pour le Fond. */
const BLANC = '#f7f7f7';
const JAUNE = '#f6b02c';
const FOND_BLEU = '#39507f'; // BL017
const FOND_NOIR = '#1a1a1a'; // BK001

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

interface LayerRead {
  id: string;
  kind: string;
  transparentColors: string[];
  bounds?: { kind: string; fromRow?: number; toRow?: number };
}

async function layers(page: Page): Promise<LayerRead[]> {
  return page.evaluate(() => {
    const design = window.__SIM__?.design as { layers?: LayerRead[] } | undefined;
    return (design?.layers ?? []).map((l) => ({
      id: l.id,
      kind: l.kind,
      transparentColors: l.transparentColors ?? [],
      bounds: l.bounds,
    })) as LayerRead[];
  });
}

async function dimensions(page: Page): Promise<{ cuffRows: number; legRows: number; cuffEnabled: boolean }> {
  return page.evaluate(() => {
    const design = window.__SIM__!.design;
    return {
      cuffRows: design.dimensions.cuffRows,
      legRows: design.dimensions.legRows,
      cuffEnabled: design.zones.cuffEnabled,
    };
  });
}

interface StitchRead {
  col: number;
  row: number;
  /** Couleur de la maille dans la grille dessinée par la vue 2D. */
  color: string;
  /** Pixel réellement peint au centre de la maille (assombri si le contrôle des flottés l'a signalée). */
  paint: [number, number, number];
}

/**
 * Lit une maille de la vue 2D : sa couleur de grille et le pixel peint.
 * La vue 2D pose un voile noir à 35 % sur les mailles prises dans un flotté trop long,
 * donc le pixel peint n'est pas toujours la couleur exacte : on vérifie la teinte.
 */
async function readStitch(page: Page, col: number, row: number): Promise<StitchRead | null> {
  return page.evaluate(({ col: c, row: r }) => {
    const sim = window.__SIM__;
    const canvas = document.querySelector('[data-testid="flat-canvas"]');
    if (!sim || !(canvas instanceof HTMLCanvasElement)) return null;
    const context = canvas.getContext('2d');
    const read = sim.getStitch(c, r);
    const point = sim.flatCenter(c, r);
    if (!context || !read || !point) return null;
    const data = context.getImageData(point.x, point.y, 1, 1).data;
    return {
      col: c,
      row: r,
      color: read.color.toLowerCase(),
      paint: [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0] as [number, number, number],
    };
  }, { col, row });
}

/** Première maille de la vue 2D (visible dans le canvas) dont la couleur de grille est `hex`. */
async function findStitch(
  page: Page,
  hex: string,
  fromRow: number,
  toRow: number,
): Promise<StitchRead | null> {
  return page.evaluate(({ hex: target, fromRow: from, toRow: to }) => {
    const sim = window.__SIM__;
    const canvas = document.querySelector('[data-testid="flat-canvas"]');
    if (!sim || !(canvas instanceof HTMLCanvasElement)) return null;
    const context = canvas.getContext('2d');
    if (!context) return null;
    for (let row = from; row < to; row++) {
      for (let col = 0; col < sim.grid.width; col++) {
        const read = sim.getStitch(col, row);
        if (!read || read.color.toLowerCase() !== target) continue;
        const point = sim.flatCenter(col, row);
        if (!point) continue;
        const data = context.getImageData(point.x, point.y, 1, 1).data;
        return {
          col,
          row,
          color: read.color.toLowerCase(),
          paint: [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0] as [number, number, number],
        };
      }
    }
    return null;
  }, { hex, fromRow, toRow });
}

/** Couleurs de grille (vue 2D) d'un rang entier, colonnes visibles seulement. */
async function rowColors(page: Page, row: number): Promise<string[]> {
  return page.evaluate((r) => {
    const sim = window.__SIM__;
    if (!sim) return [];
    const colors: string[] = [];
    for (let col = 0; col < sim.grid.width; col++) {
      const read = sim.getStitch(col, r);
      if (read && sim.flatCenter(col, r)) colors.push(read.color.toLowerCase());
    }
    return colors;
  }, row);
}

async function addMotifFromLibrary(page: Page, collectionId: string): Promise<string> {
  const before = await computeId(page);
  await dockAdd(page, 'motif');
  await expect(page.getByTestId('library-dialog')).toBeVisible();
  await page.getByTestId(`lib-collection-${collectionId}`).click();
  await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
  await waitCompute(page, before);
  const list = await layers(page);
  return list[list.length - 1]!.id;
}

/**
 * Sélectionne le Motif déjà présent dans la chaussette (pile Fond + Motif)
 * et lui donne une collection : ce qui est dessous est alors forcément le Fond.
 */
async function useSockMotif(page: Page, collectionId: string): Promise<string> {
  const list = await layers(page);
  expect(list.map((l) => l.kind)).toEqual(['fond', 'motif']);
  const motifId = list[1]!.id;
  await page.getByTestId(`layer-card-${motifId}`).click();
  await expect(page.getByTestId('section-collections')).toBeVisible();
  await page.getByTestId('coll-search').fill(collectionId);
  const before = await computeId(page);
  await page.getByTestId(`coll-item-${collectionId}`).click();
  await waitCompute(page, before);
  return motifId;
}

/** Choisit un fil du nuancier pour le Fond (carte du dock, puis pastille). */
async function setFondYarn(page: Page, yarnId: string): Promise<void> {
  const before = await computeId(page);
  await page.getByTestId('layer-card-fond').click();
  await expect(page.getByTestId('section-fond')).toBeVisible();
  await page.getByTestId(`fond-yarn-${yarnId}`).click();
  await waitCompute(page, before);
}

/** Change la couleur d'une zone du Motif par le nuancier (souris). */
async function setZoneYarn(page: Page, zone: string, yarnId: string): Promise<void> {
  const before = await computeId(page);
  await page.getByTestId(`zone-swatch-${zone}`).click();
  await expect(page.getByTestId('nuancier-picker')).toBeVisible();
  await page.getByTestId(`nuancier-${yarnId}`).click();
  await waitCompute(page, before);
}

test.describe('T55 options du calque', () => {
  test('Motif jaune et blanc : le blanc rendu transparent laisse voir le Fond', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    const motifId = await useSockMotif(page, 'Dunes');
    await setZoneYarn(page, 'zone-1', 'WT000'); // blanc
    await setZoneYarn(page, 'zone-2', 'YL001'); // jaune
    await setFondYarn(page, 'BL017'); // bleu distant, pour reconnaître le Fond

    // Retour sur le Motif : ses options (dont les pastilles) s'affichent.
    await page.getByTestId(`layer-card-${motifId}`).click();
    await expect(page.getByTestId('motif-options')).toBeVisible();
    await expect(page.getByTestId('section-transparence')).toBeVisible();
    await expect(page.getByTestId(`layer-color-${BLANC.slice(1)}`)).toBeVisible();
    await expect(page.getByTestId(`layer-color-${JAUNE.slice(1)}`)).toBeVisible();

    // Une maille blanche de la tige, repérée dans la vue 2D.
    const dims = await dimensions(page);
    const top = dims.cuffEnabled ? dims.cuffRows : 0;
    const witness = await findStitch(page, BLANC, top + 2, top + dims.legRows);
    expect(witness, 'une maille blanche doit exister dans la vue 2D').not.toBeNull();
    // Peinte en gris neutre (blanc, éventuellement voilé par l'alerte de flotté).
    expect(witness!.paint[0]).toBe(witness!.paint[2]);

    // Un clic sur la pastille blanche : la couleur devient transparente.
    let compute = await computeId(page);
    await page.getByTestId(`layer-color-${BLANC.slice(1)}`).click();
    await waitCompute(page, compute);
    await expect(page.getByTestId(`layer-color-${BLANC.slice(1)}`)).toHaveAttribute('aria-pressed', 'true');
    expect((await layers(page)).find((l) => l.id === motifId)?.transparentColors).toEqual([BLANC]);

    const after = await readStitch(page, witness!.col, witness!.row);
    expect(after?.color).toBe(FOND_BLEU);
    // Même maille, maintenant peinte dans un bleu (le Fond) et non plus en gris.
    expect(after!.paint[2]).toBeGreaterThan(after!.paint[0] + 15);
    expect(await page.evaluate(() => window.__SIM__!.grid.palette)).not.toContain(BLANC);

    await page.getByTestId('panel').screenshot({ path: 'test-results/visuel-T55-transparence.png' });

    // Second clic : la couleur est rétablie.
    compute = await computeId(page);
    await page.getByTestId(`layer-color-${BLANC.slice(1)}`).click();
    await waitCompute(page, compute);
    expect((await readStitch(page, witness!.col, witness!.row))?.color).toBe(BLANC);

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });

  test('Motif limité à une bande : hors de la bande, on voit le Fond', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    const motifId = await useSockMotif(page, 'Dunes');
    await setFondYarn(page, 'BK001'); // noir onyx : absent du motif
    await page.getByTestId(`layer-card-${motifId}`).click();
    await expect(page.getByTestId('section-etendue')).toBeVisible();

    // Le motif couvre tout : des mailles de la tige ne sont pas de la couleur du Fond.
    const dims = await dimensions(page);
    const top = dims.cuffEnabled ? dims.cuffRows : 0;
    const before = await rowColors(page, top + Math.round(dims.legRows * 0.7));
    expect(before.length).toBeGreaterThan(10);
    expect(before.some((color) => color !== FOND_NOIR)).toBe(true);

    // « Bande » puis réglage du rang bas au curseur, à la souris.
    let compute = await computeId(page);
    await page.getByTestId('ctl-bounds-bande').click();
    await waitCompute(page, compute);
    expect((await layers(page)).find((l) => l.id === motifId)?.bounds?.kind).toBe('bande');

    const slider = page.getByTestId('ctl-band-to-range');
    await expect(slider).toBeVisible();
    const box = (await slider.boundingBox())!;
    compute = await computeId(page);
    await page.mouse.move(box.x + box.width * 0.22, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.22, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await waitCompute(page, compute);

    const bounds = (await layers(page)).find((l) => l.id === motifId)?.bounds;
    expect(bounds?.kind).toBe('bande');
    const toRow = bounds?.toRow ?? 0;
    expect(toRow).toBeGreaterThan(4);
    expect(toRow).toBeLessThan(dims.legRows - 6);
    await expect(page.getByTestId('band-readout')).toContainText(`au rang ${toRow}`);
    await expect(page.getByTestId('band-readout')).toContainText('cm');

    // Dans la bande : le motif reste visible. Hors de la bande : seulement le Fond.
    const insideColors = await rowColors(page, top + Math.max(1, toRow - 3));
    const outsideColors = await rowColors(page, top + toRow + 6);
    expect(insideColors.length).toBeGreaterThan(10);
    expect(insideColors.some((color) => color !== FOND_NOIR)).toBe(true);
    expect(outsideColors.length).toBeGreaterThan(10);
    expect([...new Set(outsideColors)]).toEqual([FOND_NOIR]);
    // La maille hors bande est bien peinte en sombre dans la vue 2D.
    const painted = await readStitch(page, 8, top + toRow + 6);
    expect(painted?.color).toBe(FOND_NOIR);
    expect(painted!.paint[0]).toBeLessThan(90);

    await page.getByTestId('panel').screenshot({ path: 'test-results/visuel-T55-bande.png' });
    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });

  test('captures : options des trois types de calque et onglets du projet', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    // Motif
    const motifId = await addMotifFromLibrary(page, 'medina');
    await page.getByTestId(`layer-card-${motifId}`).click();
    await expect(page.getByTestId('tab-calque')).toHaveClass(/active/);
    await expect(page.getByTestId('layer-options-title')).toContainText('Motif');
    await expect(page.getByTestId('motif-options')).toBeVisible();
    await expect(page.getByTestId('section-collections')).toBeVisible();
    await expect(page.getByTestId('section-layout')).toBeVisible();
    await expect(page.getByTestId('section-etendue')).toBeVisible();
    await expect(page.getByTestId('section-transparence')).toBeVisible();
    await expect(page.getByTestId('section-fond')).toBeHidden();
    await expect(page.getByTestId('section-image')).toBeHidden();
    await page.getByTestId('panel').screenshot({ path: 'test-results/visuel-T55-options-motif.png' });

    // Fond
    await page.getByTestId('layer-card-fond').click();
    await expect(page.getByTestId('layer-options-title')).toContainText('Fond');
    await expect(page.getByTestId('section-fond')).toBeVisible();
    await expect(page.getByTestId('ctl-fond-color')).toBeVisible();
    await expect(page.getByTestId('fond-yarns')).toBeVisible();
    await expect(page.getByTestId('motif-options')).toBeHidden();
    await expect(page.getByTestId('section-transparence')).toBeHidden();
    await page.getByTestId('panel').screenshot({ path: 'test-results/visuel-T55-options-fond.png' });

    // Image
    let compute = await computeId(page);
    await dockAdd(page, 'image');
    await expect(page.getByTestId('library-dialog')).toBeVisible();
    await page.getByTestId('lib-image-example').click();
    await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
    await waitCompute(page, compute);
    await expect(page.getByTestId('layer-options-title')).toContainText('Image');
    await expect(page.getByTestId('section-image')).toBeVisible();
    await expect(page.getByTestId('image-preview')).toBeVisible();
    await expect(page.getByTestId('section-image-numbers')).toBeVisible();
    await expect(page.getByTestId('section-transparence')).toBeVisible();
    await expect(page.getByTestId('motif-options')).toBeHidden();

    // Miroir horizontal : réglage propre au calque Image.
    compute = await computeId(page);
    await page.getByTestId('ctl-image-flip-x').click();
    await waitCompute(page, compute);
    expect(
      await page.evaluate(() => {
        const design = window.__SIM__!.design as unknown as { layers: Array<{ kind: string; flipX?: boolean }> };
        return design.layers.filter((l) => l.kind === 'image').map((l) => l.flipX);
      }),
    ).toEqual([true]);
    await page.getByTestId('panel').screenshot({ path: 'test-results/visuel-T55-options-image.png' });

    // Onglets du projet.
    await page.getByTestId('tab-chaussette').click();
    await expect(page.getByTestId('pane-chaussette')).toBeVisible();
    await expect(page.getByTestId('section-dimensions')).toBeVisible();
    await expect(page.getByTestId('section-zones')).toBeVisible();
    await expect(page.getByTestId('section-pixels')).toBeVisible();
    await expect(page.getByTestId('section-checks')).toBeVisible();
    await expect(page.getByTestId('pane-calque')).toBeHidden();
    await expect(page.getByTestId('ctl-palette-mode')).toHaveValue('calques');
    await page.getByTestId('panel').screenshot({ path: 'test-results/visuel-T55-options-chaussette.png' });

    await page.getByTestId('tab-decor').click();
    await expect(page.getByTestId('section-decor')).toBeVisible();
    await expect(page.getByTestId('pane-chaussette')).toBeHidden();

    await page.getByTestId('tab-export').click();
    await expect(page.getByTestId('section-exports')).toBeVisible();
    await expect(page.getByTestId('export-run')).toBeVisible();
    await expect(page.getByTestId('pane-decor')).toBeHidden();

    await page.getByTestId('tab-calque').click();
    await expect(page.getByTestId('pane-calque')).toBeVisible();

    expect(errors.filter((message) => !/favicon/i.test(message))).toEqual([]);
  });
});
