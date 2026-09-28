import { describe, expect, it } from 'vitest';
import { samplePattern } from '../../src/core/layout';
import { migrateLegacyKind } from '../../src/core/presets';
import { quantize } from '../../src/core/quantize';
import { defaultDimensions } from '../../src/core/sizes';
import { defaultDesign, defaultMotifLayout } from '../../src/state';
import type { TileAsset } from '../../src/core/types';

function noisyTile(id: string, seed: number): TileAsset {
  const size = 48;
  const rgba = new Uint8ClampedArray(size * size * 4);
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = next() % 256;
    rgba[i * 4 + 1] = next() % 256;
    rgba[i * 4 + 2] = next() % 256;
    rgba[i * 4 + 3] = 255;
  }
  return { id, name: id, source: 'png', width: size, height: size, rgba };
}

describe('performances du recalcul', () => {
  it('mesure 200 aiguilles × 600 rangs, 2 carreaux, 6 couleurs', () => {
    const design = defaultDesign();
    const dims = {
      ...defaultDimensions('homme'),
      needles: 200,
      cuffRows: 0,
      legRows: 600,
      heelRows: 0,
      footRows: 0,
      toeRows: 0,
    };
    const zones = { ...design.zones, cuffEnabled: false, patternOnFoot: false };
    const layout = {
      ...defaultMotifLayout(),
      tileIds: ['a', 'b'],
      tileStitches: 24,
      tileRows: 32,
      calepinage: migrateLegacyKind('damier'),
    };
    const settings = { ...design.quantize, maxColors: 6, paletteMode: 'auto' as const, despeckle: true };
    // Passage à blanc (JIT) : hors mesure.
    samplePattern([noisyTile('a', 1), noisyTile('b', 2)], layout, dims, zones, 'majoritaire');
    const started = performance.now();
    const rgb = samplePattern([noisyTile('a', 1), noisyTile('b', 2)], layout, dims, zones, 'majoritaire');
    const reduced = quantize(rgb, dims.needles, settings);
    const elapsed = performance.now() - started;
    expect(reduced.palette.length).toBeLessThanOrEqual(6);
    expect(reduced.palette.length).toBeGreaterThan(0);
    // Budget produit 300 ms ; seuil de test = ×2 (voir .cursor/rules/20-tests.mdc).
    expect(elapsed).toBeLessThan(600);
  });
});
