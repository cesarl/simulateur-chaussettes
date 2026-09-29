import { describe, expect, it } from 'vitest';
import {
  defaultColorsFromVariations,
  draftToApiDonnees,
  emptyMotifDraft,
  previewSharedId,
  unionZones,
  variationsFromZoned,
  zoneSvgBatch,
  zonesMismatchWarning,
} from '../../src/core/motifDraft';

const nuancier = [
  { id: 'RD060', hex: '#ab4236' },
  { id: 'BL016', hex: '#303446' },
];

function svgTwoZones(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
  <rect width="40" height="40" fill="#ab4236"/>
  <circle cx="20" cy="20" r="10" fill="#303446"/>
</svg>`;
}

describe('motifDraft', () => {
  it('zoneSvgBatch produit des zone-N et un id p-', () => {
    const zoned = zoneSvgBatch([svgTwoZones(), svgTwoZones()], nuancier);
    expect(zoned).toHaveLength(2);
    expect(zoned[0]!.zones.length).toBeGreaterThanOrEqual(1);
    const vars = variationsFromZoned(zoned);
    expect(vars.map((v) => v.name)).toEqual(['VAR1', 'VAR2']);
    expect(unionZones(vars).every((z) => /^zone-\d+$/.test(z))).toBe(true);
    expect(previewSharedId('Vagues bleues')).toBe('p-vagues-bleues');
    expect(zonesMismatchWarning(vars)).toBeNull();
    const colors = defaultColorsFromVariations(vars);
    expect(Object.keys(colors).length).toBeGreaterThan(0);
    const draft = emptyMotifDraft();
    draft.nom = 'Test';
    draft.variations = vars;
    draft.couleursParDefaut = colors;
    draft.calepinageParDefaut = 'damier';
    draft.calepinages = ['damier'];
    draft.calepinagePerso = {
      cells: 4,
      rotationGlobale: 90,
      overrides: [{ cx: 0, cy: 0, rotAdd: 90, tileDelta: 1 }],
    };
    const donnees = draftToApiDonnees(draft);
    expect(donnees.variations).toHaveLength(2);
    expect(donnees.calepinageParDefaut).toBe('damier');
    expect(donnees.calepinagePerso).toEqual(draft.calepinagePerso);
  });

  it('variationsFromZoned accepte des PNG (data-URL) sans zones', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const vars = variationsFromZoned([], [png, png]);
    expect(vars).toHaveLength(2);
    expect(vars[0]!.mime).toBe('image/png');
    expect(vars[0]!.zones).toEqual([]);
    expect(vars[0]!.original).toBe(png);
    expect(vars[1]!.name).toBe('VAR2');
    expect(unionZones(vars)).toEqual([]);
  });
});
