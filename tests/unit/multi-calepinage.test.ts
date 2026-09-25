import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHex } from '../../src/core/color';
import { applyGeneratedPreset, BUILTIN_PRESETS, migrateLegacyKind, presetById } from '../../src/core/presets';
import { samplePattern } from '../../src/core/layout';
import { defaultDimensions } from '../../src/core/sizes';
import type { LayoutSettings, TileAsset, ZoneSettings } from '../../src/core/types';

function solidTile(id: string, hex: string): TileAsset {
  const rgb = hexToRgb(hex);
  const rgba = new Uint8ClampedArray(4);
  rgba[0] = rgb.r;
  rgba[1] = rgb.g;
  rgba[2] = rgb.b;
  rgba[3] = 255;
  return { id, name: id, source: 'png', width: 1, height: 1, rgba };
}

const zones: ZoneSettings = {
  cuffEnabled: false,
  cuffColor: '#000000',
  heelColor: '#000000',
  toeColor: '#000000',
  patternOnFoot: false,
  footColor: '#000000',
  heelHeightMm: 55,
  heelDepthMm: 72,
  heelSpread: 100,
};

describe('multi-motifs', () => {
  it('suite avec 4 carreaux unis : les 4 couleurs apparaissent dans l’ordre', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    const tiles = colors.map((c, i) => solidTile(`t${i}`, c));
    const layout: LayoutSettings = {
      calepinage: applyGeneratedPreset('g-suite', 1)!,
      tileIds: tiles.map((t) => t.id),
      tileStitches: 4,
      tileRows: 4,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#000000',
      offsetStitches: 0,
      offsetRows: 0,
    };
    const dims = { ...defaultDimensions('homme'), needles: 16, cuffRows: 0, legRows: 4, heelRows: 0, footRows: 0, toeRows: 0 };
    const rgb = samplePattern(tiles, layout, dims, zones, 'majoritaire');
    const seen: string[] = [];
    for (let col = 0; col < 16; col += 4) {
      const i = col * 3;
      seen.push(rgbToHex(rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0));
    }
    expect(seen).toEqual(colors);
  });

  it('préréglage damier_16 avec 16 carreaux unis → 16 couleurs avant réduction', () => {
    const colors = Array.from({ length: 16 }, (_, i) => {
      const v = (i * 15) % 256;
      return rgbToHex(v, (v * 3) % 256, (255 - v) % 256);
    });
    const tiles = colors.map((c, i) => solidTile(`c${i}`, c));
    const preset = presetById('damier_16', BUILTIN_PRESETS)!;
    const layout: LayoutSettings = {
      calepinage: {
        source: 'prereglage',
        presetId: 'damier_16',
        genere: migrateLegacyKind('grille').genere,
        appareil: 'droit',
        rotationGlobale: 0,
        graine: 1,
      },
      tileIds: tiles.map((t) => t.id),
      tileStitches: 4,
      tileRows: 4,
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#000000',
      offsetStitches: 0,
      offsetRows: 0,
    };
    expect(preset.tilesUsed).toBe(16);
    const dims = {
      ...defaultDimensions('homme'),
      needles: 64,
      cuffRows: 0,
      legRows: 64,
      heelRows: 0,
      footRows: 0,
      toeRows: 0,
    };
    const rgb = samplePattern(tiles, layout, dims, zones, 'majoritaire', BUILTIN_PRESETS);
    const found = new Set<string>();
    for (let i = 0; i < rgb.length; i += 3) {
      found.add(rgbToHex(rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0));
    }
    expect(found.size).toBe(16);
  });
});
