import { describe, expect, it } from 'vitest';
import { samplePattern } from '../../src/core/layout';
import { defaultDimensions } from '../../src/core/sizes';
import { NUANCIER_DEFAULT_ZONE_COLORS } from '../../src/core/nuancierDefaults';
import { BUILTIN_PRESETS, specFromCalepinageId } from '../../src/core/presets';
import {
  bakePersoPreset,
  bumpCellNextTile,
  bumpCellRotate,
  PERSO_PRESET_ID,
  serializeCalepinagePerso,
} from '../../src/core/motifPreviewEdit';
import { calepinageForCollection, presetsWithPerso } from '../../src/ui/collectionPicker';
import type { LayoutSettings, TileAsset, ZoneSettings } from '../../src/core/types';

function solidTile(id: string, r: number, g: number, b: number): TileAsset {
  const w = 4;
  const h = 4;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { id, name: id, source: 'png', width: w, height: h, rgba };
}

describe('calepinage perso → samplePattern (même bake que simulateur)', () => {
  it('les overrides changent le motif RGB vs calepinage nu', () => {
    const tiles = [solidTile('a', 200, 40, 40), solidTile('b', 20, 20, 20)];
    const dims = defaultDimensions('homme');
    const zones: ZoneSettings = {
      cuffEnabled: true,
      ...NUANCIER_DEFAULT_ZONE_COLORS,
      patternOnFoot: true,
      heelHeightMm: 55,
      heelDepthMm: 72,
      heelSpread: 100,
    };
    let map = new Map();
    map = bumpCellRotate(map, 0, 0);
    map = bumpCellRotate(map, 0, 0);
    map = bumpCellNextTile(map, 0, 0);
    const perso = serializeCalepinagePerso(4, 0, map)!;
    const source = { calepinageParDefaut: 'g-suite', calepinagePerso: perso };
    const calepPerso = calepinageForCollection(source);
    expect(calepPerso.presetId).toBe(PERSO_PRESET_ID);
    const presets = presetsWithPerso(source, tiles.length, BUILTIN_PRESETS);
    expect(presets.some((p) => p.id === PERSO_PRESET_ID)).toBe(true);

    const tileStitches = Math.max(2, Math.round(dims.needles / 6));
    const baseLayout: LayoutSettings = {
      calepinage: specFromCalepinageId('g-suite'),
      tileStitches,
      tileRows: Math.max(1, Math.round(tileStitches / (dims.stitchesPerCm / dims.rowsPerCm))),
      gapStitches: 0,
      gapRows: 0,
      gapColor: '#cfcec9',
      offsetStitches: 0,
      offsetRows: 0,
      seam: 'dos',
      tilesAround: 6,
      tileSizeMode: 'around',
      tileIds: tiles.map((t) => t.id),
    };
    const without = samplePattern(tiles, baseLayout, dims, zones, 'majoritaire', BUILTIN_PRESETS);
    const withPerso = samplePattern(
      tiles,
      { ...baseLayout, calepinage: calepPerso },
      dims,
      zones,
      'majoritaire',
      presets,
    );
    let diff = 0;
    for (let i = 0; i < without.length; i++) {
      if (without[i] !== withPerso[i]) diff++;
    }
    expect(diff).toBeGreaterThan(100);

    const baked = bakePersoPreset(specFromCalepinageId('g-suite', 1, 0), perso, 2, BUILTIN_PRESETS);
    expect(baked.cells[0]!.tile).toBe(1);
    expect(baked.cells[0]!.rot).toBe(180);
  });
});
