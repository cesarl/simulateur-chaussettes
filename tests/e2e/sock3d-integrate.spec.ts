import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('talon : setColors sans rebuild ; taille / tige / bord-côte reconstruisent', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  const afterHeel = await page.evaluate(async () => {
    const before = window.__SIM__!.geometryBuilds;
    const textures = window.__SIM__!.textureUpdates;
    window.__SIM__!.setDesign({ zones: { heelColor: '#33aa55' } });
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (window.__SIM__!.textureUpdates !== textures) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    return { before, after: window.__SIM__!.geometryBuilds };
  });
  expect(afterHeel.after).toBe(afterHeel.before);

  const afterSize = await page.evaluate(async () => {
    const before = window.__SIM__!.geometryBuilds;
    const id = window.__SIM__!.computeId;
    window.__SIM__!.setDesign({ dimensions: { size: 'femme' } });
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (window.__SIM__!.computeId !== id) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    return { before, after: window.__SIM__!.geometryBuilds };
  });
  expect(afterSize.after).toBeGreaterThan(afterSize.before);

  const afterLeg = await page.evaluate(async () => {
    const before = window.__SIM__!.geometryBuilds;
    const id = window.__SIM__!.computeId;
    const leg = window.__SIM__!.design.dimensions.legRows;
    window.__SIM__!.setDesign({ dimensions: { legRows: Math.max(40, leg - 40) } });
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (window.__SIM__!.computeId !== id) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    return { before, after: window.__SIM__!.geometryBuilds };
  });
  expect(afterLeg.after).toBeGreaterThan(afterLeg.before);

  const afterCuff = await page.evaluate(async () => {
    const before = window.__SIM__!.geometryBuilds;
    const id = window.__SIM__!.computeId;
    window.__SIM__!.setDesign({ zones: { cuffEnabled: false } });
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (window.__SIM__!.computeId !== id) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    return { before, after: window.__SIM__!.geometryBuilds };
  });
  expect(afterCuff.after).toBeGreaterThan(afterCuff.before);

  expect(errors).toEqual([]);
});
