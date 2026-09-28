/**
 * Défauts zones machine (bord-côte / talon / pointe) = hex du nuancier public.
 * Capture visuelle avant (anciens hex hors nuancier) / après (nuancier).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NUANCIER_DEFAULTS } from '../../src/core/nuancierDefaults';

/** Anciens défauts hors nuancier (référence visuelle / v1ShareDefaults). */
const LEGACY = {
  cuff: '#1f3a5f',
  heel: '#b5462f',
  toe: '#1d1d1b',
  foot: '#f4f1ea',
  fond: '#f1e9dc',
} as const;

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true);
}

async function waitCompute(page: Page, before: number): Promise<void> {
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? -1) > id, before, {
    timeout: 60_000,
  });
}

async function readZones(page: Page): Promise<{
  cuff: string;
  heel: string;
  toe: string;
  foot: string;
  fond: string | null;
} | null> {
  return page.evaluate(() => {
    const d = window.__SIM__?.design;
    if (!d) return null;
    const fond = d.layers.find((l) => l.kind === 'fond');
    return {
      cuff: d.zones.cuffColor.toLowerCase(),
      heel: d.zones.heelColor.toLowerCase(),
      toe: d.zones.toeColor.toLowerCase(),
      foot: d.zones.footColor.toLowerCase(),
      fond: fond && fond.kind === 'fond' ? fond.color.toLowerCase() : null,
    };
  });
}

async function applyZoneColors(
  page: Page,
  colors: { cuff: string; heel: string; toe: string; foot: string; fond: string },
): Promise<void> {
  const beforeId = await page.evaluate(() => window.__SIM__?.computeId ?? -1);
  await page.evaluate((c) => {
    const sim = window.__SIM__;
    if (!sim) return;
    const layers = sim.design.layers.map((l) =>
      l.kind === 'fond' ? { ...l, color: c.fond } : l,
    );
    sim.setDesign({
      zones: {
        cuffColor: c.cuff,
        heelColor: c.heel,
        toeColor: c.toe,
        footColor: c.foot,
      },
      layers,
    });
  }, colors);
  await waitCompute(page, beforeId);
}

function copyCapture(name: string): void {
  const src = join('test-results', name);
  if (!existsSync(src)) return;
  for (const dir of ['docs/captures/nuancier-zones', '/cursor/stores/self/media/nuancier-zones']) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(src, join(dir, name));
  }
}

test.describe('défauts zones = nuancier', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
      try {
        indexedDB.deleteDatabase('cesar-bazaar');
      } catch {
        /* ignore */
      }
    });
  });

  test('bord-côte, talon, pointe et fond au démarrage', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?dev');
    await waitReady(page);

    const zones = await readZones(page);
    expect(zones).toEqual({
      cuff: NUANCIER_DEFAULTS.cuff,
      heel: NUANCIER_DEFAULTS.heel,
      toe: NUANCIER_DEFAULTS.toe,
      foot: NUANCIER_DEFAULTS.foot,
      fond: NUANCIER_DEFAULTS.fond,
    });

    // Avant : anciens hex hors nuancier (référence visuelle historique).
    await applyZoneColors(page, LEGACY);
    expect(await readZones(page)).toEqual({
      cuff: LEGACY.cuff,
      heel: LEGACY.heel,
      toe: LEGACY.toe,
      foot: LEGACY.foot,
      fond: LEGACY.fond,
    });
    await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-nuancier-zones-avant-3d.png' });
    copyCapture('visuel-nuancier-zones-avant-3d.png');
    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-nuancier-zones-avant-plat.png' });
    copyCapture('visuel-nuancier-zones-avant-plat.png');

    // Après : retour aux défauts nuancier (sans rechargement IndexedDB).
    await applyZoneColors(page, {
      cuff: NUANCIER_DEFAULTS.cuff,
      heel: NUANCIER_DEFAULTS.heel,
      toe: NUANCIER_DEFAULTS.toe,
      foot: NUANCIER_DEFAULTS.foot,
      fond: NUANCIER_DEFAULTS.fond,
    });
    expect(await readZones(page)).toEqual({
      cuff: NUANCIER_DEFAULTS.cuff,
      heel: NUANCIER_DEFAULTS.heel,
      toe: NUANCIER_DEFAULTS.toe,
      foot: NUANCIER_DEFAULTS.foot,
      fond: NUANCIER_DEFAULTS.fond,
    });
    await page.getByTestId('viewport').screenshot({ path: 'test-results/visuel-nuancier-zones-apres-3d.png' });
    copyCapture('visuel-nuancier-zones-apres-3d.png');
    await page.getByTestId('view2d').screenshot({ path: 'test-results/visuel-nuancier-zones-apres-plat.png' });
    copyCapture('visuel-nuancier-zones-apres-plat.png');

    expect(errors).toEqual([]);
  });
});
