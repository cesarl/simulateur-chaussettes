import { describe, expect, it } from 'vitest';
import {
  designFromShare,
  designV2ToShareJson,
  shareDefaultsFor,
} from '../../src/core/layers';
import { decodeShare, encodeShare } from '../../src/io/shareLink';
import {
  buildShareUrl,
  decodeShareHash,
  quantizeForShareApply,
} from '../../src/io/shareState';
import { defaultDesign, getState, resetState, update } from '../../src/state';

describe('paletteFromLayers dans le lien de partage', () => {
  it('quantizeForShareApply conserve true et normalise absent → false', () => {
    const base = defaultDesign().quantize;
    expect(quantizeForShareApply({ ...base, paletteFromLayers: true }).paletteFromLayers).toBe(true);
    expect(quantizeForShareApply({ ...base, paletteFromLayers: false }).paletteFromLayers).toBe(false);
    const { paletteFromLayers: _drop, ...sansChamp } = { ...base, paletteFromLayers: true };
    expect(quantizeForShareApply(sansChamp).paletteFromLayers).toBe(false);
  });

  it('encode → decode : true et false survivent (codec + apply)', async () => {
    for (const flag of [true, false] as const) {
      resetState();
      update(
        {
          design: {
            quantize: {
              paletteFromLayers: flag,
              paletteMode: flag ? 'auto' : 'manuelle',
              palette: flag ? [] : ['#111111', '#eeeeee'],
            },
          },
        },
        { skipHistory: true },
      );
      const built = await buildShareUrl(getState());
      expect(built.hash.startsWith('#p=2.')).toBe(true);
      const decoded = await decodeShareHash(built.hash);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(decoded.parsed.shareVersion).toBe(2);
      expect(decoded.parsed.designV2.quantize.paletteFromLayers).toBe(flag);
      expect(quantizeForShareApply(decoded.parsed.designV2.quantize).paletteFromLayers).toBe(flag);
    }
  });

  it('lien V2 sans le champ → false (rétrocompat)', async () => {
    const design = defaultDesign();
    const json = designV2ToShareJson({
      ...design,
      quantize: {
        maxColors: 4,
        paletteMode: 'auto',
        palette: [],
        sampling: 'majoritaire',
        despeckle: false,
        maxFloat: 7,
        // pas de paletteFromLayers
      },
    });
    expect(json && typeof json === 'object' && !Array.isArray(json)).toBe(true);
    const root = json as { quantize: Record<string, unknown> };
    delete root.quantize.paletteFromLayers;
    const enc = await encodeShare({ design: json }, shareDefaultsFor(2));
    const dec = await decodeShare(enc.hash, shareDefaultsFor);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    const again = designFromShare(dec.version, dec.design).design;
    expect(again.quantize.paletteFromLayers).toBe(false);
    expect(quantizeForShareApply(again.quantize).paletteFromLayers).toBe(false);
  });

  it('lien V1 migré → paletteFromLayers false', async () => {
    const defaults = shareDefaultsFor(1);
    expect(defaults && typeof defaults === 'object' && !Array.isArray(defaults)).toBe(true);
    const { hash } = await encodeShare(
      { design: { ...(defaults as Record<string, unknown>), name: 'Ancien' } as typeof defaults },
      defaults,
    );
    const v1Hash = hash.replace('#p=2.', '#p=1.');
    const decoded = await decodeShareHash(v1Hash);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.parsed.shareVersion).toBe(1);
    expect(decoded.parsed.designV2.quantize.paletteFromLayers).toBe(false);
  });
});
