import { describe, expect, it } from 'vitest';
import {
  autoZoneSvg,
  collectionIdFromName,
  lockColorsAcrossVariations,
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
});
