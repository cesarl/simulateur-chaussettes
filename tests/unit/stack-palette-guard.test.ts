import { describe, expect, it } from 'vitest';
import { motifRows } from '../../src/core/layout';
import { newMotifLayer, renderStack, stackGauge, TEMPLATE_LAYOUT } from '../../src/core/layers';
import { quantize } from '../../src/core/quantize';
import { MACHINE_LIMITS } from '../../src/core/sizes';
import {
  analyzeStackPaletteGuard,
  reduceStackPaletteQuantize,
  stackPaletteEntries,
} from '../../src/core/stackPaletteGuard';
import { defaultDesign } from '../../src/state';
import type { Hex } from '../../src/core/types';

function solidMotifRgb(w: number, h: number, left: Hex, right: Hex): Uint8ClampedArray {
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hex = x < w / 2 ? left : right;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const o = (y * w + x) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }
  return rgb;
}

describe('stackPaletteGuard (T58)', () => {
  it('3 Motifs × 2 couleurs + Fond : bandeau puis réduction à N couleurs machine', () => {
    const base = defaultDesign();
    const m1 = base.layers.find((l) => l.kind === 'motif')!;
    expect(m1.kind).toBe('motif');

    let design = {
      ...base,
      quantize: { ...base.quantize, paletteFromLayers: true as const },
      layers: [
        base.layers[0]!,
        { ...m1, id: 'motif-a', name: 'Motif A' },
        newMotifLayer('motif-b', m1.source, TEMPLATE_LAYOUT, 'Motif B'),
        newMotifLayer('motif-c', m1.source, TEMPLATE_LAYOUT, 'Motif C'),
      ],
    };

    const gauge = stackGauge(design.dimensions, design.zones);
    const third = Math.max(1, Math.floor(gauge.rows / 3));
    design = {
      ...design,
      layers: design.layers.map((l) => {
        if (l.kind !== 'motif') return l;
        if (l.id === 'motif-a') return { ...l, bounds: { kind: 'bande' as const, fromRow: 0, toRow: third } };
        if (l.id === 'motif-b') {
          return { ...l, bounds: { kind: 'bande' as const, fromRow: third, toRow: third * 2 } };
        }
        if (l.id === 'motif-c') {
          return { ...l, bounds: { kind: 'bande' as const, fromRow: third * 2, toRow: gauge.rows } };
        }
        return l;
      }),
    };
    const keyColors = new Map<string, readonly Hex[]>([
      ['motif-a', ['#aa0000', '#00aa00']],
      ['motif-b', ['#0000aa', '#aaaa00']],
      ['motif-c', ['#aa00aa', '#00aaaa']],
    ]);
    const motifRgb = new Map<string, Uint8ClampedArray>([
      ['motif-a', solidMotifRgb(gauge.needles, gauge.rows, '#aa0000', '#00aa00')],
      ['motif-b', solidMotifRgb(gauge.needles, gauge.rows, '#0000aa', '#aaaa00')],
      ['motif-c', solidMotifRgb(gauge.needles, gauge.rows, '#aa00aa', '#00aaaa')],
    ]);
    const input = { motifRgb, images: new Map(), keyColors };
    const { rgb } = renderStack({ layers: design.layers, gauge, ...input });

    const entries = stackPaletteEntries(design.layers, input, rgb, { requirePixelPresence: false });
    expect(entries.length).toBe(7);

    const guard = analyzeStackPaletteGuard(design, input, rgb, MACHINE_LIMITS);
    expect(guard.overLimit).toBe(true);
    expect(guard.showBanner).toBe(true);
    expect(guard.machineMax).toBe(MACHINE_LIMITS.maxColorsTotal);

    const patch = reduceStackPaletteQuantize(rgb, MACHINE_LIMITS);
    expect(patch.paletteFromLayers).toBe(false);
    expect(patch.paletteMode).toBe('manuelle');
    expect(patch.palette).toHaveLength(MACHINE_LIMITS.maxColorsTotal);

    const reduced = quantize(rgb, design.dimensions.needles, {
      ...design.quantize,
      ...patch,
    });
    expect(reduced.palette).toHaveLength(MACHINE_LIMITS.maxColorsTotal);
    expect(reduced.palette.length).toBe(MACHINE_LIMITS.maxColorsTotal);

    const motifH = motifRows(design.dimensions, design.zones);
    expect(motifH).toBeGreaterThan(0);
  });
});
