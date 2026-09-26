import { describe, expect, it } from 'vitest';
import { parseProject, ProjectError, serializeProject } from '../../src/io/project';
import { defaultDesign } from '../../src/state';
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

describe('projet JSON', () => {
  it('retrouve les réglages et les pixels des carreaux', async () => {
    const design = defaultDesign();
    design.name = 'Étoile';
    design.zones.heelColor = '#112233';
    design.layout.tileIds = ['carreau-a'];
    const json = await serializeProject(design, [tile()]);
    const back = await parseProject(json);
    expect(back.design.name).toBe('Étoile');
    expect(back.design.zones.heelColor).toBe('#112233');
    expect(back.design.layout.tileIds).toEqual(['carreau-a']);
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
    const design = defaultDesign();
    const big: TileAsset = { id: 'grand', name: 'Grand', source: 'png', width, height, rgba };
    design.layout.tileIds = ['grand'];
    const back = await parseProject(await serializeProject(design, [big]));
    expect(back.tiles[0]?.rgba).toEqual(rgba);
  });

  it('refuse un fichier illisible avec un message clair', async () => {
    await expect(parseProject('{')).rejects.toBeInstanceOf(ProjectError);
    await expect(parseProject('{"version":2}')).rejects.toThrow(/invalide/i);
  });

  it('complète les réglages de talon manquants (anciens projets)', async () => {
    const design = defaultDesign();
    design.layout.tileIds = [];
    const json = await serializeProject(design, []);
    const doc = JSON.parse(json) as { design: { zones: Record<string, unknown> } };
    delete doc.design.zones.heelHeightMm;
    delete doc.design.zones.heelDepthMm;
    delete doc.design.zones.heelSpread;
    const back = await parseProject(JSON.stringify(doc));
    expect(back.design.zones.heelHeightMm).toBe(55);
    expect(back.design.zones.heelDepthMm).toBe(72);
    expect(back.design.zones.heelSpread).toBe(100);
  });

  it('migre les anciens LayoutKind vers CalepinageSpec', async () => {
    const design = defaultDesign();
    const json = await serializeProject(design, []);
    const doc = JSON.parse(json) as {
      design: { layout: Record<string, unknown> };
    };
    delete doc.design.layout.calepinage;
    doc.design.layout.kind = 'rotation-4';
    doc.design.layout.rotation = 90;
    doc.design.layout.seed = 42;
    const back = await parseProject(JSON.stringify(doc));
    expect(back.design.layout.calepinage.genere.rotation).toBe('rosace');
    expect(back.design.layout.calepinage.rotationGlobale).toBe(90);
    expect(back.design.layout.calepinage.graine).toBe(42);

    doc.design.layout.kind = 'quinconce-h';
    doc.design.layout.rotation = 0;
    doc.design.layout.seed = 1;
    const q = await parseProject(JSON.stringify(doc));
    expect(q.design.layout.calepinage.appareil).toBe('quinconce-h');
    expect(q.design.layout.calepinage.genere.ordre).toBe('unique');

    doc.design.layout.kind = 'damier';
    const d = await parseProject(JSON.stringify(doc));
    expect(d.design.layout.calepinage.genere.ordre).toBe('suite');
    expect(d.design.layout.calepinage.genere.pasRangee).toBe(1);

    doc.design.layout.kind = 'miroir-4';
    const m = await parseProject(JSON.stringify(doc));
    expect(m.design.layout.calepinage.genere.rotation).toBe('miroir');

    doc.design.layout.kind = 'rotation-aleatoire';
    const r = await parseProject(JSON.stringify(doc));
    expect(r.design.layout.calepinage.genere.rotation).toBe('aleatoire-90');
  });

  it('aller-retour projet avec collection (id, zones, commit sync)', async () => {
    const design = defaultDesign();
    design.name = 'Medina test';
    design.layout.tileIds = ['carreau-a'];
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

  it('projet v1 (sans assets) reste lisible', async () => {
    const design = defaultDesign();
    design.name = 'Ancien';
    const v1 = JSON.stringify({
      version: 1,
      design,
      tiles: [],
      collection: null,
    });
    const back = await parseProject(v1);
    expect(back.design.name).toBe('Ancien');
    expect(back.assets).toEqual([]);
    expect(back.design.pattern.kind).toBe('carreaux');
  });

  it('aller-retour projet v2 avec PNG + SVG embarqués', async () => {
    const design = defaultDesign();
    design.name = 'Composition v2';
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
    design.pattern = {
      kind: 'composition',
      composition: {
        background: '#f1e9dc',
        layers: [
          {
            id: 'L1',
            asset: { kind: 'embarquee', assetId: 'png1' },
            x: 40,
            y: 20,
            widthStitches: 30,
            rotation: 15,
            flipX: false,
            flipY: false,
            repeatAroundGap: null,
            hidden: false,
            locked: false,
          },
          {
            id: 'L2',
            asset: { kind: 'embarquee', assetId: 'svg1' },
            x: 80,
            y: 50,
            widthStitches: 20,
            rotation: 0,
            flipX: true,
            flipY: false,
            repeatAroundGap: null,
            hidden: false,
            locked: false,
          },
          {
            id: 'L3',
            asset: { kind: 'collection', collectionId: 'medina', variation: 'VAR1' },
            x: 10,
            y: 10,
            widthStitches: 24,
            rotation: 0,
            flipX: false,
            flipY: false,
            repeatAroundGap: null,
            hidden: false,
            locked: false,
          },
        ],
      },
    };
    const json = await serializeProject(design, [], {
      assets: [pngAsset, svgAsset, { ...pngAsset, id: 'unused', name: 'orphan.png' }],
    });
    const doc = JSON.parse(json) as { version: number; assets: Array<{ id: string }> };
    expect(doc.version).toBe(2);
    expect(doc.assets.map((a) => a.id).sort()).toEqual(['png1', 'svg1']);
    const back = await parseProject(json);
    expect(back.design.pattern.kind).toBe('composition');
    if (back.design.pattern.kind !== 'composition') throw new Error('expected composition');
    expect(back.design.pattern.composition.layers).toHaveLength(3);
    expect(back.assets).toHaveLength(2);
    expect(back.assets.find((a) => a.id === 'png1')?.mime).toBe('image/png');
    expect(back.assets.find((a) => a.id === 'svg1')?.data).toContain('<svg');
  });
});
