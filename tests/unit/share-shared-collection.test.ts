import { describe, expect, it } from 'vitest';
import {
  designV2ToShareJson,
  shareJsonToDesignV2,
  newFondLayer,
  newMotifLayer,
  shareDefaultsFor,
  TEMPLATE_LAYOUT,
  designFromShare,
} from '../../src/core/layers';
import { encodeShare, decodeShare } from '../../src/io/shareLink';
import { NUANCIER_DEFAULTS } from '../../src/core/nuancierDefaults';

describe('share roundtrip collection p-', () => {
  it('conserve un calque Motif collection p-…', async () => {
    const design = {
      version: 2 as const,
      name: 'modele',
      dimensions: shareJsonToDesignV2({}).dimensions,
      zones: shareJsonToDesignV2({}).zones,
      quantize: shareJsonToDesignV2({}).quantize,
      decor: shareJsonToDesignV2({}).decor,
      layers: [
        newFondLayer(NUANCIER_DEFAULTS.fond),
        newMotifLayer(
          'motif-2',
          {
            kind: 'collection',
            collectionId: 'p-test-partage',
            colors: { 'zone-1': 'RD060', 'zone-2': 'BL016' },
            paletteId: 'defaut',
          },
          TEMPLATE_LAYOUT,
          'Test Partage',
        ),
      ],
    };
    const json = designV2ToShareJson(design);
    const defaults = shareDefaultsFor(2);
    const enc = await encodeShare({ design: json }, defaults);
    expect(enc.hash.startsWith('#p=2.')).toBe(true);
    const dec = await decodeShare(enc.hash, () => defaults);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    const again = designFromShare(2, dec.design).design;
    const motifs = again.layers.filter((l) => l.kind === 'motif');
    expect(motifs).toHaveLength(1);
    expect(motifs[0]!.source.kind).toBe('collection');
    if (motifs[0]!.source.kind === 'collection') {
      expect(motifs[0]!.source.collectionId).toBe('p-test-partage');
    }
  });
});
