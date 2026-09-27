/**
 * T66 — synchronisation bibliotheque-images/ → public/images/.
 * Appelle le module Node réel via un sous-processus (évite le typage .mjs sous tsc).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts');

let tmp: string | null = null;

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe('T66 syncBibliothequeImages', () => {
  it('produit un index.json correct et ignore un fichier manquant avec avertissement', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-sync-'));
    const sourceDir = path.join(tmp, 'bibliotheque-images');
    const outDir = path.join(tmp, 'public', 'images');
    const resultPath = path.join(tmp, 'result.json');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n');
    fs.writeFileSync(
      path.join(sourceDir, 'images.json'),
      JSON.stringify(
        [
          { id: 'logo', nom: 'Logo', fichier: 'logo.svg', categorie: 'Logos' },
          { id: 'manquant', nom: 'Absent', fichier: 'absent.png', categorie: 'Test' },
        ],
        null,
        2,
      ),
    );

    const runner = `
import { writeFileSync } from 'node:fs';
import { syncBibliothequeImages } from ${JSON.stringify(path.join(scriptsDir, 'syncBibliothequeImages.mjs'))};
const warnings = [];
const result = syncBibliothequeImages({
  sourceDir: ${JSON.stringify(sourceDir)},
  outDir: ${JSON.stringify(outDir)},
  warn: (m) => warnings.push(m),
});
writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ result, warnings }));
`;
    const runnerPath = path.join(tmp, 'run.mjs');
    fs.writeFileSync(runnerPath, runner);
    execFileSync(process.execPath, [runnerPath], { encoding: 'utf8' });

    const payload = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as {
      result: { index: Array<{ id: string; nom: string; fichier: string; categorie: string }> };
      warnings: string[];
    };

    expect(payload.result.index).toEqual([
      { id: 'logo', nom: 'Logo', fichier: 'logo.svg', categorie: 'Logos' },
    ]);
    expect(fs.existsSync(path.join(outDir, 'logo.svg'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'absent.png'))).toBe(false);
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8')) as unknown;
    expect(written).toEqual(payload.result.index);
    expect(payload.warnings.some((w) => /absent\.png|manquant/i.test(w))).toBe(true);
  });
});
