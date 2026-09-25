import { describe, expect, it } from 'vitest';
import { clampLegRows, defaultDimensions, stitchAspect, totalRows } from '../../src/core/sizes';

describe('tailles', () => {
  it('fournit des dimensions homme et femme cohérentes', () => {
    const h = defaultDimensions('homme');
    const f = defaultDimensions('femme');
    expect(h.needles).toBeGreaterThan(f.needles);
    expect(totalRows(h, true)).toBeGreaterThan(totalRows(h, false));
  });

  it('interdit d’allonger la tige au-delà du maximum', () => {
    const max = defaultDimensions('homme').legRows;
    expect(clampLegRows('homme', max + 50)).toBe(max);
    expect(clampLegRows('homme', 40)).toBe(40);
    expect(clampLegRows('homme', -3)).toBe(1);
  });

  it('calcule le rapport hauteur/largeur de maille', () => {
    expect(stitchAspect(defaultDimensions('homme'))).toBeCloseTo(0.75, 2);
  });
});
