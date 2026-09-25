import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('T32 captures bilan 4 collections', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  const has = await page.evaluate(() => (window.__SIM__?.catalogue?.collections.length ?? 0) > 0);
  test.skip(!has, 'public/carreaux/ absent');

  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const ids = ['medina', 'lianes', 'ophis', 'amour'];

  for (const id of ids) {
    await page.getByTestId('coll-search').fill(id);
    const item = page.getByTestId(`coll-item-${id}`);
    await expect(item).toBeVisible({ timeout: 15_000 });
    const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
    await item.click();
    await page.waitForFunction(
      ({ prev, collectionId }) =>
        (window.__SIM__?.computeId ?? 0) > prev &&
        window.__SIM__?.activeCollectionId === collectionId &&
        (window.__SIM__?.design.layout.tileIds.length ?? 0) > 0,
      { prev: before, collectionId: id },
      { timeout: 60_000 },
    );
    await page.evaluate(
      () =>
        new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
    const dataUrl = await page.evaluate(async () => window.__SIM__!.captureView!('trois-quarts', 1000));
    fs.writeFileSync(
      path.join(root, 'test-results', `visuel-T32-${id}.png`),
      Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
    );
  }
  expect(errors).toEqual([]);
});
