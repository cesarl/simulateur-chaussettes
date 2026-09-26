/**
 * Empreintes de référence (T41) — filet de sécurité carreaux.
 * Les valeurs attendues sont figées ; ne jamais les modifier pour « faire passer ».
 * Si ce test casse, corriger le code métier, pas ce fichier.
 *
 * Fixtures PNG (filtre 0) dans tests/fixtures/golden/ — régénérables via
 * `node scripts/rasterize-golden-fixtures.mjs` (ne pas régénérer sans raison).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { composeGrid, gridFingerprint } from '../../src/core/grid';
import { samplePattern } from '../../src/core/layout';
import { quantize } from '../../src/core/quantize';
import { defaultDimensions, MACHINE_LIMITS } from '../../src/core/sizes';
import { layoutFromTilesAround } from '../../src/state';
import { applyGeneratedPreset, BUILTIN_PRESETS } from '../../src/core/presets';
import { yarnColors, type Catalogue, type NuancierColor, type ZoneColors } from '../../src/core/collections';
import { decodePng } from '../../src/io/pngCodec';
import type { LayoutSettings, QuantizeSettings, TileAsset, ZoneSettings } from '../../src/core/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const goldenDir = path.join(root, 'tests/fixtures/golden');

/** Empreintes enregistrées une fois (avant toute modification V6). Ne jamais modifier. */
const EXPECTED = {
  exemplesSuite3: '61919254',
  medinaDamier4Random: 'a7801712',
  lianesReco1Femme: '14de87a4',
  quinconceRotAlea5: 'cc408b99',
} as const;

async function loadPngTile(fileName: string, id: string): Promise<TileAsset> {
  const bytes = new Uint8Array(fs.readFileSync(path.join(goldenDir, fileName)));
  const { width, height, rgba } = await decodePng(bytes);
  return { id, name: id, source: 'png', width, height, rgba };
}

function defaultZones(partial: Partial<ZoneSettings> = {}): ZoneSettings {
  return {
    cuffEnabled: true,
    cuffColor: '#1f3a5f',
    heelColor: '#b5462f',
    toeColor: '#1d1d1b',
    patternOnFoot: true,
    footColor: '#f4f1ea',
    heelHeightMm: 55,
    heelDepthMm: 72,
    heelSpread: 100,
    ...partial,
  };
}

function defaultQuantize(partial: Partial<QuantizeSettings> = {}): QuantizeSettings {
  return {
    maxColors: 4,
    paletteMode: 'auto',
    palette: [],
    sampling: 'majoritaire',
    despeckle: false,
    maxFloat: MACHINE_LIMITS.maxFloat,
    ...partial,
  };
}

function fingerprintOf(
  tiles: TileAsset[],
  layout: LayoutSettings,
  dims: ReturnType<typeof defaultDimensions>,
  zones: ZoneSettings,
  quantizeSettings: QuantizeSettings,
  presets = BUILTIN_PRESETS,
): string {
  const rgb = samplePattern(tiles, layout, dims, zones, quantizeSettings.sampling, presets);
  const reduced = quantize(rgb, dims.needles, quantizeSettings);
  const grid = composeGrid(dims, zones, reduced.indices, reduced.palette);
  return gridFingerprint(grid);
}

function syncMiniCatalogue(): { cat: Catalogue; nuancier: Map<string, NuancierColor> } {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-cat-'));
  execFileSync(
    process.execPath,
    [path.join(root, 'scripts/sync-carreaux.mjs'), '--source', path.join(root, 'tests/fixtures/configurateur-mini'), '--out', out],
    { encoding: 'utf8' },
  );
  const cat = JSON.parse(fs.readFileSync(path.join(out, 'catalogue.json'), 'utf8')) as Catalogue;
  const nuancier = new Map(cat.nuancier.map((c) => [c.id, c]));
  fs.rmSync(out, { recursive: true, force: true });
  return { cat, nuancier };
}

