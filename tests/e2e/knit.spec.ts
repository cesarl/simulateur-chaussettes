import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') errors.push(text);
    if (message.type() === 'warning' && /webgl|shader/i.test(text)) errors.push(text);
  });
  return errors;
}

test('les mailles sont visibles et une couleur ne reconstruit pas le maillage', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.textureUpdates ?? 0) >= 1);

  const viewport = page.getByTestId('viewport');
  const box = await viewport.boundingBox();
  if (!box) throw new Error('viewport absent');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 5; step++) await page.mouse.wheel(0, -220);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await viewport.screenshot({ path: 'test-results/visuel-t07-mailles.png' });

  const before = await page.evaluate(() => ({
    builds: window.__SIM__?.geometryBuilds ?? 0,
    textures: window.__SIM__?.textureUpdates ?? 0,
  }));
  await page.evaluate(() => {
    window.__SIM__?.setDesign({ zones: { heelColor: '#22aa44' } });
  });
  await page.waitForFunction((textures) => (window.__SIM__?.textureUpdates ?? 0) !== textures, before.textures);
  const after = await page.evaluate(() => {
    const design = window.__SIM__?.design;
    const row = design ? (design.zones.cuffEnabled ? design.dimensions.cuffRows : 0) + design.dimensions.legRows : 0;
    return {
      builds: window.__SIM__?.geometryBuilds ?? 0,
      color: window.__SIM__?.getStitch(0, row)?.color ?? '',
    };
  });
  expect(after.builds).toBe(before.builds);
  expect(after.color).toBe('#22aa44');
  expect(errors).toEqual([]);
});
