/**
 * T44 — admin collections : mode téléchargement → zip avec collections.json + 2 SVG zonés.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from './zip-read-helper';

const svgA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c45c26"/><circle cx="5" cy="5" r="2" fill="#f4f1ea"/></svg>`;
const svgB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#1f3a5f"/><circle cx="5" cy="5" r="3" fill="#f4f1ea"/></svg>`;

test('admin : créer 2 SVG en mode téléchargement → zip zoné', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/admin.html');
  await expect(page.getByTestId('admin-title')).toBeVisible();
  await page.getByTestId('admin-download-mode').click();
  await page.getByTestId('admin-new').click();
  await page.getByTestId('admin-name').fill('Demo Locale');
  await expect(page.getByTestId('admin-id')).toHaveText('DEMOLOCALE');

  await page.getByTestId('admin-files').setInputFiles([
    { name: 'a.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svgA) },
    { name: 'b.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svgB) },
  ]);
  await expect(page.getByTestId('admin-file-list').locator('li')).toHaveCount(2);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('admin-save').click(),
  ]);
  const target = path.join('test-results', 'admin-collections-locales.zip');
  await download.saveAs(target);
  const zipBytes = new Uint8Array(fs.readFileSync(target));
  const files = unzipSync(zipBytes);
  expect(files.has('collections.json')).toBe(true);
  const json = JSON.parse(strFromU8(files.get('collections.json')!)) as Array<{ id: string }>;
  expect(json.some((c) => c.id === 'DEMOLOCALE')).toBe(true);
  const svg1 = strFromU8(files.get('svg/DEMOLOCALE-VAR1.svg')!);
  const svg2 = strFromU8(files.get('svg/DEMOLOCALE-VAR2.svg')!);
  expect(svg1).toContain('id="zone-1"');
  expect(svg2).toContain('id="zone-');
  expect(errors).toEqual([]);

  await page.screenshot({ path: 'test-results/visuel-t44-admin.png', fullPage: true });
});
