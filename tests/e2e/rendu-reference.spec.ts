import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

const VIEWS = ['trois-quarts', 'profil-exterieur', 'dos'] as const;
const BG = '#ecebe8';
const SIZE = 1200;

test('silhouette ≥ 0,90 vs captures homme-etoile de référence', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('cesar-bazaar');
  });
  await page.goto('/?dev');
  await page.waitForFunction(() => window.__SIM__?.ready === true && (window.__SIM__?.geometryBuilds ?? 0) >= 1);

  const before = await page.evaluate(() => window.__SIM__?.computeId ?? 0);
  await page.evaluate(() => window.__SIM__?.loadFixture('carreau-test-etoile.svg'));
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, before);

  const configured = await page.evaluate(() => {
    const needles = window.__SIM__!.design.dimensions.needles;
    const aspect = window.__SIM__!.design.dimensions.stitchesPerCm / window.__SIM__!.design.dimensions.rowsPerCm;
    const tileStitches = Math.round(needles / 6);
    const tileRows = Math.max(1, Math.round(tileStitches / aspect));
    const id = window.__SIM__!.computeId;
    window.__SIM__!.setDesign({
      layout: {
        calepinage: {
          source: 'genere',
          presetId: null,
          genere: { ordre: 'unique', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 },
          appareil: 'quinconce-h',
          rotationGlobale: 0,
          graine: 1,
        },
        tileStitches,
        tileRows,
        offsetStitches: 0,
        offsetRows: 0,
      },
      zones: {
        cuffEnabled: true,
        cuffColor: '#1f3a5f',
        heelColor: '#c0392b',
        toeColor: '#c0392b',
        patternOnFoot: true,
      },
      quantize: { maxColors: 3, paletteMode: 'auto', despeckle: false },
    });
    return id;
  });
  await page.waitForFunction((id) => (window.__SIM__?.computeId ?? 0) > id, configured);
  await page.waitForFunction(() => (window.__SIM__?.patternPalette.length ?? 0) > 0);

  mkdirSync('test-results', { recursive: true });

  for (const view of VIEWS) {
    const dataUrl = await page.evaluate(
      async ({ viewName, size, background }) => {
        const capture = window.__SIM__?.captureView;
        if (!capture) throw new Error('captureView absent');
        // Empreintes de référence historiques en carré (avant EXPORT_ASPECT 4:5).
        return capture(viewName, size, background, 1);
      },
      { viewName: view, size: SIZE, background: BG },
    );
    const produced = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
    writeFileSync(`test-results/visuel-T21-${view}.png`, produced);

    const reference = readFileSync(`reference/sock3d/captures/homme-etoile-${view}.png`);
    const iou = await page.evaluate(
      async ({ producedB64, referenceB64, background, tol }) => {
        async function decode(b64: string): Promise<ImageData> {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${b64}`)).blob(),
          );
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D indisponible');
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        function mask(data: ImageData, bg: [number, number, number], tolerance: number): Uint8Array {
          const out = new Uint8Array(data.width * data.height);
          const px = data.data;
          for (let i = 0, p = 0; i < out.length; i++, p += 4) {
            const dr = Math.abs((px[p] ?? 0) - bg[0]);
            const dg = Math.abs((px[p + 1] ?? 0) - bg[1]);
            const db = Math.abs((px[p + 2] ?? 0) - bg[2]);
            out[i] = dr > tolerance || dg > tolerance || db > tolerance ? 1 : 0;
          }
          return out;
        }

        const a = await decode(producedB64);
        const b = await decode(referenceB64);
        if (a.width !== b.width || a.height !== b.height) {
          throw new Error(`Tailles différentes : ${a.width}×${a.height} vs ${b.width}×${b.height}`);
        }
        const bg: [number, number, number] = [
          Number.parseInt(background.slice(1, 3), 16),
          Number.parseInt(background.slice(3, 5), 16),
          Number.parseInt(background.slice(5, 7), 16),
        ];
        const ma = mask(a, bg, tol);
        const mb = mask(b, bg, tol);
        let inter = 0;
        let union = 0;
        for (let i = 0; i < ma.length; i++) {
          const x = ma[i] ?? 0;
          const y = mb[i] ?? 0;
          if (x | y) union += 1;
          if (x & y) inter += 1;
        }
        return union === 0 ? 0 : inter / union;
      },
      {
        producedB64: produced.toString('base64'),
        referenceB64: reference.toString('base64'),
        background: BG,
        tol: 6,
      },
    );

    expect(iou, `recouvrement ${view}`).toBeGreaterThanOrEqual(0.9);
  }

  expect(errors).toEqual([]);
});
