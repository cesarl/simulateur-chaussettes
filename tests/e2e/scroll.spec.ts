import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function expandAllSections(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLDetailsElement>('#panel details').forEach((d) => {
      d.open = true;
    });
  });
}

async function assertSingleScrollbar(page: Page): Promise<void> {
  await expandAllSections(page);
  const metrics = await page.evaluate(() => {
    const se = document.scrollingElement!;
    const body = document.querySelector<HTMLElement>('#panel-body') ?? document.querySelector<HTMLElement>('#panel')!;
    return {
      scrollHeight: se.scrollHeight,
      innerHeight: window.innerHeight,
      panelScrollHeight: body.scrollHeight,
      panelClientHeight: body.clientHeight,
    };
  });
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
  expect(metrics.panelScrollHeight).toBeGreaterThan(metrics.panelClientHeight);
}

test('un seul ascenseur à 1400×900', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeVisible();
  await assertSingleScrollbar(page);
  expect(errors).toEqual([]);
});

test('un seul ascenseur à 1100×800', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true);
  await expect(page.getByTestId('panel')).toBeVisible();
  await assertSingleScrollbar(page);
  expect(errors).toEqual([]);
});
