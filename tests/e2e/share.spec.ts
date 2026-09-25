import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureSource = path.join(root, 'tests/fixtures/configurateur-mini');

function syncMiniCatalogue(): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'carreaux-share-'));
  execFileSync(process.execPath, [path.join(root, 'scripts/sync-carreaux.mjs'), '--source', fixtureSource, '--out', out], {
    encoding: 'utf8',
  });
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

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('lien de partage : collection modifiée → nouvel onglet → même chaussette', async ({ browser }) => {
  const dir = syncMiniCatalogue();
  const contextA = await browser.newContext();
  const page = await contextA.newPage();
  const errors = trackErrors(page);
  await routeCarreaux(page, dir);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && window.__SIM__?.catalogue != null);

  await page.getByTestId('coll-search').fill('medina');
  await expect(page.getByTestId('coll-item-medina')).toBeVisible();
  const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
  await page.getByTestId('coll-item-medina').click();
  await page.waitForFunction(
    (id) => (window.__SIM__?.computeId ?? 0) > id && window.__SIM__?.activeCollectionId === 'medina',
    before,
    { timeout: 30_000 },
  );

  await page.getByTestId('ctl-heel-height').fill('92');
  await page.waitForFunction(() => window.__SIM__?.design.zones.heelHeightMm === 92);

  const calep = page.getByTestId('calep-collection-presets').getByTestId('calep-thumb-damier_4');
  if (await calep.count()) {
    const c0 = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
    await calep.click();
    await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, c0);
  }

  // Laisser le hash se mettre à jour (anti-rebond 500 ms) puis copier
  await page.waitForFunction(() => window.location.hash.startsWith('#p=1.'), null, { timeout: 5_000 });
  const hashBefore = await page.evaluate(() => window.location.hash);
  await page.getByTestId('panel-copy-link').click();
  await expect(page.getByTestId('share-hint')).toContainText(/Lien copié|carreaux importés|Lien long/i);
  await page.waitForFunction(
    (prev) => window.location.hash.startsWith('#p=1.') && window.location.hash.length >= prev.length,
    hashBefore,
  );
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash.startsWith('#p=1.')).toBe(true);
  // Empreinte après copie (état courant)
  const fingerprint = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(fingerprint.length).toBeGreaterThanOrEqual(8);
  const heel = await page.evaluate(() => window.__SIM__?.design.zones.heelHeightMm);

  const sourcePng = await page.evaluate(async () => {
    const dataUrl = await window.__SIM__!.captureView('trois-quarts', 256, '#ecebe8');
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const tmp = document.createElement('canvas');
    tmp.width = 64;
    tmp.height = 64;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 64, 64);
    return Array.from(ctx.getImageData(0, 0, 64, 64).data);
  });
  await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-T35-share-source.png' });
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const errorsB = trackErrors(pageB);
  await routeCarreaux(pageB, dir);
  await pageB.goto(`/${hash}`);
  await pageB.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });

  await expect(pageB.getByTestId('panel')).toBeHidden();
  await expect(pageB.getByTestId('viewer-bar')).toBeVisible();
  await pageB.waitForFunction(
    (fp) => window.__SIM__?.gridHash === fp,
    fingerprint,
    { timeout: 30_000 },
  );
  expect(await pageB.evaluate(() => window.__SIM__?.design.zones.heelHeightMm)).toBe(heel);
  expect(await pageB.evaluate(() => window.__SIM__?.activeCollectionId)).toBe('medina');

  const targetPng = await pageB.evaluate(async () => {
    const dataUrl = await window.__SIM__!.captureView('trois-quarts', 256, '#ecebe8');
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const tmp = document.createElement('canvas');
    tmp.width = 64;
    tmp.height = 64;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 64, 64);
    return Array.from(ctx.getImageData(0, 0, 64, 64).data);
  });
  await pageB.getByTestId('viewport').screenshot({ path: 'test-results/visuel-T35-share-target.png' });

  let close = 0;
  for (let i = 0; i < sourcePng.length; i += 4) {
    const dr = Math.abs((sourcePng[i] ?? 0) - (targetPng[i] ?? 0));
    const dg = Math.abs((sourcePng[i + 1] ?? 0) - (targetPng[i + 1] ?? 0));
    const db = Math.abs((sourcePng[i + 2] ?? 0) - (targetPng[i + 2] ?? 0));
    if (dr + dg + db < 40) close += 1;
  }
  expect(close / (sourcePng.length / 4)).toBeGreaterThan(0.9);

  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  expect(errorsB.filter((e) => !e.includes('404'))).toEqual([]);
  await contextB.close();
});
