/**
 * T101 — collection partagée visible dans la Bibliothèque, utilisable, lien reproductible.
 * Nécessite wrangler + D1 + R2 (playwright.api.config.ts).
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'essai';

function tinySvg(label: string): Buffer {
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
  <g id="zone-1"><rect width="40" height="40" fill="#ab4236"/></g>
  <g id="zone-2"><circle cx="20" cy="20" r="10" fill="#303446"/></g>
  <!-- ${label} -->
</svg>`;
  return Buffer.from(text, 'utf8');
}

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
}

test.describe('T101 collections partagées', () => {
  test('Bibliothèque › Collections partagées + lien même empreinte', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(240_000);

    const listed = await request.get('/api/collections');
    const before = (await listed.json()) as { collections: Array<{ id: string }> };
    for (const c of before.collections) {
      await request.delete(`/api/collections/${c.id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    }

    const donnees = {
      zones: ['zone-1', 'zone-2'],
      couleursParDefaut: { 'zone-1': 'RD060', 'zone-2': 'BL016' },
      recommandations: [],
      calepinages: ['grille', 'damier'],
      calepinageParDefaut: 'damier',
      variations: [
        { name: 'VAR1', motif: 1, file: '', zones: ['zone-1', 'zone-2'] },
        { name: 'VAR2', motif: 2, file: '', zones: ['zone-1', 'zone-2'] },
      ],
    };

    const created = await request.post('/api/collections', {
      headers: { 'X-Mot-De-Passe': PASSWORD },
      multipart: {
        json: JSON.stringify({
          nom: 'Test Partage',
          description: 'e2e T101',
          format: '20x20',
          donnees,
        }),
        VAR1: {
          name: 'VAR1.svg',
          mimeType: 'image/svg+xml',
          buffer: tinySvg('v1'),
        },
        VAR2: {
          name: 'VAR2.svg',
          mimeType: 'image/svg+xml',
          buffer: tinySvg('v2'),
        },
      },
    });
    expect(created.status()).toBe(201);
    const body = (await created.json()) as { id: string };
    expect(body.id).toMatch(/^p-test-partage/);

    await page.goto('/?dev');
    await waitReady(page);

    // Bibliothèque › Collections partagées
    await page.getByTestId('project-library').click();
    await expect(page.getByTestId('library-dialog')).toBeVisible();
    await expect(page.getByTestId('lib-cat-partagees')).toBeVisible();
    await expect(page.getByTestId(`lib-collection-${body.id}`)).toBeVisible();
    // Fermer sans ajouter : clic hors zone / Escape via bouton si présent
    await page.locator('dialog[data-testid="library-dialog"]').evaluate((d) => {
      (d as HTMLDialogElement).close();
    });
    await expect(page.getByTestId('library-dialog')).toBeHidden();

    // Motif 1 sélectionné → appliquer la collection via le sélecteur (setMotifCollection)
    await page.getByTestId('layer-card-motif-1').click();
    await page.getByTestId('tab-calque').click();
    await expect(page.getByTestId('coll-search')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('coll-search').fill('Test Partage');
    const collItem = page.getByTestId(`coll-item-${body.id}`);
    await expect(collItem).toBeVisible({ timeout: 15_000 });
    const beforeCompute = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
    await collItem.click();
    await page.waitForFunction(
      (args) =>
        (window.__SIM__?.computeId ?? 0) > args.before && window.__SIM__?.activeCollectionId === args.id,
      { before: beforeCompute, id: body.id },
      { timeout: 30_000 },
    );

    await page.waitForFunction(() => window.location.hash.startsWith('#p=2.'), null, { timeout: 10_000 });
    const hashBefore = await page.evaluate(() => window.location.hash);
    await page.getByTestId('panel-copy-link').click();
    await expect(page.getByTestId('share-hint')).toContainText(/Lien copié|carreaux importés|Lien long/i);
    await page.waitForFunction(
      (prev) => window.location.hash.startsWith('#p=2.') && window.location.hash.length >= prev.length,
      hashBefore,
    );
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toMatch(/^#p=2\./);

    const fingerprint = await page.evaluate(() => window.__SIM__?.gridHash ?? '');
    expect(fingerprint.length).toBeGreaterThan(4);
    expect(await page.evaluate(() => window.__SIM__?.activeCollectionId)).toBe(body.id);

    await page.screenshot({
      path: 'test-results/visuel-t101-bibliotheque-partagees.png',
      fullPage: true,
    });

    await page.close();
    const fresh = await browser.newContext();
    const pageB = await fresh.newPage();
    await pageB.goto(`/?dev${hash}`);
    await waitReady(pageB);
    await pageB.waitForFunction(
      (args) => window.__SIM__?.activeCollectionId === args.id && window.__SIM__?.gridHash === args.fp,
      { id: body.id, fp: fingerprint },
      { timeout: 60_000 },
    );
    expect(await pageB.evaluate(() => window.__SIM__?.gridHash ?? '')).toBe(fingerprint);

    await pageB.screenshot({
      path: 'test-results/visuel-t101-lien-reouvert.png',
      fullPage: true,
    });
    await fresh.close();
  });
});
