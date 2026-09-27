/**
 * Enregistrer / recharger / ouvrir un projet retrouve la même grille.
 * Timeouts élargis pour la CI (SwiftShader + IndexedDB + parse PNG).
 */
import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function waitReady(page: Page, timeout = 60_000): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout });
}

test('enregistrer, recharger et ouvrir retrouve la même grille', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await waitReady(page);
  await page.getByTestId('tile-fixture').click();
  await expect(page.getByTestId('tile-thumb')).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId('tab-chaussette').click();
  await page.getByTestId('ctl-size').selectOption('femme');
  await page.waitForFunction(
    () => {
      const sim = window.__SIM__;
      return sim?.design.dimensions.size === 'femme' && (sim.patternPalette.length ?? 0) > 0;
    },
    null,
    { timeout: 30_000 },
  );
  const hash = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
  expect(hash).not.toBe('');

  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByTestId('tab-export').click();
  await page.getByTestId('project-save').click();
  const download = await downloadPromise;
  const tmp = path.join(os.tmpdir(), `projet-e2e-${Date.now()}.json`);
  await download.saveAs(tmp);
  expect(fs.existsSync(tmp)).toBe(true);

  await page.getByTestId('tab-chaussette').click();
  await page.getByTestId('ctl-size').selectOption('homme');
  await page.waitForFunction(() => window.__SIM__?.design.dimensions.size === 'homme', null, {
    timeout: 30_000,
  });

  // Éviter que l’autosave IndexedDB (homme) restaure un état concurrent à l’ouverture.
  await page.evaluate(async () => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('cesar-bazaar');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
        req.onblocked = () => resolve();
      });
    } catch {
      /* ignore */
    }
  });

  await page.goto('/?dev');
  await waitReady(page);

  await page.getByTestId('project-file').setInputFiles(tmp);
  await page.waitForFunction(() => window.__SIM__?.design.dimensions.size === 'femme', null, {
    timeout: 45_000,
  });
  await page.waitForFunction((expected) => window.__SIM__?.gridHash === expected, hash, {
    timeout: 45_000,
  });
  const size = await page.evaluate(() => window.__SIM__?.design.dimensions.size);
  expect(size).toBe('femme');
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);

  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
});
