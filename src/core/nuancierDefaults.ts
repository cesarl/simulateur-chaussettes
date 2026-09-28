/**
 * Couleurs métier par défaut tirées du nuancier public (`catalogue.json`, etat Validé).
 *
 * Source de vérité des teintes : `public/carreaux/catalogue.json` → `nuancier[]`
 * (restauré en T96 pour les entrées `public: true`).
 *
 * Ne pas confondre avec :
 *  - `v1ShareDefaults.json` / `DEFAULT_FOND_COLOR` (figés pour liens `#p=` et migrations) ;
 *  - `PATTERN_BACKGROUND` / `EMPTY_STITCH_COLOR` / repli calepinage (empreintes golden T41) ;
 *  - chrome UI (`--bg` / `--ink` / `--accent` dans `styles.css`, V11).
 */
import type { Catalogue } from './collections';
import type { Hex } from './types';

/** Identifiants + hex du nuancier public choisis pour les défauts d’un nouveau projet. */
export const NUANCIER_DEFAULTS = {
  /** BL016 — Bleu noir météorite (bord-côte ; proche de l’ancien `#1f3a5f`). */
  cuff: '#303446' as Hex,
  cuffId: 'BL016',
  /** RD060 — Brun brique (talon ; proche de l’ancien `#b5462f`). */
  heel: '#ab4236' as Hex,
  heelId: 'RD060',
  /** BK001 — Noir onyx (pointe / crayon ; proche de l’ancien `#1d1d1b`). */
  toe: '#1a1a1a' as Hex,
  toeId: 'BK001',
  /** YL010 — Blanc crème (pied uni / fond motif si hors calques). */
  foot: '#fff8eb' as Hex,
  footId: 'YL010',
  /** YL008 — Ivoire clair (calque Fond ; proche de l’ancien `#f1e9dc`). */
  fond: '#fbeed5' as Hex,
  fondId: 'YL008',
  /** BK010 — Gris agate (joint de calepinage ; proche de l’ancien `#d9d3c7`). */
  gap: '#cfcec9' as Hex,
  gapId: 'BK010',
  /** Même teinte que la pointe pour le crayon dessin. */
  dessin: '#1a1a1a' as Hex,
  dessinId: 'BK001',
} as const;

/** Zones machine d’un `defaultDesign()` neuf. */
export const NUANCIER_DEFAULT_ZONE_COLORS = {
  cuffColor: NUANCIER_DEFAULTS.cuff,
  heelColor: NUANCIER_DEFAULTS.heel,
  toeColor: NUANCIER_DEFAULTS.toe,
  footColor: NUANCIER_DEFAULTS.foot,
} as const;

/** Palette manuelle de secours (4 fils nuancier). */
export function manualSeedPalette(): Hex[] {
  return [
    NUANCIER_DEFAULTS.cuff,
    NUANCIER_DEFAULTS.heel,
    NUANCIER_DEFAULTS.foot,
    NUANCIER_DEFAULTS.toe,
  ];
}

/** Suggestion zones quand aucun fil motif : pointe/bord foncé + talon brique. */
export function emptyYarnZoneFallback(): { cuff: Hex; heel: Hex; toe: Hex } {
  return {
    cuff: NUANCIER_DEFAULTS.toe,
    heel: NUANCIER_DEFAULTS.heel,
    toe: NUANCIER_DEFAULTS.heel,
  };
}

/** Aperçu quantize sans palette encore calculée. */
export function previewFallbackPalette(kind: 'dessin' | 'drag'): Hex[] {
  if (kind === 'dessin') return [NUANCIER_DEFAULTS.foot, NUANCIER_DEFAULTS.toe];
  return [NUANCIER_DEFAULTS.foot, NUANCIER_DEFAULTS.cuff];
}

export function isNuancierPublicHex(hex: string, catalogue: Catalogue): boolean {
  const target = hex.toLowerCase();
  return catalogue.nuancier.some((c) => c.public && c.hex.toLowerCase() === target);
}
