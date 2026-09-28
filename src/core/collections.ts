/**
 * Collections du simulateur de carreaux dans le simulateur de chaussettes — PUR (pas de DOM).
 *
 * Données produites par `npm run sync:carreaux` dans `public/carreaux/` :
 *   catalogue.json (collections + nuancier), calepinages.json, svg/<COLLECTION>-VAR<n>.svg
 *
 * Idée clé pour le jacquard : chaque « zone » d'un carreau (zone-1, zone-2…) est UNE couleur de fil.
 * On recolore les SVG par zone AVANT de les pixeliser : la palette de la chaussette est alors exactement
 * celle des zones (pas de réduction de couleurs approximative, pas de couleur parasite).
 */

import { emptyYarnZoneFallback } from './nuancierDefaults';

export interface NuancierColor {
  id: string; // ex. « OR008 »
  nom: string;
  hex: string; // '#rrggbb'
  ral: string;
  etat: string; // « Validé » | « Test »
  public: boolean; // Validé
}

export interface CollectionVariation {
  name: string; // « VAR1 »
  motif: number; // 1..N = numéro de motif dans les calepinages
  file: string; // « svg/MEDINA-VAR1.svg » (relatif à public/carreaux/)
  zones: string[]; // zones réellement dessinées dans cette variation
}

export type ZoneColors = Record<string, string>; // { "zone-1": "OR008", … }

export interface Collection {
  id: string;
  nom: string;
  description: string;
  categorie: string | null;
  format: string;
  actif: boolean;
  devSeulement: boolean;
  zonesLibres: boolean;
  variations: CollectionVariation[];
  zones: string[];
  couleursParDefaut: ZoneColors;
  couleursCollection: string[];
  recommandations: ZoneColors[];
  calepinages: string[];
  calepinageParDefaut: string | null;
  urlCollection: string | null;
  /** Provenance (T43) : absent dans d’anciens catalogues ⇒ traité comme `carreaux`. */
  source?: 'carreaux' | 'locale' | 'partagee';
  /** Vignette WebP (collections partagées T104). */
  vignetteUrl?: string | null;
  /** Timestamp de dernière modification (collections partagées). */
  modifieLe?: number;
}

/** Collection locale PNG (pas de zones) → pas de recoloration. */
export function isPngCollection(c: Collection): boolean {
  return c.variations.length > 0 && c.variations.every((v) => v.zones.length === 0 && /\.png$/i.test(v.file));
}

export interface Catalogue {
  version: number;
  synchroniseLe: string;
  source: { dossier: string; commit: string | null };
  nuancier: NuancierColor[];
  collections: Collection[];
}

/** Collections proposées dans l'interface (actives, hors développement sauf demande). */
export function visibleCollections(cat: Catalogue, showDev = false): Collection[] {
  return cat.collections.filter((c) => c.actif && (showDev || !c.devSeulement) && c.variations.length > 0);
}

export interface PaletteOption {
  id: string; // « defaut », « reco-1 », …
  label: string; // « Couleurs d'origine », « Suggestion de l'artiste 1 »
  colors: ZoneColors;
  public: boolean; // toutes les couleurs sont validées
}

/** Palettes proposées pour une collection : couleurs d'origine puis recommandations de l'artiste. */
export function paletteOptions(c: Collection, nuancier: Map<string, NuancierColor>, showTest = false): PaletteOption[] {
  const isPublic = (z: ZoneColors) => Object.values(z).every((id) => nuancier.get(id)?.public === true);
  const out: PaletteOption[] = [{ id: 'defaut', label: "Couleurs d'origine", colors: { ...c.couleursParDefaut }, public: isPublic(c.couleursParDefaut) }];
  c.recommandations.forEach((r, i) => {
    // une recommandation peut ne préciser que certaines zones : on complète avec les couleurs d'origine
    const colors = { ...c.couleursParDefaut, ...r };
    out.push({ id: `reco-${i + 1}`, label: `Suggestion de l'artiste ${i + 1}`, colors, public: isPublic(colors) });
  });
  return showTest ? out : out.filter((p, i) => i === 0 || p.public);
}

/** Couleurs de fil distinctes utilisées par une palette, dans l'ordre des zones (sans doublon). */
export function yarnColors(c: Collection, colors: ZoneColors, nuancier: Map<string, NuancierColor>): NuancierColor[] {
  const seen = new Set<string>();
  const out: NuancierColor[] = [];
  for (const z of c.zones) {
    const id = colors[z];
    const col = id ? nuancier.get(id) : undefined;
    if (col && !seen.has(col.id)) {
      seen.add(col.id);
      out.push(col);
    }
  }
  return out;
}

/**
 * Recolore un SVG du configurateur : chaque `<g id="zone-N">` prend la couleur donnée.
 * Méthode robuste quel que soit l'export (attribut fill, classes CSS d'Illustrator…) : on ajoute une
 * feuille de style prioritaire juste avant `</svg>`. Les contours (stroke) ne sont pas modifiés.
 * Les zones sans couleur fournie gardent leur couleur d'origine.
 */
export function recolorSvg(svg: string, hexByZone: Record<string, string>): string {
  const rules = Object.entries(hexByZone)
    .filter(([z, hex]) => /^zone-\d+$/.test(z) && /^#[0-9a-fA-F]{6}$/.test(hex))
    .map(([z, hex]) => `#${z},#${z} *{fill:${hex} !important}`)
    .join('');
  if (!rules) return svg;
  const style = `<style data-chaussettes="recoloration">${rules}</style>`;
  const i = svg.lastIndexOf('</svg>');
  return i < 0 ? svg : svg.slice(0, i) + style + svg.slice(i);
}

/** Zone colors (codes nuancier) → hexadécimaux. */
export function zoneHex(colors: ZoneColors, nuancier: Map<string, NuancierColor>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [z, id] of Object.entries(colors)) {
    const c = nuancier.get(id);
    if (c) out[z] = c.hex;
  }
  return out;
}

/**
 * Couleurs pour bord-côte, talon et pointe « assorties » au motif : la couleur la plus foncée pour le
 * bord-côte, la plus saturée (hors fond) pour talon et pointe. Simple suggestion, modifiable ensuite.
 */
export function suggestZoneColors(yarns: NuancierColor[]): { cuff: string; heel: string; toe: string } {
  if (!yarns.length) return emptyYarnZoneFallback();
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const sat = (h: string) => {
    const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const mx = Math.max(...v);
    const mn = Math.min(...v);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  const darkest = [...yarns].sort((a, b) => lum(a.hex) - lum(b.hex))[0]!;
  const vivid = [...yarns].filter((y) => y !== darkest).sort((a, b) => sat(b.hex) - sat(a.hex))[0] ?? darkest;
  return { cuff: darkest.hex, heel: vivid.hex, toe: vivid.hex };
}
