import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

const HEEL = '#e02020';
const SIZE = 900;

/** Compte les pixels « talon » : rouge dominant, loin du fond crème / bord-côte / pointe. */
async function heelPixelRatio(page: Page, dataUrl: string): Promise<number> {
  return page.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let match = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] ?? 0;
      if (a < 8) continue;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      // hors fond quasi-blanc
      if (r > 220 && g > 220 && b > 210) continue;
      total += 1;
      // rouge / terracotta dominant (après éclairage studio)
      if (r > 90 && r > g + 25 && r > b + 25 && g < 140) match += 1;
    }
    return total === 0 ? 0 : match / total;
  }, dataUrl);
}

test('talon aperçu : hauteur 40 → 95 augmente nettement la zone talon en profil', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  const configured = await page.evaluate((heel) => {
    const builds = window.__SIM__!.geometryBuilds;
    window.__SIM__!.setDesign({
      zones: {
        heelColor: heel,
        toeColor: '#1d1d1b',
        cuffColor: '#1f3a5f',
        heelHeightMm: 40,
        heelDepthMm: 72,
        heelSpread: 100,
      },
    });
    return builds;
  }, HEEL);
  await page.waitForFunction((b) => (window.__SIM__?.geometryBuilds ?? 0) > b, configured);

  const lowUrl = await page.evaluate(
    async ({ size }) => {
      const capture = window.__SIM__?.captureView;
      if (!capture) throw new Error('captureView absent');
      return capture('profil-exterieur', size, '#ecebe8');
    },
    { size: SIZE },
  );
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/visuel-T24-talon-bas.png', Buffer.from(lowUrl.split(',')[1] ?? '', 'base64'));
  const lowRatio = await heelPixelRatio(page, lowUrl);

  const raised = await page.evaluate(() => {
    const builds = window.__SIM__!.geometryBuilds;
    window.__SIM__!.setDesign({ zones: { heelHeightMm: 95 } });
    return builds;
  });
  await page.waitForFunction((b) => (window.__SIM__?.geometryBuilds ?? 0) > b, raised);

  const highUrl = await page.evaluate(
    async ({ size }) => {
      const capture = window.__SIM__?.captureView;
      if (!capture) throw new Error('captureView absent');
      return capture('profil-exterieur', size, '#ecebe8');
    },
    { size: SIZE },
  );
  writeFileSync('test-results/visuel-T24-talon-haut.png', Buffer.from(highUrl.split(',')[1] ?? '', 'base64'));
  const highRatio = await heelPixelRatio(page, highUrl);

  expect(lowRatio, `ratio talon bas (${lowRatio})`).toBeGreaterThan(0.02);
  expect(highRatio / lowRatio, `hausse ${lowRatio} → ${highRatio}`).toBeGreaterThanOrEqual(1.3);
  expect(errors).toEqual([]);
});
