import { expect, test } from '@playwright/test';

test('la page se charge, la 3D s’affiche, pas d’erreur console', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?dev');
  await expect(page.getByTestId('panel')).toBeVisible();
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  const canvas = page.getByTestId('sock-canvas');
  await expect(canvas).toBeVisible();

  // Le canvas ne doit pas être uniforme (quelque chose est dessiné).
  await page.waitForFunction(() => (window.__SIM__?.geometryBuilds ?? 0) >= 1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('[data-testid="sock-canvas"]')!;
        const tmp = document.createElement('canvas');
        tmp.width = 64;
        tmp.height = 64;
        const ctx = tmp.getContext('2d')!;
        ctx.drawImage(c, 0, 0, 64, 64);
        const d = ctx.getImageData(0, 0, 64, 64).data;
        const set = new Set<string>();
        for (let i = 0; i < d.length; i += 4) set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
        return set.size;
      });
    }, { timeout: 30_000 })
    .toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
