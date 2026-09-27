import { describe, expect, it } from 'vitest';
import {
  designFromShare,
  designV2ToShareJson,
  newFondLayer,
  newImageLayer,
  newMotifLayer,
  normalizeStack,
  shareDefaultsFor,
} from '../../src/core/layers';
import { decodeShare, encodeShare } from '../../src/io/shareLink';
import { defaultMotifLayout } from '../../src/state';

describe('T52 — lien 4 calques aller-retour', () => {
  it('Fond + 2 Motifs + 1 Image → encode #p=2. → même design', async () => {
    const g = { needles: 168, rows: 100, stitchesPerCm: 7.5, rowsPerCm: 10 };
    const layout = defaultMotifLayout();
    const design = {
      version: 2 as const,
      name: 'Quatre',
      dimensions: {
        size: 'homme' as const,
        needles: 168,
        cuffRows: 30,
        legRows: 100,
        heelRows: 56,
        footRows: 0,
        toeRows: 50,
        stitchesPerCm: 7.5,
        rowsPerCm: 10,
      },
      zones: {
        cuffEnabled: true,
        cuffColor: '#1f3a5f',
        heelColor: '#b5462f',
        toeColor: '#1d1d1b',
        patternOnFoot: false,
        footColor: '#f4f1ea',
        heelHeightMm: 55,
        heelDepthMm: 72,
        heelSpread: 100,
      },
      quantize: {
        maxColors: 4,
        paletteMode: 'auto' as const,
        palette: [] as string[],
        sampling: 'majoritaire' as const,
        despeckle: false,
        maxFloat: 7,
        paletteFromLayers: true,
      },
      decor: {
        mode: 'aucun' as const,
        tileCm: 20,
        groutMm: 1.5,
        groutColor: '#f3f1ec',
        patina: 0.3,
        attenuation: 0,
        grainStrength: 0.7,
        tileSource: 'sock' as const,
        otherCollectionId: null,
      },
      layers: normalizeStack([
        newFondLayer('#abcdef'),
        newMotifLayer(
          'motif-1',
          { kind: 'collection', collectionId: 'medina', colors: { 'zone-1': 'BW002' }, paletteId: 'defaut' },
          layout,
          'Medina',
        ),
        newMotifLayer('motif-2', { kind: 'importes', tileIds: ['t1'] }, { ...layout, tilesAround: 4 }, 'Import'),
        newImageLayer('image-1', { kind: 'collection', collectionId: 'medina', variation: 'VAR1' }, g, 'Img'),
      ]),
    };
    const enc = await encodeShare({ design: designV2ToShareJson(design) }, shareDefaultsFor(2));
    expect(enc.hash.startsWith('#p=2.')).toBe(true);
    const dec = await decodeShare(enc.hash, shareDefaultsFor);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    const again = designFromShare(dec.version, dec.design).design;
    expect(again.layers.map((l) => l.kind)).toEqual(['fond', 'motif', 'motif', 'image']);
    expect(again.name).toBe('Quatre');
    expect(again.layers[0]).toMatchObject({ kind: 'fond', color: '#abcdef' });
    expect(again.quantize.paletteFromLayers).toBe(true);
  });
});
