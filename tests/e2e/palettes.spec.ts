import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureSource = path.join(root, 'tests/fixtures/configurateur-mini');

function syncMini(): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-e2e-'));
  execFileSync(process.execPath, [path.join(root, 'scripts/sync-carreaux.mjs'), '--source', fixtureSource, '--out', out]);
  return out;
}

async function routeCarreaux(page: Page, dir: string): Promise<void> {
  await page.route('**/carreaux/**', async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace(/^.*\/carreaux\//, '');
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) {
      await route.fulfill({ status: 404, body: 'absent' });
      return;
    }
    const body = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const type =
      ext === '.json' ? 'application/json' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    await route.fulfill({ status: 200, contentType: type, body });
  });
}

async function selectCollection(page: Page, id: string): Promise<void> {
  await page.getByTestId('coll-search').fill(id);
  const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
  await page.getByTestId(`coll-item-${id}`).click();
  await page.waitForFunction(
    ({ prev, collectionId }) =>
      (window.__SIM__?.computeId ?? 0) > prev &&
      window.__SIM__?.activeCollectionId === collectionId &&
      (window.__SIM__?.design.layout.tileIds.length ?? 0) > 0,
    { prev: before, collectionId: id },
    { timeout: 45_000 },
  );
}

test('palettes lianes : suggestion artiste, nuancier zone-1, assortir zones', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const dir = syncMini();
  await routeCarreaux(page, dir);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && window.__SIM__?.catalogue != null);

  await selectCollection(page, 'lianes');
  await expect(page.getByTestId('section-couleurs')).toBeVisible();
  await expect(page.getByTestId('pal-option-defaut')).toBeVisible();

  const beforePal = await page.evaluate(() => window.__SIM__?.patternPalette ?? []);
  await page.getByTestId('pal-option-reco-1').click();
  await page.waitForFunction(
    (prev) => {
      const next = window.__SIM__?.patternPalette ?? [];
      return next.length > 0 && next.join(',') !== prev;
    },
    beforePal.join(','),
    { timeout: 45_000 },
  );
  const afterPal = await page.evaluate(() => window.__SIM__?.patternPalette ?? []);
  expect(afterPal.join(',')).not.toBe(beforePal.join(','));

  const beforeZone = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
  await page.getByTestId('zone-swatch-zone-1').click();
  await expect(page.getByTestId('nuancier-search')).toBeVisible();
  await page.getByTestId('nuancier-search').fill('OR008');
  await expect(page.getByTestId('nuancier-OR008')).toBeVisible();
  await page.getByTestId('nuancier-OR008').click();
  await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, beforeZone, {
    timeout: 45_000,
  });

  const beforeZones = await page.evaluate(() => ({
    cuff: window.__SIM__?.design.zones.cuffColor,
    heel: window.__SIM__?.design.zones.heelColor,
    toe: window.__SIM__?.design.zones.toeColor,
    id: window.__SIM__?.computeId ?? 0,
  }));
  await page.getByTestId('match-zones').click();
  await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, beforeZones.id);
  const afterZones = await page.evaluate(() => ({
    cuff: window.__SIM__?.design.zones.cuffColor,
    heel: window.__SIM__?.design.zones.heelColor,
    toe: window.__SIM__?.design.zones.toeColor,
  }));
  expect(
    afterZones.cuff !== beforeZones.cuff ||
      afterZones.heel !== beforeZones.heel ||
      afterZones.toe !== beforeZones.toe,
  ).toBe(true);

  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('captures deux palettes de la même collection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  const has = await page.evaluate(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0);
  test.skip(!has, 'public/carreaux/ absent');

  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await selectCollection(page, 'lianes');

  async function capturePair(tag: string): Promise<void> {
    await page.evaluate(
      () =>
        new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
    const view3d = await page.evaluate(async () => window.__SIM__!.captureView!('trois-quarts', 900));
    fs.writeFileSync(
      path.join(root, 'test-results', `visuel-T31-${tag}-3d.png`),
      Buffer.from(view3d.replace(/^data:image\/png;base64,/, ''), 'base64'),
    );
    await page.getByTestId('view-flat').click();
    await expect(page.getByTestId('flat-canvas')).toBeVisible();
    await page.getByTestId('flat-canvas').screenshot({
      path: path.join(root, 'test-results', `visuel-T31-${tag}-plat.png`),
    });
    await page.getByTestId('view-3d').click();
  }

  await capturePair('lianes-defaut');
  const beforePal = await page.evaluate(() => (window.__SIM__?.patternPalette ?? []).join(','));
  await page.getByTestId('pal-option-reco-1').click();
  await page.waitForFunction(
    (prev) => {
      const next = (window.__SIM__?.patternPalette ?? []).join(',');
      return next.length > 0 && next !== prev;
    },
    beforePal,
    { timeout: 45_000 },
  );
  await capturePair('lianes-reco1');
  expect(errors).toEqual([]);
});
