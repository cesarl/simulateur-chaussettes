/**
 * Brouillon de motif partagé (T102) — logique pure de zones / identité.
 * Réutilisé par admin.ts et motif.html.
 */
import {
  autoZoneSvg,
  lockColorsAcrossVariations,
  type NuancierEntry,
  type SvgZoneDraft,
  type SvgZonesResult,
} from './svgZones';
import { collectionIdFromNom, slugifyNom } from './collectionSlug';
import { sanitizeSvg } from './sanitizeSvg';
import { parseCalepinagePerso, type CalepinagePerso } from './motifPreviewEdit';

export type MotifFormat = '20x20' | '15x15' | '10x10';

export type MotifVariationDraft = {
  name: string; // VAR1…
  /** Texte SVG original ou data-URL PNG. */
  original: string;
  /** SVG zoné (ou data-URL PNG). */
  zoned: string;
  zones: SvgZoneDraft[];
  mime: 'image/svg+xml' | 'image/png';
  /** true si le fichier n’est pas carré (avertissement). */
  notSquare: boolean;
  /** true si le fichier doit être renvoyé au PATCH (nouveau ou remplacé). */
  fileDirty?: boolean;
};

export type MotifRecoDraft = {
  nom: string;
  colors: Record<string, string>;
};

export type MotifDraft = {
  /** Id existant (édition) ou null (création). */
  id: string | null;
  nom: string;
  description: string;
  format: MotifFormat;
  variations: MotifVariationDraft[];
  /** Couleurs par défaut : zone-N → code nuancier. */
  couleursParDefaut: Record<string, string>;
  recommandations: MotifRecoDraft[];
  calepinages: string[];
  calepinageParDefaut: string | null;
  /** Édition preview (rotations / motifs par case) — persistée API + brouillon. */
  calepinagePerso: CalepinagePerso | null;
};

export function emptyMotifDraft(): MotifDraft {
  return {
    id: null,
    nom: '',
    description: '',
    format: '20x20',
    variations: [],
    couleursParDefaut: {},
    recommandations: [],
    calepinages: [],
    calepinageParDefaut: null,
    calepinagePerso: null,
  };
}

/** Aperçu de l’identifiant `p-…` (sans suffixe de collision — alloué à l’enregistrement). */
export function previewSharedId(nom: string): string {
  return collectionIdFromNom(nom.trim() || 'motif', 1);
}

export function slugPreview(nom: string): string {
  return slugifyNom(nom);
}

/**
 * Découpe une liste de textes SVG comme dans admin.ts :
 * premier passage → lock des couleurs → second passage.
 */
export function zoneSvgBatch(
  svgTexts: readonly string[],
  nuancier: readonly NuancierEntry[],
): SvgZonesResult[] {
  const cleaned = svgTexts.map((t) => sanitizeSvg(t));
  const firstPass = cleaned.map((t) => autoZoneSvg(t, nuancier));
  const locked = lockColorsAcrossVariations(firstPass);
  return cleaned.map((t) => autoZoneSvg(t, nuancier, locked));
}

/** Construit des variations VAR1… à partir de résultats zonés + éventuels PNG. */
export function variationsFromZoned(
  zoned: readonly SvgZonesResult[],
  pngDataUrls: readonly string[] = [],
): MotifVariationDraft[] {
  const out: MotifVariationDraft[] = [];
  for (const r of zoned) {
    out.push({
      name: `VAR${out.length + 1}`,
      original: r.original,
      zoned: r.zoned,
      zones: r.zones,
      mime: 'image/svg+xml',
      notSquare: detectSvgNotSquare(r.original),
      fileDirty: true,
    });
  }
  for (const dataUrl of pngDataUrls) {
    out.push({
      name: `VAR${out.length + 1}`,
      original: dataUrl,
      zoned: dataUrl,
      zones: [],
      mime: 'image/png',
      notSquare: false,
      fileDirty: true,
    });
  }
  return out;
}

function detectSvgNotSquare(svg: string): boolean {
  const w = /(?:width|viewBox)\s*=\s*["']([^"']+)["']/i.exec(svg);
  if (!w) return false;
  const vb = /viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i.exec(svg);
  if (vb) {
    const a = Number(vb[1]);
    const b = Number(vb[2]);
    if (a > 0 && b > 0) return Math.abs(a - b) / Math.max(a, b) > 0.05;
  }
  const width = /width\s*=\s*["']([\d.]+)/i.exec(svg);
  const height = /height\s*=\s*["']([\d.]+)/i.exec(svg);
  if (width && height) {
    const a = Number(width[1]);
    const b = Number(height[1]);
    if (a > 0 && b > 0) return Math.abs(a - b) / Math.max(a, b) > 0.05;
  }
  return false;
}

/** Zones union de toutes les variations (ordre zone-1, zone-2…). */
export function unionZones(variations: readonly MotifVariationDraft[]): string[] {
  const set = new Set<string>();
  for (const v of variations) for (const z of v.zones) set.add(z.id);
  return [...set].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
}

/** Avertissement si les variations n’ont pas les mêmes zones. */
export function zonesMismatchWarning(variations: readonly MotifVariationDraft[]): string | null {
  const svgVars = variations.filter((v) => v.mime === 'image/svg+xml');
  if (svgVars.length < 2) return null;
  const key = (v: MotifVariationDraft) =>
    v.zones
      .map((z) => z.id)
      .sort()
      .join(',');
  const first = key(svgVars[0]!);
  if (svgVars.some((v) => key(v) !== first)) {
    return 'Les variations n’ont pas les mêmes zones de couleur.';
  }
  return null;
}

/** Couleurs par défaut depuis les suggestions des zones (première occurrence). */
export function defaultColorsFromVariations(
  variations: readonly MotifVariationDraft[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of variations) {
    for (const z of v.zones) {
      if (!out[z.id] && z.suggestedColorId) out[z.id] = z.suggestedColorId;
    }
  }
  return out;
}

/** Payload `donnees` pour l’API (sans fichiers R2 encore). */
export function draftToApiDonnees(draft: MotifDraft): {
  zones: string[];
  couleursParDefaut: Record<string, string>;
  recommandations: Array<{ nom?: string; colors: Record<string, string> }>;
  calepinages: string[];
  calepinageParDefaut: string | null;
  calepinagePerso: CalepinagePerso | null;
  variations: Array<{ name: string; motif: number; file: string; zones: string[] }>;
} {
  const zones = unionZones(draft.variations);
  const perso = parseCalepinagePerso(draft.calepinagePerso);
  return {
    zones,
    couleursParDefaut: { ...draft.couleursParDefaut },
    recommandations: draft.recommandations.map((r) =>
      r.nom.trim() ? { nom: r.nom.trim(), colors: { ...r.colors } } : { colors: { ...r.colors } },
    ),
    calepinages: [...draft.calepinages],
    calepinageParDefaut: draft.calepinageParDefaut,
    calepinagePerso: perso,
    variations: draft.variations.map((v, i) => ({
      name: v.name,
      motif: i + 1,
      file: '',
      zones: v.zones.map((z) => z.id),
    })),
  };
}
