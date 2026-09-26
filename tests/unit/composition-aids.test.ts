import { describe, expect, it } from 'vitest';
import { countIsolatedStitches } from '../../src/core/compositionAids';

describe('compositionAids', () => {
  it('détecte une maille isolée au milieu d’un aplats', () => {
    const width = 5;
    const height = 5;
    const indices = new Uint8Array(width * height).fill(0);
    indices[2 * width + 2] = 1; // centre
    const report = countIsolatedStitches(indices, width, height, 0.01);
    expect(report.isolatedCount).toBe(1);
    expect(report.tooFine).toBe(true);
  });

  it('ignore un aplats uniforme', () => {
    const width = 8;
    const height = 8;
    const indices = new Uint8Array(width * height).fill(3);
    const report = countIsolatedStitches(indices, width, height);
    expect(report.isolatedCount).toBe(0);
    expect(report.tooFine).toBe(false);
  });
});
