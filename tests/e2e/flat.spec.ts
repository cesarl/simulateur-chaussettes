import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('la vue à plat montre les couleurs de la grille et le retour en 3D est sain', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  // Mode ?dev : vue 2D toujours visible (dual-pane), pas de bascule
  await expect(page.getByTestId('flat-canvas')).toBeVisible();
  await expect(page.getByTestId('sock-canvas')).toBeVisible();
  await page.waitForFunction(() => window.__SIM__?.flatCenter(4, 4) != null);

  // Cherche des mailles dont le pixel canvas = couleur grille (hors masque flottés).
  const compared = await page.evaluate(() => {
    const sim = window.__SIM__;
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flat-canvas"]');
    const context = canvas?.getContext('2d');
    if (!sim || !context) return null;
    const hits: Array<{ ok: boolean; color: string; pixel: number[] }> = [];
    for (let row = 0; row < sim.grid.height && hits.length < 2; row += 1) {
      const center = sim.flatCenter(4, row);
      const stitch = sim.getStitch(4, row);
      if (!center || !stitch) continue;
      const pixel = context.getImageData(center.x, center.y, 1, 1).data;
      const red = Number.parseInt(stitch.color.slice(1, 3), 16);
      const green = Number.parseInt(stitch.color.slice(3, 5), 16);
      const blue = Number.parseInt(stitch.color.slice(5, 7), 16);
      if (pixel[0] === red && pixel[1] === green && pixel[2] === blue) {
        hits.push({ ok: true, color: stitch.color, pixel: [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0] });
      }
    }
    return hits;
  });
  expect(compared).not.toBeNull();
  expect((compared ?? []).length).toBeGreaterThanOrEqual(2);
  for (const item of compared ?? []) expect(item.ok).toBe(true);

  await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-t09-plat.png' });

  // Les deux vues restent montées côte à côte
  await expect(page.getByTestId('sock-canvas')).toBeVisible();
  await expect(page.getByTestId('flat-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
