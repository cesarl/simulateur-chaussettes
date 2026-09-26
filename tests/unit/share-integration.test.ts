import { describe, expect, it } from 'vitest';
import { gridFingerprint } from '../../src/core/grid';
import {
  buildShareUrl,
  decodeShareHash,
  defaultShareJson,
  designToShareJson,
  shareJsonToApp,
} from '../../src/io/shareState';
import { defaultDesign, getState, resetState, update } from '../../src/state';

describe('intégration lien de partage', () => {
  it('état modifié → encode → decode → même design (diff vs défaut)', async () => {
    resetState();
    update({
      design: {
        name: 'Test partage',
        zones: { heelHeightMm: 88, cuffColor: '#112233' },
        layout: {
          tilesAround: 4,
          seam: 'interieur',
          calepinage: { graine: 42 },
        },
        decor: { mode: 'sol', tileCm: 15 },
      },
      activeCollectionId: 'medina',
      zoneColors: { 'zone-1': 'BW002', 'zone-2': 'OR012' },
      paletteOptionId: 'reco-1',
    }, { skipHistory: true });

    const built = await buildShareUrl(getState());
    expect(built.hash.startsWith('#p=2.')).toBe(true);
    expect(built.tooLong).toBe(false);

    const decoded = await decodeShareHash(built.hash);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.parsed.design.name).toBe('Test partage');
    expect(decoded.parsed.design.zones.heelHeightMm).toBe(88);
    expect(decoded.parsed.design.zones.cuffColor).toBe('#112233');
    expect(decoded.parsed.design.layout.tilesAround).toBe(4);
    expect(decoded.parsed.design.layout.seam).toBe('interieur');
    expect(decoded.parsed.design.decor.mode).toBe('sol');
    expect(decoded.parsed.activeCollectionId).toBe('medina');
    expect(decoded.parsed.paletteOptionId).toBe('reco-1');

    // Les champs non touchés restent aux défauts.
    const defaults = defaultDesign();
    expect(decoded.parsed.design.dimensions.needles).toBe(defaults.dimensions.needles);
  });

  it('defaultShareJson est stable et court', async () => {
    const d = defaultShareJson();
    const again = designToShareJson({
      ...getState(),
      design: defaultDesign(),
      tiles: [],
      activeCollectionId: null,
      zoneColors: null,
      paletteOptionId: null,
    });
    expect(shareJsonToApp(d).design.name).toBe(defaultDesign().name);
    const { length } = await buildShareUrl({
      ...getState(),
      design: defaultDesign(),
      tiles: [],
      activeCollectionId: null,
      zoneColors: null,
      paletteOptionId: null,
    });
    expect(length).toBeLessThan(40);
    expect(again).toEqual(d);
    expect(gridFingerprint).toBeTypeOf('function');
  });
});
