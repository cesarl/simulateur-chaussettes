import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('dix changements rapides laissent le dernier réglage, sans erreur', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport absent');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();

  await page.getByTestId('tab-chaussette').click();
  const colors = page.getByTestId('ctl-max-colors');
  for (let step = 0; step < 10; step++) {
    await colors.fill(String(2 + (step % 7)));
  }
  await expect(colors).toHaveValue('4');
  await page.waitForFunction(() => window.__SIM__?.design.quantize.maxColors === 4);
  const width = await page.evaluate(() => window.__SIM__?.grid.width ?? 0);
  const needles = await page.evaluate(() => window.__SIM__?.design.dimensions.needles ?? 0);
  expect(width).toBe(needles);
  expect(errors).toEqual([]);
});
