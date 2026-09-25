import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function readU32LE(bytes: Buffer, offset: number): number {
  return bytes.readUInt32LE(offset);
}

test('export BMP indexé et planche PNG', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  await page.getByTestId('export-face').uncheck();
  await page.getByTestId('export-bmp').check();
  const bmpEvent = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const bmpDownload = await bmpEvent;
  expect(bmpDownload.suggestedFilename()).toBe('modele_homme_grille.bmp');
  await bmpDownload.saveAs('test-results/visuel-t15-grille.bmp');
  const bmpBytes = readFileSync('test-results/visuel-t15-grille.bmp');
  expect(bmpBytes.subarray(0, 2).toString('ascii')).toBe('BM');
  expect(bmpBytes.readUInt16LE(28)).toBe(8);
  const expected = await page.evaluate(() => ({
    width: window.__SIM__?.grid.width ?? 0,
    height: window.__SIM__?.grid.height ?? 0,
  }));
  expect(readU32LE(bmpBytes, 18)).toBe(expected.width);
  expect(bmpBytes.readInt32LE(22)).toBe(expected.height);

  await page.getByTestId('export-bmp').uncheck();
  await page.getByTestId('export-board').check();
  const boardEvent = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const board = await boardEvent;
  expect(board.suggestedFilename()).toBe('modele_homme_planche.png');
  await board.saveAs('test-results/visuel-t15-planche.png');
  const boardBytes = readFileSync('test-results/visuel-t15-planche.png');
  expect([...boardBytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
  const boardSize = {
    width: boardBytes.readUInt32BE(16),
    height: boardBytes.readUInt32BE(20),
  };
  expect(boardSize.width).toBeGreaterThan(500);
  expect(boardSize.height).toBeGreaterThan(500);

  expect(errors).toEqual([]);
});
