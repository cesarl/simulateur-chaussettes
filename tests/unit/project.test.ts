import { describe, expect, it } from 'vitest';
import { parseProject, ProjectError, serializeProject } from '../../src/io/project';
import { defaultDesign, defaultDesignV1 } from '../../src/state';
import { newImageLayer, normalizeStack, primaryMotifLayer, type SockDesignV2 } from '../../src/core/layers';
import type { TileAsset } from '../../src/core/types';

function tile(): TileAsset {
  return {
    id: 'carreau-a',
    name: 'Essai',
    source: 'png',
    width: 2,
    height: 2,
    rgba: new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]),
  };
}

function withImportTiles(design: SockDesignV2, ids: string[]): SockDesignV2 {
  const motif = primaryMotifLayer(design.layers);
  if (!motif) return design;
  return {
    ...design,
    layers: design.layers.map((l) =>
      l.id === motif.id && l.kind === 'motif'
        ? { ...l, source: { kind: 'importes' as const, tileIds: [...ids] } }
        : l,
    ),
  };
}

describe('projet JSON', () => {
  it('retrouve les réglages et les pixels des carreaux', async () => {
    let design = defaultDesign();
    design = { ...design, name: 'Étoile', zones: { ...design.zones, heelColor: '#112233' } };
    design = withImportTiles(design, ['carreau-a']);
    const json = await serializeProject(design, [tile()]);
    const back = await parseProject(json);
    expect(back.design.name).toBe('Étoile');
    expect(back.design.zones.heelColor).toBe('#112233');
    expect(back.design.version).toBe(2);
    const motif = primaryMotifLayer(back.design.layers);
    expect(motif?.source).toEqual({ kind: 'importes', tileIds: ['carreau-a'] });
    expect(back.tiles).toHaveLength(1);
    expect(back.tiles[0]?.width).toBe(2);
    expect(back.tiles[0]?.height).toBe(2);
    expect(back.tiles[0]?.rgba).toEqual(tile().rgba);
    expect(back.collection).toBeNull();
  });

  it('encode un carreau assez grand pour remplir le tampon de compression', async () => {
    const width = 180;
    const height = 180;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < rgba.length; index += 4) {
      rgba[index] = index % 255;
      rgba[index + 1] = 40;
      rgba[index + 2] = 90;
      rgba[index + 3] = 255;
    }
    let design = defaultDesign();
    const big: TileAsset = { id: 'grand', name: 'Grand', source: 'png', width, height, rgba };
    design = withImportTiles(design, ['grand']);
    const back = await parseProject(await serializeProject(design, [big]));
    expect(back.tiles[0]?.rgba).toEqual(rgba);
  });

  it('refuse un fichier illisible avec un message clair', async () => {
    await expect(parseProject('{')).rejects.toBeInstanceOf(ProjectError);
    await expect(parseProject('{"version":2}')).rejects.toThrow(/invalide/i);
  });

  it('complète les réglages de talon manquants (anciens projets)', async () => {
    const v1 = defaultDesignV1();
    v1.layout.tileIds = [];
    const json = await serializeProject(
      // serialize expects V2 — migrate via roundtrip craft
      (
        await parseProject(
          JSON.stringify({ version: 1, design: v1, tiles: [], collection: null }),
        )
      ).design,
      [],
    );
    const doc = JSON.parse(json) as { design: { zones: Record<string, unknown> } };
    delete doc.design.zones.heelHeightMm;
    delete doc.design.zones.heelDepthMm;
    delete doc.design.zones.heelSpread;
    // Reconstruire un V1 pour tester la complétion (readDesign V1)
    const v1doc = {
      version: 1 as const,
      design: {
        ...v1,
        zones: { ...v1.zones },
      },
      tiles: [],
      collection: null,
    };
    delete (v1doc.design.zones as Record<string, unknown>).heelHeightMm;
    delete (v1doc.design.zones as Record<string, unknown>).heelDepthMm;
    delete (v1doc.design.zones as Record<string, unknown>).heelSpread;
    const back = await parseProject(JSON.stringify(v1doc));
    expect(back.design.zones.heelHeightMm).toBe(55);
    expect(back.design.zones.heelDepthMm).toBe(72);
    expect(back.design.zones.heelSpread).toBe(100);
  });

  it('migre les anciens LayoutKind vers CalepinageSpec (puis calques)', async () => {
    const v1 = defaultDesignV1();
    const doc = {
      version: 1 as const,
      design: {
        ...v1,
        layout: { ...v1.layout, tileIds: [] as string[] } as Record<string, unknown>,
      },
      tiles: [],
      collection: null,
    };
    delete doc.design.layout.calepinage;
    doc.design.layout.kind = 'rotation-4';
    doc.design.layout.rotation = 90;
    doc.design.layout.seed = 42;
    const back = await parseProject(JSON.stringify(doc));
    const motif = primaryMotifLayer(back.design.layers);
    expect(motif?.layout.calepinage.genere.rotation).toBe('rosace');
    expect(motif?.layout.calepinage.rotationGlobale).toBe(90);
    expect(motif?.layout.calepinage.graine).toBe(42);

    doc.design.layout.kind = 'quinconce-h';
    doc.design.layout.rotation = 0;
    doc.design.layout.seed = 1;
    const q = await parseProject(JSON.stringify(doc));
    expect(primaryMotifLayer(q.design.layers)?.layout.calepinage.appareil).toBe('quinconce-h');

    doc.design.layout.kind = 'damier';
    const d = await parseProject(JSON.stringify(doc));
    expect(primaryMotifLayer(d.design.layers)?.layout.calepinage.genere.ordre).toBe('suite');

    doc.design.layout.kind = 'miroir-4';
    const m = await parseProject(JSON.stringify(doc));
    expect(primaryMotifLayer(m.design.layers)?.layout.calepinage.genere.rotation).toBe('miroir');

    doc.design.layout.kind = 'rotation-aleatoire';
    const r = await parseProject(JSON.stringify(doc));
    expect(primaryMotifLayer(r.design.layers)?.layout.calepinage.genere.rotation).toBe('aleatoire-90');
  });

  it('aller-retour projet avec collection (id, zones, commit sync)', async () => {
    let design = defaultDesign();
    design = { ...design, name: 'Medina test' };
    design = withImportTiles(design, ['carreau-a']);
    const collection = {
      id: 'medina',
      zoneColors: {
        'zone-1': 'BW002',
        'zone-2': 'OR008',
        'zone-3': 'WT001',
        'zone-4': 'BL017',
      },
      paletteOptionId: 'defaut',
      syncCommit: 'f513e1fb8c7c',
    };
    const json = await serializeProject(design, [tile()], { collection });
    const back = await parseProject(json);
    expect(back.collection).toEqual(collection);
    expect(back.design.name).toBe('Medina test');
    expect(back.tiles).toHaveLength(1);
    expect(back.assets).toEqual([]);
  });

  it('projet v1 (sans assets) reste lisible et migré en calques', async () => {
    const v1 = defaultDesignV1();
    v1.name = 'Ancien';
    const json = JSON.stringify({
      version: 1,
      design: v1,
      tiles: [],
      collection: null,
    });
    const back = await parseProject(json);
    expect(back.design.name).toBe('Ancien');
    expect(back.design.version).toBe(2);
    expect(back.design.layers.map((l) => l.kind)).toEqual(['fond', 'motif']);
    expect(back.design.quantize.paletteFromLayers).toBe(false);
    expect(back.assets).toEqual([]);
  });

  it('aller-retour projet v2 avec images embarquées (calques Image)', async () => {
    const g = {
      needles: 168,
      rows: 180,
      stitchesPerCm: 7.5,
      rowsPerCm: 10,
    };
    let design = defaultDesign();
    design = {
      ...design,
      name: 'Composition v2',
      layers: normalizeStack([
        design.layers[0]!,
        newImageLayer('L1', { kind: 'embarquee', assetId: 'png1' }, g, 'PNG'),
        newImageLayer('L2', { kind: 'embarquee', assetId: 'svg1' }, g, 'SVG'),
        newImageLayer('L3', { kind: 'collection', collectionId: 'medina', variation: 'VAR1' }, g, 'Medina'),
      ]),
    };
    const pngAsset = {
      id: 'png1',
      name: 'motif.png',
      mime: 'image/png' as const,
      data: 'data:image/png;base64,aaaa',
      width: 16,
      height: 16,
    };
    const svgAsset = {
      id: 'svg1',
      name: 'forme.svg',
      mime: 'image/svg+xml' as const,
      data: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="#f00" width="10" height="10"/></svg>',
      width: 10,
      height: 10,
    };
    const json = await serializeProject(design, [], {
      assets: [pngAsset, svgAsset, { ...pngAsset, id: 'unused', name: 'orphan.png' }],
    });
    const doc = JSON.parse(json) as { version: number; assets: Array<{ id: string }> };
    expect(doc.version).toBe(2);
    expect(doc.assets.map((a) => a.id).sort()).toEqual(['png1', 'svg1']);
    const back = await parseProject(json);
    expect(back.design.layers.filter((l) => l.kind === 'image')).toHaveLength(3);
    expect(back.assets).toHaveLength(2);
    expect(back.assets.find((a) => a.id === 'png1')?.mime).toBe('image/png');
    expect(back.assets.find((a) => a.id === 'svg1')?.data).toContain('<svg');
  });
});
