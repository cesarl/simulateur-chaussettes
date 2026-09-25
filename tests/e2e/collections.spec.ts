import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureSource = path.join(root, 'tests/fixtures/configurateur-mini');

function syncMiniCatalogue(): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'carreaux-e2e-'));
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

test('choisir medina charge 4 carreaux, calepinage aleatoire et groupe collection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const dir = syncMiniCatalogue();
  await routeCarreaux(page, dir);

  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && window.__SIM__?.catalogue != null);

  await page.getByTestId('coll-search').fill('medina');
  await expect(page.getByTestId('coll-item-medina')).toBeVisible();
  const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
  await page.getByTestId('coll-item-medina').click();
  await page.waitForFunction(
    (id) => (window.__SIM__?.computeId ?? 0) > id && (window.__SIM__?.design.layout.tileIds.length ?? 0) === 4,
    before,
    { timeout: 30_000 },
  );

  expect(await page.evaluate(() => window.__SIM__?.activeCollectionId)).toBe('medina');
  await expect(page.getByTestId('tile-list').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('coll-current')).toContainText('Medina');

  const calep = await page.evaluate(() => window.__SIM__?.design.layout.calepinage);
  expect(calep?.source).toBe('prereglage');
  expect(calep?.presetId).toBe('aleatoire');

  await expect(page.getByTestId('calep-group-collection')).toBeVisible();
  await expect(page.getByTestId('calep-collection-presets').getByTestId('calep-thumb-damier_4')).toBeVisible();
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('captures 3D de trois collections réelles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  const hasCatalogue = await page.evaluate(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0);
  test.skip(!hasCatalogue, 'public/carreaux/ absent');

  const ids = ['medina', 'lianes', 'ophis'];
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });

  for (const id of ids) {
    await page.getByTestId('coll-search').fill(id);
    const item = page.getByTestId(`coll-item-${id}`);
    await expect(item).toBeVisible({ timeout: 10_000 });
    const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
    await item.click();
    await page.waitForFunction(
      (prev) =>
        (window.__SIM__?.computeId ?? 0) > prev &&
        window.__SIM__?.activeCollectionId != null &&
        (window.__SIM__?.design.layout.tileIds.length ?? 0) > 0,
      before,
      { timeout: 45_000 },
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const dataUrl = await page.evaluate(async () => {
      const sim = window.__SIM__;
      if (!sim?.captureView) return '';
      return sim.captureView('trois-quarts', 900, '#ecebe8');
    });
    expect(dataUrl.startsWith('data:image/png')).toBe(true);
    const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(root, 'test-results', `visuel-T30-${id}.png`), buf);
  }
  expect(errors).toEqual([]);
});
