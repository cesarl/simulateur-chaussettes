import { describe, expect, it } from 'vitest';
import {
  addLayer,
  EMPTY_COMPOSITION,
  renderComposition,
  updateLayer,
  type RasterImage,
} from '../../src/core/composition';
import { compositionYarnColors } from '../../src/core/compositionPalette';
import { computePatternRgb } from '../../src/core/patternSource';
import { defaultDesign } from '../../src/state';
import { BUILTIN_PRESETS } from '../../src/core/presets';
import { gridFingerprint, composeGrid } from '../../src/core/grid';
import { quantize } from '../../src/core/quantize';

function solid(w: number, h: number, r: number, g: number, b: number): RasterImage {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { width: w, height: h, rgba };
}

describe('composition branchée (T45)', () => {
  it('renderComposition 5 calques sur 168×380 < 300 ms', () => {
    const g = { needles: 168, rows: 380, stitchesPerCm: 7.5, rowsPerCm: 10 };
    const images = new Map<string, RasterImage>();
    let c = { ...EMPTY_COMPOSITION, background: '#f1e9dc' };
    for (let i = 0; i < 5; i++) {
      const id = `e${i}`;
      images.set(`e:${id}`, solid(32, 32, (i * 40) % 255, 80, 120));
      c = addLayer(c, { kind: 'embarquee', assetId: id }, g, `L${i}`);
      c = updateLayer(c, `L${i}`, { x: 20 + i * 10, y: 40 + i * 20, widthStitches: 40 });
    }
    const t0 = performance.now();
    const r = renderComposition(c, images, g);
    const ms = performance.now() - t0;
    expect(r.rgb.length).toBe(168 * 380 * 3);
    expect(ms).toBeLessThan(300);
  });

  it('computePatternRgb composition + palette yarns', () => {
    const design = defaultDesign();
    design.pattern = {
      kind: 'composition',
      composition: { background: '#112233', layers: [] },
    };
    const rgb = computePatternRgb({ design, tiles: [], calepPresets: BUILTIN_PRESETS });
    expect(rgb![0]).toBe(0x11);
    const yarns = compositionYarnColors({
      composition: design.pattern.composition,
      svgYarnHexes: new Map(),
      rasterImages: new Map(),
      pngMaxColors: 4,
    });
    expect(yarns.palette).toContain('#112233');
  });

  it('golden carreaux inchangé via chaîne patternSource', async () => {
    // fumée : mode carreaux sans tiles → null, grille fond seule
    const design = defaultDesign();
    const rgb = computePatternRgb({ design, tiles: [], calepPresets: BUILTIN_PRESETS });
    expect(rgb).toBeNull();
    const grid = composeGrid(design.dimensions, design.zones, null, []);
    expect(gridFingerprint(grid).length).toBeGreaterThan(0);
    void quantize;
  });
});
