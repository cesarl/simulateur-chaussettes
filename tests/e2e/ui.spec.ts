import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('état vide, raccourcis, aides et largeur 1280', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true);

  const empty = page.getByTestId('tile-empty');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(/bienvenue|exemple|importez/i);

  const help = page.getByTestId('help-ctl-tile-width');
  await expect(help).toBeVisible();
  const tip = await help.getAttribute('title');
  expect(tip?.length ?? 0).toBeGreaterThan(10);

  const filter = page.getByTestId('calep-filter');
  await filter.focus();
  await expect(filter).toBeFocused();
  await page.keyboard.press('ArrowDown');

  const viewport = page.getByTestId('viewport');
  const box = await viewport.boundingBox();
  expect(box).toBeTruthy();
  if (!box) throw new Error('viewport');
  expect(box.width).toBeGreaterThan(700);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const pos = window.__SIM__?.cameraPosition;
    return !!pos && (Math.abs(pos.x) > 0.001 || Math.abs(pos.z) > 0.001);
  });
  const afterOrbit = await page.evaluate(() => window.__SIM__?.cameraPosition ?? null);
  expect(afterOrbit).toBeTruthy();

  await page.getByTestId('viewport').click({ position: { x: 20, y: 80 } });
  await page.keyboard.press('r');
  await page.waitForFunction((prev) => {
    const pos = window.__SIM__?.cameraPosition;
    if (!pos || !prev) return false;
    return Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z) > 0.02;
  }, afterOrbit);

  const afterReset = await page.evaluate(() => window.__SIM__?.cameraPosition ?? null);
  await page.keyboard.press('f');
  await page.waitForFunction((prev) => {
    const pos = window.__SIM__?.cameraPosition;
    const target = window.__SIM__?.cameraTarget;
    if (!pos || !target || !prev) return false;
    const moved = Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z) > 0.02;
    const dx = pos.x - target.x;
    const dz = pos.z - target.z;
    return moved && Math.abs(dz) > Math.abs(dx);
  }, afterReset);
  const shortcuts = page.getByTestId('view-shortcuts');
  await expect(shortcuts).toContainText(/R/i);
  await expect(shortcuts).toContainText(/F/i);

  expect(errors).toEqual([]);
});
