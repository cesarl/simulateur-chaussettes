/**
 * T104 — galerie Collections partagées, infos, corbeille.
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'essai';

function tinySvg(fill = '#ab4236'): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><g id="zone-1"><rect width="40" height="40" fill="${fill}"/></g></svg>`,
    'utf8',
  );
}

test.describe('T104 galerie motifs', () => {
  test('section partagées, infos, corbeille', async ({ page, request }) => {
    test.setTimeout(240_000);

    const listed = await request.get('/api/collections');
    const before = (await listed.json()) as { collections: Array<{ id: string }> };
    for (const c of before.collections) {
      await request.delete(`/api/collections/${c.id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    }
    const trash = (await (await request.get('/api/collections?corbeille=1')).json()) as {
      collections: Array<{ id: string }>;
    };
    for (const c of trash.collections) {
      // leave trash empty for clean UI — hard delete not available; restore then delete already soft
      await request.post(`/api/collections/${c.id}/restaurer`, {
        headers: { 'X-Mot-De-Passe': PASSWORD },
      });
      await request.delete(`/api/collections/${c.id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    }

    const donnees = {
      zones: ['zone-1'],
      couleursParDefaut: { 'zone-1': 'RD060' },
      recommandations: [],
      calepinages: ['damier'],
      calepinageParDefaut: 'damier',
      variations: [{ name: 'VAR1', motif: 1, file: '', zones: ['zone-1'] }],
    };
    const res = await request.post('/api/collections', {
      headers: { 'X-Mot-De-Passe': PASSWORD },
      multipart: {
        json: JSON.stringify({
          nom: 'Galerie V12',
          description: 'Pour captures T104',
          format: '20x20',
          donnees,
        }),
        VAR1: { name: 'VAR1.svg', mimeType: 'image/svg+xml', buffer: tinySvg() },
      },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await page.goto('/?dev');
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
    await page.getByTestId('project-library').click();
    await expect(page.getByTestId('library-dialog')).toBeVisible();
    await page.getByTestId('lib-search').fill('Galerie V12');
    await expect(page.getByTestId(`lib-collection-${id}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('lib-new-motif')).toBeVisible();
    await expect(page.getByTestId('lib-motifs-corbeille')).toBeVisible();
    await page.screenshot({ path: 'test-results/visuel-t104-partagees.png' });

    // Infos ouvertes
    const info = page.getByTestId(`lib-info-${id}`);
    await info.locator('.kit-disclosure__trigger').click();
    await expect(page.getByTestId(`lib-info-vars-${id}`)).toBeVisible();
    await expect(page.getByTestId(`lib-info-swatches-${id}`)).toBeVisible();
    await page.screenshot({ path: 'test-results/visuel-t104-infos.png' });

    // Mettre à la corbeille puis ouvrir la corbeille
    await page.getByTestId(`lib-collection-${id}`).hover();
    await page.getByTestId(`lib-collection-menu-${id}`).click();
    await page.getByTestId(`lib-shared-del-${id}`).click();
    await page.getByTestId('lib-shared-password').fill(PASSWORD);
    await page.getByTestId('lib-shared-password-ok').click();
    await expect(page.getByTestId(`lib-collection-${id}`)).toHaveCount(0, { timeout: 15_000 });

    await page.getByTestId('lib-motifs-corbeille').click();
    await expect(page.getByTestId('lib-motifs-trash-grid')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`lib-trash-${id}`)).toBeVisible();
    await page.screenshot({ path: 'test-results/visuel-t104-corbeille.png' });

    await page.getByTestId(`lib-trash-restore-${id}`).click();
    await page.getByTestId('lib-shared-password').fill(PASSWORD);
    await page.getByTestId('lib-shared-password-ok').click();
    await expect(page.getByTestId(`lib-collection-${id}`)).toBeVisible({ timeout: 15_000 });
  });
});
