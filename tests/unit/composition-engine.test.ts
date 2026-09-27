import { describe, expect, it } from 'vitest';
import {
  addLayer,
  EMPTY_COMPOSITION,
  renderComposition,
  updateLayer,
  type RasterImage,
} from '../../src/core/composition';
import { compositionYarnColors } from '../../src/core/compositionPalette';
import { createMotifRgbCache, computeStackRgb } from '../../src/core/stackCompute';
import { defaultDesign } from '../../src/state';
import { BUILTIN_PRESETS } from '../../src/core/presets';
import { gridFingerprint, composeGrid } from '../../src/core/grid';
import { quantize } from '../../src/core/quantize';
import { newFondLayer, normalizeStack, newImageLayer } from '../../src/core/layers';

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

describe('composition / pile (T45→T51)', () => {
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

  it('renderStack fond seul + palette yarns composition', () => {
    const design = {
      ...defaultDesign(),
      layers: normalizeStack([newFondLayer('#112233')]),
    };
    const cache = createMotifRgbCache();
    const { rgb } = computeStackRgb({
      design,
      tiles: [],
      presets: BUILTIN_PRESETS,
      cache,
    });
    expect(rgb![0]).toBe(0x11);
    const yarns = compositionYarnColors({
      composition: { background: '#112233', layers: [] },
      svgYarnHexes: new Map(),
      rasterImages: new Map(),
      pngMaxColors: 4,
    });
    expect(yarns.palette).toContain('#112233');
  });

  it('pile sans motif → grille fond seule', () => {
    const design = defaultDesign();
    // Motif sans carreaux → fond
    const cache = createMotifRgbCache();
    const { rgb } = computeStackRgb({ design, tiles: [], presets: BUILTIN_PRESETS, cache });
    expect(rgb).not.toBeNull();
    const grid = composeGrid(design.dimensions, design.zones, null, []);
    expect(gridFingerprint(grid).length).toBeGreaterThan(0);
    void quantize;
    void newImageLayer;
  });
});
