import { describe, expect, it } from 'vitest';
import {
  autoZoneSvg,
  collectionIdFromName,
  lockColorsAcrossVariations,
  recolorPreview,
  setZoneColorId,
} from '../../src/core/svgZones';

const nuancier = [
  { id: 'OR008', hex: '#c45c26' },
  { id: 'WT001', hex: '#f4f1ea' },
  { id: 'BL017', hex: '#1f3a5f' },
  { id: 'BW002', hex: '#1d1d1b' },
];

describe('svgZones (T44)', () => {
  it('regroupe les fills attributs en zone-N (surface décroissante)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <rect width="10" height="10" fill="#c45c26"/>
      <circle cx="5" cy="5" r="2" fill="#f4f1ea"/>
    </svg>`;
    const r = autoZoneSvg(svg, nuancier);
    expect(r.alreadyZoned).toBe(false);
    expect(r.zones.length).toBe(2);
    expect(r.zones[0]!.id).toBe('zone-1');
    expect(r.zones[0]!.suggestedColorId).toBe('OR008');
    expect(r.zoned).toContain('id="zone-1"');
    expect(r.zoned).toContain('id="zone-2"');
    expect(r.zoned).toContain('data-color-id=');
  });

  it('lit les fills via classes CSS (style Illustrator)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <style type="text/css">.st0{fill:#1f3a5f;}.st1{fill:#f4f1ea;}</style>
      <rect class="st0" width="10" height="10"/>
      <circle class="st1" cx="5" cy="5" r="3"/>
    </svg>`;
    const r = autoZoneSvg(svg, nuancier);
    expect(r.zones.length).toBe(2);
    expect(r.zones.map((z) => z.suggestedColorId).sort()).toEqual(['BL017', 'WT001'].sort());
    expect(r.zoned).toMatch(/<g id="zone-\d+"/);
  });

  it('conserve un SVG déjà zoné', () => {
    const svg = `<svg><g id="zone-1" data-color-id="OR008"><rect fill="#c45c26" width="1" height="1"/></g></svg>`;
    const r = autoZoneSvg(svg, nuancier);
    expect(r.alreadyZoned).toBe(true);
    expect(r.zones).toHaveLength(1);
    expect(r.zones[0]!.suggestedColorId).toBe('OR008');
    expect(r.zoned).toBe(svg);
  });

  it('identifiant depuis le nom et verrouillage inter-variations', () => {
    expect(collectionIdFromName('Médina locale')).toBe('MEDINALOCALE');
    const a = autoZoneSvg(
      `<svg><rect width="10" height="10" fill="#c45c26"/><circle cx="1" cy="1" r="1" fill="#f4f1ea"/></svg>`,
      nuancier,
    );
    const locked = lockColorsAcrossVariations([a]);
    const b = autoZoneSvg(
      `<svg><rect width="2" height="2" fill="#c45c26"/></svg>`,
      nuancier,
      locked,
    );
    expect(b.zones[0]!.suggestedColorId).toBe(locked.get('#c45c26'));
  });

  it('un gris neutre reste un gris, pas un vert ou un bleu de même clarté', () => {
    const yarns = [
      { id: 'BK006', hex: '#707070', nom: 'Gris moyen' },
      { id: 'GN032', hex: '#747b74', nom: "Vert lichen d'Arctique" },
      { id: 'BK004', hex: '#545454', nom: 'Gris acier' },
      { id: 'GN028', hex: '#5d6b5b', nom: 'Gris vert sauge' },
      { id: 'BK010', hex: '#cfcec9', nom: 'Gris atate' },
      { id: 'GN006', hex: '#d7e8cf', nom: 'Vert gris pastel' },
      { id: 'BL007', hex: '#daebf1', nom: 'Gris turquoise' },
      { id: 'WT000', hex: '#f7f7f7', nom: 'Blanc' },
      { id: 'OR008', hex: '#c45c26', nom: 'Orange' },
    ];
    const suggest = (hex: string) =>
      autoZoneSvg(`<svg><rect width="8" height="8" fill="${hex}"/></svg>`, yarns).zones[0]!.suggestedColorId;
    expect(suggest('#808080')).toBe('BK006');
    expect(suggest('#787878')).toBe('BK006');
    expect(suggest('#606060')).toBe('BK004');
    expect(suggest('#e0e0e0')).toBe('WT000');
    expect(suggest('#d7e8cf')).toBe('GN006');
    expect(suggest('#c45c26')).toBe('OR008');
  });

  it('le fil choisi se retrouve dans data-color-id et dans l’aperçu', () => {
    const svg = `<svg><g id="zone-1" data-color-id="GN032"><rect fill="#808080" width="4" height="4"/></g></svg>`;
    const next = setZoneColorId(svg, 'zone-1', 'BK006');
    expect(next).toContain('data-color-id="BK006"');
    const painted = recolorPreview(next, [{ fillHex: '#808080', suggestedColorId: 'BK006' }], new Map([['BK006', '#707070']]));
    expect(painted).toContain('fill="#707070"');
    expect(painted).not.toContain('#808080');
  });
});
