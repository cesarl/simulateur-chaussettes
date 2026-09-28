/**
 * T93 — galerie Favoris : cartes 4:5, menus fermés, renommer dialog, toast Annuler.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
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

function saveCapture(src: string, name: string): void {
  for (const dir of ['docs/captures/v11', '/cursor/stores/self/media/v11']) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, name));
  }
}

test.describe('Galerie favoris T93', () => {
  test('cartes 4:5, menus fermés, renommer, supprimer/annuler, Échap', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
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

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/favoris.html');
    await expect(page.getByTestId('favoris-title')).toBeVisible();
    await expect(page.getByTestId(`favoris-card-${id1}`)).toBeVisible();

    // Aucun menu visible au chargement
    await expect(page.locator('.kit-menu')).toHaveCount(0);

    // Rapport 4:5 (±1 %)
    const ratios = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.favoris-card-media')).map((el) => {
        const r = el.getBoundingClientRect();
        return r.width / r.height;
      });
    });
    expect(ratios.length).toBeGreaterThan(0);
    for (const ratio of ratios) {
      expect(Math.abs(ratio - 0.8)).toBeLessThanOrEqual(0.01);
    }

    await page.screenshot({ path: 'test-results/visuel-t93-apres-galerie-1440.png', fullPage: true });
    saveCapture('test-results/visuel-t93-apres-galerie-1440.png', 'visuel-t93-apres-galerie-1440.png');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/visuel-t93-apres-galerie-390.png', fullPage: true });
    saveCapture('test-results/visuel-t93-apres-galerie-390.png', 'visuel-t93-apres-galerie-390.png');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Renommer via ⋯ → dialog
    await page.addInitScript(() => {
      try {
        localStorage.setItem('simulateur-chaussettes:mdp', 'essai');
      } catch {
        /* ignore */
      }
    });
    await page.reload();
    await expect(page.getByTestId(`favoris-card-${id1}`)).toBeVisible();

    await page.getByTestId(`favoris-card-${id1}`).hover();
    await page.getByTestId(`favoris-menu-${id1}`).click();
    await expect(page.getByTestId(`favoris-rename-${id1}`)).toBeVisible();
    await page.getByTestId(`favoris-rename-${id1}`).click();
    const renameInput = page.getByTestId(`favoris-rename-input-${id1}`);
    await expect(renameInput).toBeVisible();
    await renameInput.fill('Alpha renommé');
    await page.getByTestId(`favoris-rename-ok-${id1}`).click();
    await expect(page.getByTestId(`favoris-name-${id1}`)).toHaveText('Alpha renommé', {
      timeout: 15_000,
    });

    // Supprimer → Annuler toast
    await page.getByTestId(`favoris-card-${id2}`).hover();
    await page.getByTestId(`favoris-menu-${id2}`).click();
    await page.getByTestId(`favoris-delete-${id2}`).click();
    await expect(page.getByTestId('favoris-undo-delete')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('favoris-undo-delete').click();
    await expect(page.getByTestId(`favoris-card-${id2}`)).toBeVisible({ timeout: 10_000 });

    // Échap ferme le menu
    await page.getByTestId(`favoris-card-${id3}`).hover();
    await page.getByTestId(`favoris-menu-${id3}`).click();
    await expect(page.locator('.kit-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.kit-menu')).toHaveCount(0);

    // Ouverture carte (comportement V10)
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
  });
});
