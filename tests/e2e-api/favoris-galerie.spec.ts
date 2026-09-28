/**
 * T83 — galerie Favoris : liste, filtre, renommer, supprimer/annuler, corbeille, ouverture.
 */
import { expect, test } from '@playwright/test';
import { encodeShare } from '../../src/io/shareLink';

async function validLien(): Promise<string> {
  const { hash } = await encodeShare({ design: { name: 'galerie-test' } }, {});
  return hash.replace(/^#/, '');
}

async function createFavori(
  request: import('@playwright/test').APIRequestContext,
  nom: string,
  lien: string,
): Promise<string> {
  const res = await request.post('/api/favoris', {
    headers: { 'Content-Type': 'application/json', 'X-Mot-De-Passe': 'essai' },
    data: { nom, lien },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { id: string };
  return body.id;
}

test.describe('Galerie favoris T83', () => {
  test('cartes, filtre, renommer, supprimer, corbeille, ouverture', async ({ page, request }) => {
    // Nettoyage
    const listed = (await (await request.get('/api/favoris')).json()) as {
      favoris: Array<{ id: string }>;
    };
    for (const f of listed.favoris) {
      await request.delete(`/api/favoris/${f.id}`, { headers: { 'X-Mot-De-Passe': 'essai' } });
    }

    const lien = await validLien();
    const id1 = await createFavori(request, 'Alpha jardin', lien);
    const id2 = await createFavori(request, 'Beta palm', lien);
    const id3 = await createFavori(request, 'Gamma azure', lien);

    await page.goto('/favoris.html');
    await expect(page.getByTestId('favoris-title')).toBeVisible();
    await expect(page.getByTestId(`favoris-card-${id1}`)).toBeVisible();
    await expect(page.getByTestId(`favoris-card-${id2}`)).toBeVisible();
    await expect(page.getByTestId(`favoris-card-${id3}`)).toBeVisible();

    await page.screenshot({ path: 'test-results/visuel-t83-galerie-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/visuel-t83-galerie-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1400, height: 900 });

    // Filtrer
    await page.getByTestId('favoris-filter').fill('Beta');
    await expect(page.getByTestId(`favoris-card-${id2}`)).toBeVisible();
    await expect(page.getByTestId(`favoris-card-${id1}`)).toHaveCount(0);
    await page.getByTestId('favoris-filter').fill('');

    // Renommer (souris)
    await page.getByTestId(`favoris-menu-${id1}`).click();
    await page.getByTestId(`favoris-rename-${id1}`).click();
    const renameInput = page.getByTestId(`favoris-rename-input-${id1}`);
    await expect(renameInput).toBeVisible();
    await renameInput.fill('Alpha renommé');
    await renameInput.press('Enter');
    // Mot de passe si demandé
    const pwdDialog = page.getByTestId('favoris-password-dialog');
    if (await pwdDialog.isVisible().catch(() => false)) {
      await page.getByTestId('favoris-password').fill('essai');
      await page.getByTestId('favoris-password-ok').click();
    }
    await expect(page.getByTestId(`favoris-name-${id1}`)).toHaveText('Alpha renommé', {
      timeout: 10_000,
    });

    // Supprimer puis Annuler
    await page.getByTestId(`favoris-menu-${id2}`).click();
    await page.getByTestId(`favoris-delete-${id2}`).click();
    if (await pwdDialog.isVisible().catch(() => false)) {
      await page.getByTestId('favoris-password').fill('essai');
      await page.getByTestId('favoris-password-ok').click();
    }
    await expect(page.getByTestId('favoris-undo-delete')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('favoris-undo-delete').click();
    if (await pwdDialog.isVisible().catch(() => false)) {
      await page.getByTestId('favoris-password').fill('essai');
      await page.getByTestId('favoris-password-ok').click();
    }
    await expect(page.getByTestId(`favoris-card-${id2}`)).toBeVisible({ timeout: 10_000 });

    // Supprimer, corbeille, restaurer
    await page.getByTestId(`favoris-menu-${id3}`).click();
    await page.getByTestId(`favoris-delete-${id3}`).click();
    if (await pwdDialog.isVisible().catch(() => false)) {
      await page.getByTestId('favoris-password').fill('essai');
      await page.getByTestId('favoris-password-ok').click();
    }
    await expect(page.getByTestId(`favoris-card-${id3}`)).toHaveCount(0, { timeout: 10_000 });
    await page.getByTestId('favoris-corbeille').click();
    await expect(page.getByTestId(`favoris-card-${id3}`)).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`favoris-menu-${id3}`).click();
    await page.getByTestId(`favoris-restore-${id3}`).click();
    if (await pwdDialog.isVisible().catch(() => false)) {
      await page.getByTestId('favoris-password').fill('essai');
      await page.getByTestId('favoris-password-ok').click();
    }
    // Après restauration on revient à la liste principale
    await expect(page.getByTestId('favoris-corbeille')).toHaveText('Corbeille', { timeout: 10_000 });
    await expect(page.getByTestId(`favoris-card-${id3}`)).toBeVisible({ timeout: 10_000 });

    // Clic carte → ouverture (visionneuse sans ?dev)
    await page.evaluate(() => {
      try {
        localStorage.removeItem('simulateur-chaussettes:dev');
      } catch {
        /* ignore */
      }
    });
    await page.getByTestId(`favoris-open-${id1}`).click();
    await page.waitForURL(/favori=/, { timeout: 15_000 });
    expect(page.url()).not.toMatch(/[?&]dev(=|&|$)/);
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
    const gridHash = await page.evaluate(() => window.__SIM__!.gridHash);
    expect(typeof gridHash).toBe('string');
    expect(gridHash!.length).toBeGreaterThan(0);

    // Éditeur si mode dev mémorisé
    await page.goto('/favoris.html');
    await page.evaluate(() => {
      localStorage.setItem('simulateur-chaussettes:dev', '1');
    });
    await page.getByTestId(`favoris-open-${id1}`).click();
    await page.waitForURL(/favori=/, { timeout: 15_000 });
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
    await expect(page.getByTestId('project-favori')).toBeVisible({ timeout: 15_000 });
    const gridHashDev = await page.evaluate(() => window.__SIM__!.gridHash);
    expect(gridHashDev).toBe(gridHash);
  });
});
