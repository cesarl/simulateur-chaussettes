import { describe, expect, it } from 'vitest';
import { getState, resetState, subscribe, update } from '../../src/state';

describe('état initial', () => {
  it('part d’un modèle homme en grille, 4 couleurs auto, bord-côte présent', () => {
    resetState();
    const { design, tiles, error } = getState();
    expect(design.version).toBe(1);
    expect(design.dimensions.size).toBe('homme');
    expect(design.dimensions.needles).toBeGreaterThan(0);
    expect(design.layout.calepinage.genere.ordre).toBe('unique');
    expect(design.layout.calepinage.appareil).toBe('droit');
    expect(design.quantize.maxColors).toBe(4);
    expect(design.quantize.paletteMode).toBe('auto');
    expect(design.zones.cuffEnabled).toBe(true);
    expect(design.dimensions.cuffRows).toBeGreaterThan(0);
    expect(tiles).toEqual([]);
    expect(error).toBeNull();
  });

  it('fusionne un réglage partiel et prévient les abonnés', () => {
    resetState();
    const seen: number[] = [];
    const stop = subscribe((state) => seen.push(state.design.quantize.maxColors));
    update({ design: { quantize: { maxColors: 3 } } });
    const { design } = getState();
    expect(design.quantize.maxColors).toBe(3);
    expect(design.quantize.paletteMode).toBe('auto');
    expect(design.layout.calepinage.genere.ordre).toBe('unique');
    expect(design.layout.calepinage.appareil).toBe('droit');
    expect(design.zones.cuffEnabled).toBe(true);
    expect(seen).toEqual([3]);
    stop();
    update({ design: { quantize: { maxColors: 4 } } });
    expect(seen).toEqual([3]);
  });
});
