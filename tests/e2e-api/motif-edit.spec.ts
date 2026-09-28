/**
 * T103 — modifier / dupliquer / supprimer une collection partagée.
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'essai';

function tinySvg(): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><g id="zone-1"><rect width="40" height="40" fill="#ab4236"/></g></svg>`,
    'utf8',
  );
}

async function createCollection(
  request: import('@playwright/test').APIRequestContext,
  nom: string,
  color = 'RD060',
): Promise<string> {
  const donnees = {
    zones: ['zone-1'],
    couleursParDefaut: { 'zone-1': color },
    recommandations: [],
    calepinages: ['damier'],
    calepinageParDefaut: 'damier',
    variations: [{ name: 'VAR1', motif: 1, file: '', zones: ['zone-1'] }],
  };
  const res = await request.post('/api/collections', {
    headers: { 'X-Mot-De-Passe': PASSWORD },
    multipart: {
      json: JSON.stringify({ nom, description: '', format: '20x20', donnees }),
      VAR1: { name: 'VAR1.svg', mimeType: 'image/svg+xml', buffer: tinySvg() },
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.describe('T103 modifier dupliquer supprimer', () => {
  test('modifier couleur, dupliquer, supprimer puis restaurer', async ({ page, request }) => {
    test.setTimeout(240_000);

    const listed = await request.get('/api/collections');
    const before = (await listed.json()) as { collections: Array<{ id: string }> };
    for (const c of before.collections) {
      await request.delete(`/api/collections/${c.id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    }
    const favs = (await (await request.get('/api/favoris')).json()) as { favoris: Array<{ id: string }> };
    for (const f of favs.favoris) {
      await request.delete(`/api/favoris/${f.id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    }

    const id = await createCollection(request, 'Edit Me', 'RD060');

    // Créer un favori via le simulateur (lien valide contenant l'id)
    await page.goto('/?dev');
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
    await page.getByTestId('layer-card-motif-1').click();
    await page.getByTestId('tab-calque').click();
    await page.getByTestId('coll-search').fill('Edit Me');
    await expect(page.getByTestId(`coll-item-${id}`)).toBeVisible({ timeout: 15_000 });
    const beforeCompute = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
    const hashBefore = await page.evaluate(() => window.location.hash);
    await page.getByTestId(`coll-item-${id}`).click();
    await page.waitForFunction(
      (args) =>
        (window.__SIM__?.computeId ?? 0) > args.before && window.__SIM__?.activeCollectionId === args.id,
      { before: beforeCompute, id },
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      (prev) => window.location.hash.startsWith('#p=2.') && window.location.hash !== prev,
      hashBefore,
      { timeout: 15_000 },
    );
    await page.getByTestId('panel-copy-link').click();
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toMatch(/^#p=2\./);
    const favRes = await request.post('/api/favoris', {
      headers: { 'Content-Type': 'application/json', 'X-Mot-De-Passe': PASSWORD },
      data: { nom: 'Fav motif', lien: hash.replace(/^#/, '') },
    });
    expect(favRes.status()).toBe(201);
    const favoriId = ((await favRes.json()) as { id: string }).id;

    // Modifier la couleur
    await page.goto(`/motif.html?id=${id}`);
    await expect(page.getByTestId('motif-nom')).toHaveValue('Edit Me', { timeout: 30_000 });
    await expect(page.getByTestId('motif-status')).toContainText(/favori/i, { timeout: 15_000 });
    await page.screenshot({ path: 'test-results/visuel-t103-edition-favori.png' });
    const zoneSel = page.getByTestId('motif-zone-color-zone-1');
    await expect(zoneSel).toBeVisible();
    await zoneSel.selectOption('BL016');
    await page.getByTestId('motif-save').click();
    await page.getByTestId('lib-shared-password').fill(PASSWORD);
    await page.getByTestId('lib-shared-password-ok').click();
    await expect(page.getByTestId('motif-status')).toContainText(/mis à jour|enregistré/i, {
      timeout: 30_000,
    });

    const got = await request.get(`/api/collections/${id}`);
    const body = (await got.json()) as { couleursParDefaut: Record<string, string>; id: string };
    expect(body.id).toBe(id);
    expect(body.couleursParDefaut['zone-1']).toBe('BL016');

    // Ouvrir le favori → nouvelle couleur (palette défaut live)
    const favoriHash = hash.startsWith('#') ? hash : `#${hash}`;
    await page.goto(`/?favori=${favoriId}${favoriHash}`);
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
    await page.waitForFunction((cid) => window.__SIM__?.activeCollectionId === cid, id, {
      timeout: 30_000,
    });
    const zoneColor = await page.evaluate(() => {
      const layer = window.__SIM__?.design?.layers?.find(
        (l) => l.kind === 'motif' && l.source?.kind === 'collection',
      );
      if (!layer || layer.kind !== 'motif' || layer.source.kind !== 'collection') return null;
      return layer.source.colors['zone-1'] ?? null;
    });
    expect(zoneColor).toBe('BL016');
    await page.screenshot({ path: 'test-results/visuel-t103-favori-nouvelle-couleur.png' });

    // Menu Bibliothèque Modifier / Dupliquer
    await page.goto('/?dev');
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
    await page.getByTestId('project-library').click();
    await expect(page.getByTestId('library-dialog')).toBeVisible();
    await page.getByTestId('lib-search').fill('Edit Me');
    const card = page.getByTestId(`lib-collection-${id}`);
    await card.hover();
    await page.getByTestId(`lib-collection-menu-${id}`).click();
    await expect(page.getByTestId(`lib-shared-edit-${id}`)).toBeVisible();
    await expect(page.getByTestId(`lib-shared-dup-${id}`)).toBeVisible();
    await expect(page.getByTestId(`lib-shared-del-${id}`)).toBeVisible();
    await page.screenshot({ path: 'test-results/visuel-t103-menu-modifier.png' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Dupliquer
    await page.goto(`/motif.html?dup=${id}`);
    await expect(page.getByTestId('motif-nom')).toHaveValue(/copie/i, { timeout: 30_000 });
    await page.getByTestId('motif-save').click();
    await page.getByTestId('lib-shared-password').fill(PASSWORD);
    await page.getByTestId('lib-shared-password-ok').click();
    await expect
      .poll(async () => {
        const r = (await (await request.get('/api/collections')).json()) as {
          collections: Array<{ id: string }>;
        };
        return r.collections.length;
      })
      .toBeGreaterThanOrEqual(2);

    // Supprimer puis restaurer
    await request.delete(`/api/collections/${id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    const empty = (await (await request.get('/api/collections')).json()) as {
      collections: Array<{ id: string }>;
    };
    expect(empty.collections.find((c) => c.id === id)).toBeUndefined();
    const trash = (await (await request.get('/api/collections?corbeille=1')).json()) as {
      collections: Array<{ id: string }>;
    };
    expect(trash.collections.some((c) => c.id === id)).toBe(true);

    await request.post(`/api/collections/${id}/restaurer`, {
      headers: { 'X-Mot-De-Passe': PASSWORD },
    });
    const back = (await (await request.get('/api/collections')).json()) as {
      collections: Array<{ id: string }>;
    };
    expect(back.collections.some((c) => c.id === id)).toBe(true);

    const still = await request.get(`/api/collections/${id}`);
    expect(still.status()).toBe(200);
  });
});
