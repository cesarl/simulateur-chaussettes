import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { yarnColors, type Catalogue, type NuancierColor } from '../../src/core/collections';
import { quantize } from '../../src/core/quantize';
import type { QuantizeSettings } from '../../src/core/types';

const root = path.resolve(__dirname, '../..');
const fixture = path.join(root, 'tests/fixtures/configurateur-mini');
let cat: Catalogue;
let nuancier: Map<string, NuancierColor>;

beforeAll(() => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-'));
  execFileSync(process.execPath, [path.join(root, 'scripts/sync-carreaux.mjs'), '--source', fixture, '--out', out]);
  cat = JSON.parse(fs.readFileSync(path.join(out, 'catalogue.json'), 'utf8'));
  nuancier = new Map(cat.nuancier.map((c) => [c.id, c]));
});

describe('palette collection medina', () => {
  it('couleurs d’origine → palette motif = hex BW002, OR008, WT001, BL017', () => {
    const medina = cat.collections.find((c) => c.id === 'medina')!;
    const yarns = yarnColors(medina, medina.couleursParDefaut, nuancier);
    expect(yarns.map((y) => y.id)).toEqual(['BW002', 'OR008', 'WT001', 'BL017']);
    const expected = yarns.map((y) => y.hex.toLowerCase());
    expect(expected).toEqual(
      ['BW002', 'OR008', 'WT001', 'BL017'].map((id) => nuancier.get(id)!.hex.toLowerCase()),
    );

    // Grille synthétique uniquement dans ces 4 couleurs (comme après recoloration SVG).
    const width = 8;
    const height = 4;
    const rgb = new Uint8ClampedArray(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const yarn = yarns[i % yarns.length]!;
      const hex = yarn.hex;
      const o = i * 3;
      rgb[o] = parseInt(hex.slice(1, 3), 16);
      rgb[o + 1] = parseInt(hex.slice(3, 5), 16);
      rgb[o + 2] = parseInt(hex.slice(5, 7), 16);
    }
    const settings: QuantizeSettings = {
      maxColors: 4,
      paletteMode: 'manuelle',
      palette: expected,
      sampling: 'majoritaire',
      despeckle: false,
      maxFloat: 7,
    };
    const result = quantize(rgb, width, settings);
    expect(result.palette.map((h) => h.toLowerCase()).sort()).toEqual([...expected].sort());
    expect(result.palette).toHaveLength(4);
  });
});
