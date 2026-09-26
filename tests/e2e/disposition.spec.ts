import { expect, test, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function zoneBoxes(page: Page) {
  const ids = [
    'project-bar',
    'view2d-wrap',
    'view3d-wrap',
    'panel',
    'layers-dock',
    'toolbar-2d',
    'toolbar-3d',
    'options-tabs',
  ] as const;
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const id of ids) {
    const box = await page.getByTestId(id).boundingBox();
    if (!box) throw new Error(`zone absente: ${id}`);
    out[id] = box;
  }
  return out;
}

test.describe('T53 disposition', () => {
  test('1440×900 : zones sans chevauchement, pas de scroll, aspect 3D', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?dev');
    await waitReady(page);

    const scroll = await page.evaluate(() => {
      const el = document.scrollingElement;
      return {
        scrollHeight: el?.scrollHeight ?? 0,
        innerHeight: window.innerHeight,
      };
    });
    expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.innerHeight + 1);

    const boxes = await zoneBoxes(page);
    const pairs: Array<[keyof typeof boxes, keyof typeof boxes]> = [
      ['view2d-wrap', 'view3d-wrap'],
      ['view2d-wrap', 'panel'],
      ['view3d-wrap', 'panel'],
      ['view2d-wrap', 'layers-dock'],
      ['view3d-wrap', 'layers-dock'],
      ['panel', 'layers-dock'],
      ['project-bar', 'view2d-wrap'],
      ['project-bar', 'view3d-wrap'],
      ['project-bar', 'panel'],
      ['toolbar-2d', 'toolbar-3d'],
      ['toolbar-2d', 'options-tabs'],
      ['toolbar-3d', 'options-tabs'],
    ];
    for (const [a, b] of pairs) {
      expect(boxesOverlap(boxes[a]!, boxes[b]!), `${a} chevauche ${b}`).toBe(false);
    }

    // Déplacer le séparateur 2D|3D à la souris
    const splitV = page.getByTestId('split-v');
    const splitBox = await splitV.boundingBox();
    if (!splitBox) throw new Error('split-v absent');
    await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + splitBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(splitBox.x - 80, splitBox.y + splitBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    // Republier l'aspect après resize
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(150);

    const aspectAfterSplit = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="sock-canvas"]') as HTMLCanvasElement | null;
      const sim = window.__SIM__;
      if (!canvas || !sim) return null;
      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      return { canvas: w / h, camera: sim.cameraAspect };
    });
    expect(aspectAfterSplit).not.toBeNull();
    expect(Math.abs(aspectAfterSplit!.canvas - aspectAfterSplit!.camera)).toBeLessThan(
      aspectAfterSplit!.camera * 0.01 + 0.01,
    );

    // Séparateur vues|options
    const splitH = page.getByTestId('split-h');
    const hBox = await splitH.boundingBox();
    if (!hBox) throw new Error('split-h absent');
    await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hBox.x - 60, hBox.y + hBox.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const aspectAfterOpts = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="sock-canvas"]') as HTMLCanvasElement | null;
      const sim = window.__SIM__;
      if (!canvas || !sim) return null;
      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      return { canvas: w / h, camera: sim.cameraAspect };
    });
    expect(aspectAfterOpts).not.toBeNull();
    expect(Math.abs(aspectAfterOpts!.canvas - aspectAfterOpts!.camera)).toBeLessThan(
      aspectAfterOpts!.camera * 0.01 + 0.01,
    );

    await page.screenshot({ path: 'test-results/visuel-T53-disposition-1440.png', fullPage: true });
  });

  test('1100×800 : empilement, pas de chevauchement', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/?dev');
    await waitReady(page);

    const scroll = await page.evaluate(() => {
      const el = document.scrollingElement;
      return {
        scrollHeight: el?.scrollHeight ?? 0,
        innerHeight: window.innerHeight,
      };
    });
    expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.innerHeight + 1);

    const boxes = await zoneBoxes(page);
    // À 1100 : 2D au-dessus de 3D
    expect(boxes['view2d-wrap']!.y + boxes['view2d-wrap']!.height).toBeLessThanOrEqual(
      boxes['view3d-wrap']!.y + 2,
    );
    expect(boxesOverlap(boxes['view2d-wrap']!, boxes['view3d-wrap']!)).toBe(false);
    expect(boxesOverlap(boxes['view3d-wrap']!, boxes['panel']!)).toBe(false);
    expect(boxesOverlap(boxes['panel']!, boxes['layers-dock']!)).toBe(false);

    // Redimensionner la fenêtre et revérifier l'aspect
    await page.setViewportSize({ width: 1000, height: 750 });
    await page.waitForTimeout(200);
    const aspect = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="sock-canvas"]') as HTMLCanvasElement | null;
      const sim = window.__SIM__;
      if (!canvas || !sim) return null;
      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      return { canvas: w / h, camera: sim.cameraAspect };
    });
    expect(aspect).not.toBeNull();
    expect(Math.abs(aspect!.canvas - aspect!.camera)).toBeLessThan(aspect!.camera * 0.01 + 0.01);

    await page.setViewportSize({ width: 1100, height: 800 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'test-results/visuel-T53-disposition-1100.png', fullPage: true });
  });
});
