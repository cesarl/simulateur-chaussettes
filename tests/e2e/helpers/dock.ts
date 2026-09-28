import type { Page } from '@playwright/test';

/** Ouvre le menu + Calque puis choisit Motif / Image / Dessin (T92). */
export async function dockAdd(
  page: Page,
  kind: 'motif' | 'image' | 'dessin',
): Promise<void> {
  await page.getByTestId('dock-add-calque').click();
  await page.getByTestId(`dock-add-${kind}`).click();
}
