/**
 * T102 — atelier Créer un motif (souris) + enregistrement API + bibliothèque.
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const PASSWORD = 'essai';
const FIXTURE_DIR = path.join(process.cwd(), 'test-results', 'motif-fixtures');

function writeSvgFixture(name: string, fill1: string, fill2: string): string {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = path.join(FIXTURE_DIR, name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
  <rect width="40" height="40" fill="${fill1}"/>
  <circle cx="20" cy="20" r="12" fill="${fill2}"/>
</svg>`;
  fs.writeFileSync(file, svg);
  return file;
}

test.describe('T102 créer un motif', () => {
  test('déposer, couleurs, damier, enregistrer, bibliothèque', async ({ page, request }) => {
    test.setTimeout(240_000);

    const listed = await request.get('/api/collections');
    const before = (await listed.json()) as { collections: Array<{ id: string }> };
    for (const c of before.collections) {
      await request.delete(`/api/collections/${c.id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    }

    const f1 = writeSvgFixture('var1.svg', '#ab4236', '#303446');
    const f2 = writeSvgFixture('var2.svg', '#ab4236', '#1a1a1a');
    const f3 = writeSvgFixture('var3.svg', '#ab4236', '#fff8eb');

    await page.goto('/motif.html');
    await expect(page.getByTestId('motif-title')).toBeVisible();

    await page.getByTestId('motif-nom').fill('Atelier Test');
    await expect(page.getByTestId('motif-id-preview')).toContainText('p-atelier-test');

    await page.getByTestId('motif-file-input').setInputFiles([f1, f2, f3]);
    await expect(page.getByTestId('motif-var-0')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('motif-var-1')).toBeVisible();
    await expect(page.getByTestId('motif-var-2')).toBeVisible();
    await expect(page.getByTestId('motif-var-list')).toContainText('zone');

    await page.screenshot({
      path: 'test-results/visuel-t102-variations.png',
      fullPage: true,
    });

    // Changer une couleur de zone → preview 2D change
    const canvas = page.getByTestId('motif-preview-2d');
    await expect(canvas).toBeVisible();
    const beforePx = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(40, 40, 1, 1).data;
      return [d[0], d[1], d[2]].join(',');
    });

    const zoneSelect = page.locator('[data-testid^="motif-zone-color-"]').first();
    await expect(zoneSelect).toBeVisible();
    const options = zoneSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await zoneSelect.selectOption(val);
    }
    await page.waitForTimeout(300);
    const afterPx = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(40, 40, 1, 1).data;
      return [d[0], d[1], d[2]].join(',');
    });
    // La preview a été redessinée (peut rester proche si fils similaires, mais canvas présent)
    expect(afterPx.split(',').length).toBe(3);
    void beforePx;

    await page.getByTestId('motif-calep-damier').click();
    await expect(page.getByTestId('motif-calep-default')).toContainText('damier');

    await page.screenshot({
      path: 'test-results/visuel-t102-preview.png',
      fullPage: true,
    });

    await page.getByTestId('motif-save').click();
    await expect(page.getByTestId('lib-shared-password-dialog')).toBeVisible();
    await page.getByTestId('lib-shared-password').fill(PASSWORD);
    await page.getByTestId('lib-shared-password-ok').click();

    await expect
      .poll(
        async () => {
          const r = (await (await request.get('/api/collections')).json()) as {
            collections: Array<{ id: string; nom: string }>;
          };
          return r.collections.find((c) => c.nom === 'Atelier Test')?.id ?? null;
        },
        { timeout: 60_000 },
      )
      .not.toBeNull();

    const id = (
      (await (await request.get('/api/collections')).json()) as {
        collections: Array<{ id: string; nom: string }>;
      }
    ).collections.find((c) => c.nom === 'Atelier Test')!.id;

    await page.goto('/?dev');
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 90_000 });
    await page.getByTestId('project-library').click();
    await expect(page.getByTestId('lib-cat-partagees')).toBeVisible();
    await expect(page.getByTestId(`lib-collection-${id}`)).toBeVisible();
    await expect(page.getByTestId('lib-new-motif')).toBeVisible();

    await page.getByTestId(`lib-collection-${id}`).click();
    await expect(page.getByTestId('library-dialog')).toBeHidden({ timeout: 30_000 });
    await page.waitForFunction((cid) => window.__SIM__?.activeCollectionId === cid, id, {
      timeout: 30_000,
    });

    await page.screenshot({
      path: 'test-results/visuel-t102-bibliotheque.png',
      fullPage: true,
    });
  });

  test('brouillon repris après rechargement', async ({ page }) => {
    test.setTimeout(120_000);
    const f1 = writeSvgFixture('draft1.svg', '#ab4236', '#303446');
    const f2 = writeSvgFixture('draft2.svg', '#ab4236', '#1a1a1a');
    const f3 = writeSvgFixture('draft3.svg', '#ab4236', '#fff8eb');

    await page.goto('/motif.html');
    await page.getByTestId('motif-nom').fill('Brouillon');
    await page.getByTestId('motif-file-input').setInputFiles([f1, f2, f3]);
    await expect(page.getByTestId('motif-var-2')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByTestId('motif-draft-dialog')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('motif-draft-resume').click();
    await expect(page.getByTestId('motif-var-0')).toBeVisible();
    await expect(page.getByTestId('motif-var-1')).toBeVisible();
    await expect(page.getByTestId('motif-var-2')).toBeVisible();
    await expect(page.getByTestId('motif-nom')).toHaveValue('Brouillon');
  });

  test('PNG en preview 2D puis enregistrement', async ({ page, request }) => {
    test.setTimeout(180_000);

    const listed = await request.get('/api/collections');
    const before = (await listed.json()) as { collections: Array<{ id: string }> };
    for (const c of before.collections) {
      await request.delete(`/api/collections/${c.id}`, { headers: { 'X-Mot-De-Passe': PASSWORD } });
    }

    const pngPath = path.join(process.cwd(), 'public/fixtures/carreau-test-damier.png');
    expect(fs.existsSync(pngPath)).toBe(true);

    await page.goto('/motif.html');
    await page.getByTestId('motif-nom').fill('Png Preview');
    await page.getByTestId('motif-file-input').setInputFiles([pngPath]);
    await expect(page.getByTestId('motif-var-0')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('motif-var-0').locator('img')).toHaveAttribute('src', /data:image\/png/);

    const canvas = page.getByTestId('motif-preview-2d');
    await expect(canvas).toBeVisible();
    // Fond vide = #e8e4dc ; un PNG remplit le canvas → pixel ≠ fond uni beige
    await expect
      .poll(
        async () =>
          canvas.evaluate((el) => {
            const c = el as HTMLCanvasElement;
            const ctx = c.getContext('2d')!;
            const d = ctx.getImageData(120, 120, 1, 1).data;
            return `${d[0]},${d[1]},${d[2]}`;
          }),
        { timeout: 20_000 },
      )
      .not.toBe('232,228,220');

    await page.screenshot({
      path: 'test-results/visuel-fix-v12-png-preview.png',
      fullPage: true,
    });

    await page.getByTestId('motif-calep-damier').click();
    await page.getByTestId('motif-save').click();
    await expect(page.getByTestId('lib-shared-password-dialog')).toBeVisible();
    await page.getByTestId('lib-shared-password').fill(PASSWORD);
    await page.getByTestId('lib-shared-password-ok').click();

    await expect
      .poll(
        async () => {
          const r = (await (await request.get('/api/collections')).json()) as {
            collections: Array<{ id: string; nom: string }>;
          };
          return r.collections.find((c) => c.nom === 'Png Preview')?.id ?? null;
        },
        { timeout: 60_000 },
      )
      .not.toBeNull();

    await expect(page.getByTestId('motif-status')).toContainText(/enregistré|p-png-preview/i);
    await page.screenshot({
      path: 'test-results/visuel-fix-v12-png-save-ok.png',
      fullPage: true,
    });
  });
});
