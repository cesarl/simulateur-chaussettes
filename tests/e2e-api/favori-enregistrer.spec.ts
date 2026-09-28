/**
 * T82 — ★ Favori : enregistrement, mise à jour, mauvais mot de passe (souris).
 * Nécessite wrangler + D1 (playwright.api.config.ts).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const liensDir = path.join(root, 'tests/fixtures/liens');

const JARDIN = {
  hash: '#p=1.XVBBTsMwEPxKNVxdlKQIKh8pFxBcAIkDQsjYm9TIsYtjS5DKf0ebtIDQXryzM57Z3cNA7uFVT5C4UdFYvzCLKzXmCAEdnCOdbPDMsgYS7xNnaZbmlxPiwPMxeFrWkHh6rKoKYgYaSFzeVk2DUgSc-go5MVsrRzvrVUfcDSFHzRl2kSJ1jmHBzUDpmn2N6i3F1xUEOvIUJ1WIhh8Ysk0TXw33yndEkDW7JevoIdmktzRANuvT-oDZke6CYWkbiVDmrNMWOrfthneCxMnZ6nz9VkNgS-R-0PaCCwIp0H-wCHxk5ZMdp4S9-twcDtRwPkcpHa175TM5NwefBpDPf34_ur8UAUOabfboZ60O1qOU8g0',
  collection: 'jardin-d-dazur',
  nom: "Jardin d'Azur",
  colors: { 'zone-1': 'WT000', 'zone-2': 'BL022' },
  vars: ['VAR1', 'VAR2', 'VAR3'] as const,
  svgPrefix: 'JARDIN-D-DAZUR',
};

function buildLiensCatalogue(): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'carreaux-favori-'));
  const svgDir = path.join(out, 'svg');
  fs.mkdirSync(svgDir);
  const nuancier = [
    { id: 'WT000', nom: 'Blanc', hex: '#f7f7f7', ral: '', etat: 'Validé', public: true },
    { id: 'BL022', nom: 'Bleu', hex: '#4368b1', ral: '', etat: 'Validé', public: true },
  ];
  const variations = JARDIN.vars.map((v, i) => {
    const realName = `${JARDIN.svgPrefix}-${v}.svg`;
    fs.copyFileSync(path.join(liensDir, realName), path.join(svgDir, realName));
    return {
      name: v,
      motif: i + 1,
      file: `svg/${realName}`,
      zones: Object.keys(JARDIN.colors),
    };
  });
  const collections = [
    {
      id: JARDIN.collection,
      nom: JARDIN.nom,
      description: '',
      categorie: 'signature',
      format: '20x20',
      actif: true,
      devSeulement: false,
      zonesLibres: false,
      variations,
      zones: Object.keys(JARDIN.colors),
      couleursParDefaut: { ...JARDIN.colors },
      couleursCollection: Object.values(JARDIN.colors),
      recommandations: [],
      calepinages: ['damier_2'],
      calepinageParDefaut: 'damier_2',
      urlCollection: null,
      source: 'carreaux' as const,
    },
  ];
  fs.writeFileSync(
    path.join(out, 'catalogue.json'),
    JSON.stringify({
      version: 1,
      synchroniseLe: new Date().toISOString(),
      sourceCommit: 'favori-e2e',
      collections,
      nuancier,
      calepinages: [],
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

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
}

test.describe('★ Favori T82', () => {
  test('enregistrer, mettre à jour, mauvais mot de passe', async ({ page, request }) => {
    const dir = buildLiensCatalogue();
    await routeCarreaux(page, dir);

    // Nettoyer les favoris existants via API (mot de passe essai).
    const listed = await request.get('/api/favoris');
    const before = (await listed.json()) as { favoris: Array<{ id: string }> };
    for (const f of before.favoris) {
      await request.delete(`/api/favoris/${f.id}`, { headers: { 'X-Mot-De-Passe': 'essai' } });
    }

    await page.goto(`/?dev${JARDIN.hash}`);
    await waitReady(page);
    await expect(page.getByTestId('project-favori')).toBeVisible();

    // ★ Favori → mot de passe → nom
    await page.getByTestId('project-favori').click();
    await expect(page.getByTestId('favori-dialog')).toBeVisible();
    await page.getByTestId('favori-password').fill('essai');
    await page.getByTestId('favori-name').fill("Jardin d'Azur");
    await page.getByTestId('favori-save').click();
    await expect(page.getByTestId('favori-gallery-link')).toBeVisible({ timeout: 60_000 });

    const afterCreate = (await (await request.get('/api/favoris')).json()) as {
      favoris: Array<{ id: string; nom: string; lien: string; has_vignette: boolean; modifie_le: number }>;
    };
    expect(afterCreate.favoris).toHaveLength(1);
    expect(afterCreate.favoris[0]!.nom).toBe("Jardin d'Azur");
    expect(afterCreate.favoris[0]!.has_vignette).toBe(true);
    const favoriId = afterCreate.favoris[0]!.id;
    const lienAvant = afterCreate.favoris[0]!.lien;

    const vignette = await request.get(
      `/api/favoris/${favoriId}/vignette?v=${afterCreate.favoris[0]!.modifie_le}`,
    );
    expect(vignette.ok()).toBeTruthy();
    expect(vignette.headers()['content-type']).toContain('image/webp');
    const bytes = await vignette.body();
    // WebP 480×600 : en-tête RIFF….WEBP + dimensions dans VP8X/VP8 (vérif taille > 0)
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(bytes.byteLength).toBeLessThanOrEqual(200 * 1024);

    // Dimensions via décodage navigateur
    const dims = await page.evaluate(async (id) => {
      const res = await fetch(`/api/favoris/${id}/vignette?v=1`);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const out = { w: bmp.width, h: bmp.height };
      bmp.close();
      return out;
    }, favoriId);
    expect(dims).toEqual({ w: 480, h: 600 });

    await page.screenshot({ path: 'test-results/visuel-t82-favori-enregistre.png', fullPage: true });

    // Attendre la disparition du bandeau, puis vérifier ?favori=
    await expect(page.getByTestId('favori-gallery-link')).toBeHidden({ timeout: 10_000 });
    const favoriInUrl = await page.evaluate(() => new URLSearchParams(location.search).get('favori'));
    expect(favoriInUrl).toBe(favoriId);

    // Modifier la chaussette (décor) → ★ → Mettre à jour
    const hashBefore = await page.evaluate(() => window.location.hash);
    await page.evaluate(() => {
      window.__SIM__!.setDesign({ decor: { mode: 'sol' } });
    });
    await page.waitForFunction((prev) => window.location.hash !== prev && window.location.hash.startsWith('#p='), hashBefore, {
      timeout: 10_000,
    });

    await page.getByTestId('project-favori').click();
    await expect(page.getByTestId('favori-update')).toBeVisible();
    await page.getByTestId('favori-password').fill('essai');
    await page.getByTestId('favori-update').click();
    await expect(page.getByTestId('favori-gallery-link')).toBeVisible({ timeout: 60_000 });

    await expect
      .poll(async () => {
        const r = (await (await request.get(`/api/favoris/${favoriId}`)).json()) as {
          lien: string;
          modifie_le: number;
        };
        return r.modifie_le > afterCreate.favoris[0]!.modifie_le ? r.lien : null;
      }, { timeout: 15_000 })
      .not.toBeNull();

    const afterUpdate = (await (await request.get(`/api/favoris/${favoriId}`)).json()) as {
      lien: string;
    };
    expect(afterUpdate.lien).not.toBe(lienAvant);

    // Mauvais mot de passe
    await page.evaluate(() => {
      try {
        localStorage.removeItem('simulateur-chaussettes:mdp');
      } catch {
        /* ignore */
      }
    });
    const countBeforeBad = (
      (await (await request.get('/api/favoris')).json()) as { favoris: unknown[] }
    ).favoris.length;

    await page.getByTestId('project-favori').click();
    await page.getByTestId('favori-password').fill('mauvais');
    await page.getByTestId('favori-update').click();
    await expect(page.getByTestId('favori-dialog-error')).toContainText(/incorrect/i, {
      timeout: 15_000,
    });
    await page.getByTestId('favori-cancel').click();

    const countAfterBad = (
      (await (await request.get('/api/favoris')).json()) as { favoris: unknown[] }
    ).favoris.length;
    expect(countAfterBad).toBe(countBeforeBad);
  });
});
