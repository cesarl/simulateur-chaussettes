import { defineConfig, devices } from '@playwright/test';

/**
 * Tests e2e de l'API Worker (`/api/*`) : build + D1 local + wrangler dev.
 * Les e2e UI restent sur `playwright.config.ts` (vite preview) — voir DECISIONS D66.
 */
export default defineConfig({
  testDir: 'tests/e2e-api',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run db:migrate:local && wrangler dev --port 4173',
    url: 'http://localhost:4173/api/sante',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
