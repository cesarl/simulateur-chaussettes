import { describe, expect, it } from 'vitest';
import { gridFingerprint } from '../../src/core/grid';
import {
  buildShareUrl,
  decodeShareHash,
  defaultShareJson,
  designToShareJson,
} from '../../src/io/shareState';
import { primaryMotifLayer } from '../../src/core/layers';
import { defaultDesign, getState, resetState, setMotifCollection, update } from '../../src/state';

describe('intégration lien de partage', () => {
  it('état modifié → encode → decode → même design (diff vs défaut)', async () => {
    resetState();
    update(
      {
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
      },
      { skipHistory: true },
    );
    setMotifCollection('medina', { 'zone-1': 'BW002', 'zone-2': 'OR012' }, 'reco-1');

    const built = await buildShareUrl(getState());
    expect(built.hash.startsWith('#p=2.')).toBe(true);
    expect(built.tooLong).toBe(false);

    const decoded = await decodeShareHash(built.hash);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.parsed.designV2.name).toBe('Test partage');
    expect(decoded.parsed.designV2.zones.heelHeightMm).toBe(88);
    expect(decoded.parsed.designV2.zones.cuffColor).toBe('#112233');
    const motif = primaryMotifLayer(decoded.parsed.designV2.layers);
    expect(motif?.layout.tilesAround).toBe(4);
    expect(motif?.layout.seam).toBe('interieur');
    expect(decoded.parsed.designV2.decor.mode).toBe('sol');
    expect(decoded.parsed.activeCollectionId).toBe('medina');
    expect(decoded.parsed.paletteOptionId).toBe('reco-1');

    const defaults = defaultDesign();
    expect(decoded.parsed.designV2.dimensions.needles).toBe(defaults.dimensions.needles);
  });

  it('defaultShareJson est stable et court', async () => {
    resetState();
    const d = defaultShareJson();
    const again = designToShareJson({
      ...getState(),
      design: defaultDesign(),
      tiles: [],
    });
    // Un design d’appli (Fond+Motif) diffère des défauts de lien figés (Fond seul) :
    // le lien d’un modèle « vide d’appli » n’est plus minimal. On vérifie plutôt
    // qu’encoder exactement les défauts de lien donne un hash court.
    const { encodeShare } = await import('../../src/io/shareLink');
    const { length: minimal } = await encodeShare({ design: d }, d);
    expect(minimal).toBeLessThan(20);
    expect(again).not.toEqual(d); // Motifs / paletteFromLayers
    const { length } = await buildShareUrl({
      ...getState(),
      design: defaultDesign(),
      tiles: [],
    });
    expect(length).toBeLessThan(400);
    expect(gridFingerprint).toBeTypeOf('function');
  });
});
