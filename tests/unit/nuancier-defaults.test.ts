/**
 * Défauts de zones / fond / palette manuelle / crayon = hex du nuancier public.
 * Les constantes figées (share V1, golden) restent hors de ce contrat.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NUANCIER_DEFAULTS,
  NUANCIER_DEFAULT_ZONE_COLORS,
  isNuancierPublicHex,
  manualSeedPalette,
} from '../../src/core/nuancierDefaults';
import { DEFAULT_FOND_COLOR } from '../../src/core/layers';
import { defaultDesign, defaultMotifLayout } from '../../src/state';
import type { Catalogue } from '../../src/core/collections';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogue = JSON.parse(
  fs.readFileSync(path.join(root, 'public/carreaux/catalogue.json'), 'utf8'),
) as Catalogue;

const publicHexes = new Set(
  catalogue.nuancier.filter((c) => c.public).map((c) => c.hex.toLowerCase()),
);

describe('nuancierDefaults', () => {
  it('chaque défaut métier pointe un hex public du catalogue', () => {
    const values = [
      NUANCIER_DEFAULTS.cuff,
      NUANCIER_DEFAULTS.heel,
      NUANCIER_DEFAULTS.toe,
      NUANCIER_DEFAULTS.foot,
      NUANCIER_DEFAULTS.fond,
      NUANCIER_DEFAULTS.gap,
      NUANCIER_DEFAULTS.dessin,
      ...manualSeedPalette(),
    ];
    for (const hex of values) {
      expect(publicHexes.has(hex.toLowerCase()), `${hex} hors nuancier public`).toBe(true);
      expect(isNuancierPublicHex(hex, catalogue)).toBe(true);
    }
  });

  it('defaultDesign() utilise les défauts nuancier (zones, fond, joint)', () => {
    const d = defaultDesign();
    expect(d.zones).toMatchObject(NUANCIER_DEFAULT_ZONE_COLORS);
    const fond = d.layers.find((l) => l.kind === 'fond');
    expect(fond?.kind === 'fond' ? fond.color : null).toBe(NUANCIER_DEFAULTS.fond);
    expect(defaultMotifLayout().gapColor).toBe(NUANCIER_DEFAULTS.gap);
  });

  it('DEFAULT_FOND_COLOR reste figé pour share / migration (≠ défaut UI)', () => {
    expect(DEFAULT_FOND_COLOR).toBe('#f1e9dc');
    expect(DEFAULT_FOND_COLOR).not.toBe(NUANCIER_DEFAULTS.fond);
  });
});