describe('empreintes de référence carreaux (T41)', () => {
  it('1 — carreaux d’exemple, à la suite 3 motifs, homme, bord-côte', async () => {
    const tiles = await Promise.all([
      loadPngTile('exemple-damier.png', 'ex1'),
      loadPngTile('exemple-etoile.png', 'ex2'),
      loadPngTile('exemple-quart.png', 'ex3'),
    ]);
    const dims = defaultDimensions('homme');
    const sized = layoutFromTilesAround(dims.needles, 6, 0, dims.stitchesPerCm, dims.rowsPerCm, true, 32);
    const layout: LayoutSettings = {
      calepinage: applyGeneratedPreset('g-suite', 1)!,
      tileIds: tiles.map((t) => t.id),
      tileStitches: sized.tileStitches,
      tileRows: sized.tileRows,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#d9d3c7',
      offsetStitches: 0,
      offsetRows: 0,
      seam: 'dos',
      tilesAround: sized.tilesAround,
      tileSizeMode: 'around',
    };
    expect(fingerprintOf(tiles, layout, dims, defaultZones(), defaultQuantize())).toBe(EXPECTED.exemplesSuite3);
  });

  it('2 — medina, damier_4_random graine 7, couleurs d’origine', async () => {
    const { cat, nuancier } = syncMiniCatalogue();
    const medina = cat.collections.find((c) => c.id === 'medina')!;
    const colors: ZoneColors = { ...medina.couleursParDefaut };
    const yarns = yarnColors(medina, colors, nuancier);
    const tiles = await Promise.all(
      medina.variations.map((v) => loadPngTile(`medina-${v.name}.png`, `medina-${v.name}`)),
    );
    const dims = defaultDimensions('homme');
    const sized = layoutFromTilesAround(dims.needles, 4, 0, dims.stitchesPerCm, dims.rowsPerCm, true, 32);
    const layout: LayoutSettings = {
      calepinage: {
        source: 'prereglage',
        presetId: 'damier_4_random',
        genere: { ordre: 'unique', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 },
        appareil: 'droit',
        rotationGlobale: 0,
        graine: 7,
      },
      tileIds: tiles.map((t) => t.id),
      tileStitches: sized.tileStitches,
      tileRows: sized.tileRows,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#d9d3c7',
      offsetStitches: 0,
      offsetRows: 0,
      seam: 'dos',
      tilesAround: sized.tilesAround,
      tileSizeMode: 'around',
    };
    expect(
      fingerprintOf(
        tiles,
        layout,
        dims,
        defaultZones(),
        defaultQuantize({
          paletteMode: 'manuelle',
          palette: yarns.map((y) => y.hex),
          maxColors: Math.max(2, Math.min(8, yarns.length)),
        }),
      ),
    ).toBe(EXPECTED.medinaDamier4Random);
  });

  it('3 — lianes, suggestion artiste 1, femme, sans bord-côte, raccord intérieur', async () => {
    const { cat, nuancier } = syncMiniCatalogue();
    const lianes = cat.collections.find((c) => c.id === 'lianes')!;
    const colors: ZoneColors = { ...lianes.couleursParDefaut, ...lianes.recommandations[0]! };
    const yarns = yarnColors(lianes, colors, nuancier);
    const tiles = await Promise.all(
      lianes.variations.map((v) => loadPngTile(`lianes-reco1-${v.name}.png`, `lianes-${v.name}`)),
    );
    const dims = defaultDimensions('femme');
    const sized = layoutFromTilesAround(dims.needles, 6, 0, dims.stitchesPerCm, dims.rowsPerCm, true, 32);
    const layout: LayoutSettings = {
      calepinage: {
        source: 'prereglage',
        presetId: 'Liane_1',
        genere: { ordre: 'unique', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 },
        appareil: 'droit',
        rotationGlobale: 0,
        graine: 1,
      },
      tileIds: tiles.map((t) => t.id),
      tileStitches: sized.tileStitches,
      tileRows: sized.tileRows,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#d9d3c7',
      offsetStitches: 0,
      offsetRows: 0,
      seam: 'interieur',
      tilesAround: sized.tilesAround,
      tileSizeMode: 'around',
    };
    expect(
      fingerprintOf(
        tiles,
        layout,
        dims,
        defaultZones({ cuffEnabled: false }),
        defaultQuantize({
          paletteMode: 'manuelle',
          palette: yarns.map((y) => y.hex),
          maxColors: Math.max(2, Math.min(8, yarns.length)),
        }),
      ),
    ).toBe(EXPECTED.lianesReco1Femme);
  });

  it('4 — quinconce + rotation aléatoire, 5 sur le tour, talon 40 mm', async () => {
    const tiles = await Promise.all([
      loadPngTile('exemple-damier.png', 'ex1'),
      loadPngTile('exemple-etoile.png', 'ex2'),
      loadPngTile('exemple-quart.png', 'ex3'),
    ]);
    const dims = defaultDimensions('homme');
    const sized = layoutFromTilesAround(dims.needles, 5, 0, dims.stitchesPerCm, dims.rowsPerCm, true, 32);
    const layout: LayoutSettings = {
      calepinage: { ...applyGeneratedPreset('g-suite-rotalea', 1)!, appareil: 'quinconce-h' },
      tileIds: tiles.map((t) => t.id),
      tileStitches: sized.tileStitches,
      tileRows: sized.tileRows,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#d9d3c7',
      offsetStitches: 0,
      offsetRows: 0,
      seam: 'dos',
      tilesAround: sized.tilesAround,
      tileSizeMode: 'around',
    };
    expect(
      fingerprintOf(tiles, layout, dims, defaultZones({ heelHeightMm: 40 }), defaultQuantize()),
    ).toBe(EXPECTED.quinconceRotAlea5);
  });
});
