/**
 * T86 — images embarquées → bibliothèque partagée via ★ Favori, puis relecture.
 * Nécessite wrangler + D1 + R2 local (playwright.api.config.ts).
 */
import path from 'node:path';
import { expect, test } from '@playwright/test';

const DAMIER = path.join(process.cwd(), 'public/fixtures/carreau-test-damier.png');

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
}

test.describe('T86 images partagées', () => {
  test('Favori envoie le PNG ; relecture sans localStorage ; bibliothèque partagée', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(240_000);

    const listedImg = await request.get('/api/images');
    const beforeImg = (await listedImg.json()) as { images: Array<{ id: string }> };
    for (const img of beforeImg.images) {
      await request.delete(`/api/images/${img.id}`, { headers: { 'X-Mot-De-Passe': 'essai' } });
    }
    const listedFav = await request.get('/api/favoris');
    const beforeFav = (await listedFav.json()) as { favoris: Array<{ id: string }> };
    for (const f of beforeFav.favoris) {
      await request.delete(`/api/favoris/${f.id}`, { headers: { 'X-Mot-De-Passe': 'essai' } });
    }

    await page.goto('/?dev');
    await waitReady(page);

    await page.getByTestId('project-library').click();
    await expect(page.getByTestId('library-dialog')).toBeVisible();
    await page.getByTestId('lib-tab-images').click();
    await page.getByTestId('lib-image-import').click();
    await page.getByTestId('lib-image-file').setInputFiles(DAMIER);
    await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId('layer-options-title')).toContainText('Image');

    await page.getByTestId('project-favori').click();
    await expect(page.getByTestId('favori-dialog')).toBeVisible();
    await expect(page.getByTestId('favori-upload-save')).toBeVisible();
    await page.getByTestId('favori-password').fill('essai');
    await page.getByTestId('favori-name').fill('Damier partage');
    await page.getByTestId('favori-upload-save').click({ noWaitAfter: true });

    let fav: { id: string; nom: string; lien: string } | null = null;
    await expect
      .poll(
        async () => {
          const r = (await (await request.get('/api/favoris')).json()) as {
            favoris: Array<{ id: string; nom: string; lien: string }>;
          };
          fav = r.favoris.find((f) => f.nom === 'Damier partage') ?? null;
          return fav;
        },
        { timeout: 60_000 },
      )
      .not.toBeNull();

    await page.screenshot({
      path: 'test-results/visuel-t86-favori-images-partagees.png',
      fullPage: true,
    });

    const favoriId = fav!.id;
    const hash = fav!.lien.startsWith('#') ? fav!.lien : `#${fav!.lien}`;
    const afterImg = (await (await request.get('/api/images')).json()) as {
      images: Array<{ id: string; nom: string }>;
    };
    expect(afterImg.images.length).toBeGreaterThanOrEqual(1);
    const sharedId = afterImg.images[0]!.id;
    expect((await (await request.get(`/api/images/${sharedId}`)).body()).byteLength).toBeGreaterThan(100);

    await page.close();
    const fresh = await browser.newContext();
    const page2 = await fresh.newPage();
    await page2.goto(`/?dev&favori=${encodeURIComponent(favoriId)}${hash}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitReady(page2);

    await expect
      .poll(
        async () =>
          page2.evaluate(() => {
            const layers = window.__SIM__?.design?.layers as
              | Array<{ kind: string; asset?: { kind: string; imageId?: string } }>
              | undefined;
            const img = layers?.find((l) => l.kind === 'image');
            return img?.asset ?? null;
          }),
        { timeout: 30_000 },
      )
      .toEqual({ kind: 'partagee', imageId: sharedId });

    // Bibliothèque partagée (vignette servie par /api/images — preuve visuelle hors recompute 3D)
    await page2.getByTestId('project-library').click();
    await expect(page2.getByTestId('library-dialog')).toBeVisible();
    await page2.getByTestId('lib-tab-images').click();
    await expect(page2.getByTestId('lib-shared-section')).toBeVisible();
    const sharedThumb = page2.getByTestId(`lib-shared-${sharedId}`);
    await expect(sharedThumb).toBeVisible({ timeout: 30_000 });
    await expect(sharedThumb).toContainText(/damier/i);
    await expect(sharedThumb.locator('img')).toHaveAttribute('src', new RegExp(`/api/images/${sharedId}`));
    // Attendre le décodage de la vignette (fichier R2)
    await expect
      .poll(
        async () =>
          sharedThumb.locator('img').evaluate((el) => {
            const img = el as HTMLImageElement;
            return img.naturalWidth > 0 && img.naturalHeight > 0;
          }),
        { timeout: 30_000 },
      )
      .toBe(true);

    await page2.screenshot({
      path: 'test-results/visuel-t86-bibliotheque-partagee.png',
      fullPage: true,
    });

    await fresh.close();
  });
});
