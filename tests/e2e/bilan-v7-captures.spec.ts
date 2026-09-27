/**
 * Captures visionneuse des deux liens réels (T59 bilan).
 */
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const LIENS = {
  jardin: {
    hash: '#p=1.XVBBTsMwEPxKNVxdlKQIKh8pFxBcAIkDQsjYm9TIsYtjS5DKf0ebtIDQXryzM57Z3cNA7uFVT5C4UdFYvzCLKzXmCAEdnCOdbPDMsgYS7xNnaZbmlxPiwPMxeFrWkHh6rKoKYgYaSFzeVk2DUgSc-go5MVsrRzvrVUfcDSFHzRl2kSJ1jmHBzUDpmn2N6i3F1xUEOvIUJ1WIhh8Ysk0TXw33yndEkDW7JevoIdmktzRANuvT-oDZke6CYWkbiVDmrNMWOrfthneCxMnZ6nz9VkNgS-R-0PaCCwIp0H-wCHxk5ZMdp4S9-twcDtRwPkcpHa175TM5NwefBpDPf34_ur8UAUOabfboZ60O1qOU8g0',
    file: 'visuel-T59-visionneuse-jardin.png',
  },
  palm: {
    hash: '#p=1.XY87T8QwEIT_Chpan5QEdCe55GgoECgtotg4ezlLfgTHkeAi_3e0CS_ReWd2_M0u6KEXBPIMjWdy_uqOyZyhYKJzbLKNQTZsD42RnN91v35Mk3iXGHhXQ6O9r6oD1CY00Hhqq6pBKQqOPuKcZduQ49EGGlimKc7JCHtMnHhwIisZJs4PwiTHlKNNIg8cOK2xmHp5YJptXgM0tRQGZui6CE8qrOXMfDodpSo0rnl_2N_WUDgzux_1dNNVXQWFHPm_WBTeZgrZXlaup_fj192NUB3nzI-xly6ewszObXVWA_rlz-_f9Nei0LMRzAK_ZU20AaWUTw',
    file: 'visuel-T59-visionneuse-palm.png',
  },
} as const;

test('T59 captures visionneuse liens réels', async ({ page }) => {
  fs.mkdirSync(path.join(root, 'docs/captures/v7'), { recursive: true });
  for (const [key, lien] of Object.entries(LIENS)) {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });
    // Forcer un vrai rechargement entre les deux liens (sinon seul le hash change).
    await page.goto('about:blank');
    await page.goto(`/${lien.hash}`);
    await page.waitForFunction(() => window.__SIM__?.ready === true, null, { timeout: 60_000 });
    await expect(page.getByTestId('panel')).toBeHidden();
    await page.waitForFunction(
      (expected) => (window.__SIM__?.activeCollectionId ?? '') === expected,
      key === 'jardin' ? 'jardin-d-dazur' : 'palm-beach',
      { timeout: 30_000 },
    );
    await page.waitForTimeout(800);
    const dest = path.join(root, 'docs/captures/v7', lien.file);
    await page.screenshot({ path: dest, fullPage: true });
    expect(fs.existsSync(dest)).toBe(true);
    const media = '/cursor/stores/self/media/v7';
    fs.mkdirSync(media, { recursive: true });
    fs.copyFileSync(dest, path.join(media, lien.file));
    console.log('captured', key, lien.file);
  }
});
