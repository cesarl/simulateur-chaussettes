/**
 * T52 — les deux liens réels de César s’ouvrent en visionneuse.
 * Catalogue minimal fabriqué à partir de tests/fixtures/liens/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const liensDir = path.join(root, 'tests/fixtures/liens');

const LIENS = {
  jardin: {
    hash: '#p=1.XVBBTsMwEPxKNVxdlKQIKh8pFxBcAIkDQsjYm9TIsYtjS5DKf0ebtIDQXryzM57Z3cNA7uFVT5C4UdFYvzCLKzXmCAEdnCOdbPDMsgYS7xNnaZbmlxPiwPMxeFrWkHh6rKoKYgYaSFzeVk2DUgSc-go5MVsrRzvrVUfcDSFHzRl2kSJ1jmHBzUDpmn2N6i3F1xUEOvIUJ1WIhh8Ysk0TXw33yndEkDW7JevoIdmktzRANuvT-oDZke6CYWkbiVDmrNMWOrfthneCxMnZ6nz9VkNgS-R-0PaCCwIp0H-wCHxk5ZMdp4S9-twcDtRwPkcpHa175TM5NwefBpDPf34_ur8UAUOabfboZ60O1qOU8g0',
    collection: 'jardin-d-dazur',
    nom: "Jardin d'Azur",
    colors: { 'zone-1': 'WT000', 'zone-2': 'BL022' },
    palette: ['#f7f7f7', '#4368b1'],
    vars: ['VAR1', 'VAR2', 'VAR3'] as const,
    svgPrefix: 'JARDIN-D-DAZUR',
  },
  palm: {
    hash: '#p=1.XY87T8QwEIT_Chpan5QEdCe55GgoECgtotg4ezlLfgTHkeAi_3e0CS_ReWd2_M0u6KEXBPIMjWdy_uqOyZyhYKJzbLKNQTZsD42RnN91v35Mk3iXGHhXQ6O9r6oD1CY00Hhqq6pBKQqOPuKcZduQ49EGGlimKc7JCHtMnHhwIisZJs4PwiTHlKNNIg8cOK2xmHp5YJptXgM0tRQGZui6CE8qrOXMfDodpSo0rnl_2N_WUDgzux_1dNNVXQWFHPm_WBTeZgrZXlaup_fj192NUB3nzI-xly6ewszObXVWA_rlz-_f9Nei0LMRzAK_ZU20AaWUTw',
    collection: 'palm-beach',
    nom: 'Palm Beach',
    colors: { 'zone-1': 'RD007', 'zone-2': 'OR002' },
    palette: ['#f3b0b0', '#e67641'],
    vars: ['VAR1', 'VAR2'] as const,
    svgPrefix: 'PALM-BEACH',
  },
} as const;

function buildLiensCatalogue(): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'carreaux-liens-'));
  const svgDir = path.join(out, 'svg');
  fs.mkdirSync(svgDir);
  const nuancier = [
    { id: 'WT000', nom: 'Blanc', hex: '#f7f7f7', ral: '', etat: 'Validé', public: true },
    { id: 'BL022', nom: 'Bleu', hex: '#4368b1', ral: '', etat: 'Validé', public: true },
    { id: 'RD007', nom: 'Rose', hex: '#f3b0b0', ral: '', etat: 'Validé', public: true },
    { id: 'OR002', nom: 'Orange', hex: '#e67641', ral: '', etat: 'Validé', public: true },
  ];
  const collections = Object.values(LIENS).map((lien) => {
    const variations = lien.vars.map((v, i) => {
      const realName = `${lien.svgPrefix}-${v}.svg`;
      fs.copyFileSync(path.join(liensDir, realName), path.join(svgDir, realName));
      return {
        name: v,
        motif: i + 1,
        file: `svg/${realName}`,
        zones: Object.keys(lien.colors),
      };
    });
    return {
      id: lien.collection,
      nom: lien.nom,
      description: '',
      categorie: 'signature',
      format: '20x20',
      actif: true,
      devSeulement: false,
      zonesLibres: false,
      variations,
      zones: Object.keys(lien.colors),
      couleursParDefaut: { ...lien.colors },
      couleursCollection: Object.values(lien.colors),
      recommandations: [],
      calepinages: ['damier_2'],
      calepinageParDefaut: 'damier_2',
      urlCollection: null,
      source: 'carreaux' as const,
    };
  });
  fs.writeFileSync(
    path.join(out, 'catalogue.json'),
    JSON.stringify({
      version: 1,
      synchroniseLe: new Date().toISOString(),
      source: { dossier: 'fixtures/liens', commit: 'liens-fixture' },
      nuancier,
      collections,
    }),
  );
  fs.writeFileSync(
    path.join(out, 'calepinages.json'),
    JSON.stringify({
      version: 1,
      presets: [
        {
          id: 'damier_2',
          nom: 'Damier',
          block_size: [2, 2],
          matrix: [
            { x: 0, y: 0, tile: 0, rot: 0 },
            { x: 1, y: 0, tile: 1, rot: 0 },
            { x: 0, y: 1, tile: 1, rot: 0 },
            { x: 1, y: 1, tile: 0, rot: 0 },
          ],
        },
      ],
    }),
  );
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

for (const [key, lien] of Object.entries(LIENS) as Array<[keyof typeof LIENS, (typeof LIENS)[keyof typeof LIENS]]>) {
  test(`lien réel ${key} : visionneuse sans panneau, couleurs présentes`, async ({ page }) => {
    const dir = buildLiensCatalogue();
    const errors = trackErrors(page);
    await routeCarreaux(page, dir);
    await page.goto(`/${lien.hash}`);
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
    await page.waitForFunction((prev) => (window.__SIM__?.computeId ?? 0) > prev, 0, { timeout: 60_000 });

    await expect(page.locator('#panel')).toBeHidden();

    const palette = await page.evaluate(() => window.__SIM__?.patternPalette ?? []);
    for (const hex of lien.palette) {
      expect(palette.map((h) => h.toLowerCase())).toContain(hex.toLowerCase());
    }
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  });

  test(`lien réel ${key} : en dev, calques Fond + Motif collection`, async ({ page }) => {
    const dir = buildLiensCatalogue();
    const errors = trackErrors(page);
    await routeCarreaux(page, dir);
    await page.goto(`/?dev${lien.hash}`);
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
    await page.waitForFunction((id) => (window.__SIM__?.activeCollectionId ?? null) === id, lien.collection, {
      timeout: 60_000,
    });

    const layers = await page.evaluate(() => {
      const d = window.__SIM__?.design as { layers?: Array<{ kind: string; name: string }> } | undefined;
      return d?.layers ?? [];
    });
    expect(layers.map((l) => l.kind)).toEqual(['fond', 'motif']);
    expect(layers[0]?.name).toMatch(/fond/i);
    expect(layers[1]?.name.toLowerCase()).toMatch(/jardin|palm|azur|beach/);

    const dock = page.getByTestId('layers-dock');
    if ((await dock.count()) > 0) {
      await expect(dock).toContainText(/Fond/i);
      await expect(dock).toContainText(/Jardin|Palm/i);
    }
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  });
}
