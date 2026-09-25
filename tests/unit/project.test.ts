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
});
