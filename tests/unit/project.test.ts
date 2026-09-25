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
});
