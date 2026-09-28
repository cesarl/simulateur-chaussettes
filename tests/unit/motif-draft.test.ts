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
    const donnees = draftToApiDonnees(draft);
    expect(donnees.variations).toHaveLength(2);
    expect(donnees.calepinageParDefaut).toBe('damier');
  });
});
