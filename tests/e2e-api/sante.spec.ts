import { test, expect } from '@playwright/test';

test.describe('API Worker T80', () => {
  test('/api/sante renvoie ok et db', async ({ request }) => {
    const res = await request.get('/api/sante');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { ok: boolean; db: boolean };
    expect(body).toEqual({ ok: true, db: true });
  });

  test('la page d’accueil est servie par les assets', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });
});
