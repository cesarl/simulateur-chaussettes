/**
 * T60 — palette appliquée et bandeau partagent la même liste (planStackPalette).
 */
import { describe, expect, it } from 'vitest';
import {
  newFondLayer,
  newMotifLayer,
  normalizeStack,
  renderStack,
  stackGauge,
  TEMPLATE_LAYOUT,
} from '../../src/core/layers';
import { MACHINE_LIMITS } from '../../src/core/sizes';
import { planStackPalette } from '../../src/core/stackPaletteGuard';
import { defaultDesign } from '../../src/state';
import type { Hex } from '../../src/core/types';

function solidRgb(w: number, h: number, left: Hex, right: Hex): Uint8ClampedArray {
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const hex = i % w < w / 2 ? left : right;
    rgb.set(
      [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)],
      i * 3,
    );
  }
  return rgb;
}

describe('planStackPalette (T60)', () => {
  it('palette appliquée et compte du bandeau sont toujours égaux', () => {
    const d0 = defaultDesign();
    const g = stackGauge(d0.dimensions, d0.zones);
    const bas = newMotifLayer('motif-bas', { kind: 'importes', tileIds: [] }, TEMPLATE_LAYOUT, 'Bas');
    const haut = newMotifLayer('motif-haut', { kind: 'importes', tileIds: [] }, TEMPLATE_LAYOUT, 'Haut');
    const layers = normalizeStack([newFondLayer('#111111'), bas, haut]);
    const motifRgb = new Map([
      ['motif-bas', solidRgb(g.needles, g.rows, '#aa0000', '#00aa00')],
      ['motif-haut', solidRgb(g.needles, g.rows, '#0000aa', '#aaaa00')],
    ]);
    const keyColors = new Map<string, readonly Hex[]>([
      ['motif-bas', ['#aa0000', '#00aa00']],
      ['motif-haut', ['#0000aa', '#aaaa00']],
    ]);
    const { rgb, owner } = renderStack({ layers, gauge: g, motifRgb, images: new Map(), keyColors });

    const cases: Array<{
      quantize: typeof d0.quantize;
      primaryYarns: readonly Hex[] | null;
      label: string;
    }> = [
      {
        label: 'calques (dessus recouvre)',
        quantize: { ...d0.quantize, paletteFromLayers: true },
        primaryYarns: null,
      },
      {
        label: 'manuelle 7 fils',
        quantize: {
          ...d0.quantize,
          paletteFromLayers: false,
          paletteMode: 'manuelle',
          palette: ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007'],
        },
        primaryYarns: null,
      },
      {
        label: 'auto',
        quantize: { ...d0.quantize, paletteFromLayers: false, paletteMode: 'auto', maxColors: 4 },
        primaryYarns: null,
      },
      {
        label: 'fils collection + fond',
        quantize: { ...d0.quantize, paletteFromLayers: false, paletteMode: 'auto' },
        primaryYarns: ['#f7f7f7', '#4368b1'],
      },
    ];

    for (const c of cases) {
      const plan = planStackPalette({
        design: { layers, quantize: c.quantize },
        input: { motifRgb, images: new Map(), keyColors },
        rendered: rgb,
        primaryYarns: c.primaryYarns,
        fondColor: '#111111',
        fondVisible: owner !== null && [...owner].some((v) => v === 0),
        limits: MACHINE_LIMITS,
      });
      const applied =
        plan.resolution.source === 'auto' ? [] : plan.quantizeSettings.palette.map((h) => h.toLowerCase());
      const banner = plan.guard.entries.map((e) => e.hex.toLowerCase());
      expect(banner, c.label).toEqual(plan.resolution.palette.map((h) => h.toLowerCase()));
      expect(applied, c.label).toEqual(plan.resolution.palette.map((h) => h.toLowerCase()));
      expect(plan.guard.overLimit, c.label).toBe(plan.resolution.overLimit);
      expect(plan.guard.showBanner, c.label).toBe(plan.resolution.overLimit);
    }
  });
});
