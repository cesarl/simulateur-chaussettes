/**
 * Contrat de données central du simulateur.
 * Toute la logique métier (src/core) est PURE : elle ne dépend ni du DOM ni de Three.js,
 * pour être testable avec Vitest. Ce fichier est un point de départ : l'agent peut l'affiner
 * (en notant la décision dans docs/DECISIONS.md), mais pas le contourner.
 */

import type { CalepinageSpec, SeamPosition as CalepSeamPosition } from './calepinage';
import type { Composition } from './composition';

/** Couleur au format '#rrggbb' (minuscules). */
export type Hex = string;

/**
 * Source du motif de la zone tricotée (T42).
 * Défaut / champ absent dans les projets anciens : `carreaux` (calepinage inchangé).
 */
export type PatternSource =
  | { kind: 'carreaux' }
  | { kind: 'composition'; composition: Composition };

/** Un carreau importé (PNG ou SVG), converti en image bitmap RGBA à l'import. */
export interface TileAsset {
  id: string;
  name: string;
  source: 'png' | 'svg';
  /** Pixels RGBA du carreau rasterisé (largeur × hauteur × 4). */
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Texte SVG d’origine (imports manuels) — pour le lien de partage. Absent pour les PNG. */
  svgText?: string;
}

/**
 * Réglages de calepinage : géométrie des carreaux + spec multi-motifs (`CalepinageSpec`).
 * Ancien champ `kind` (LayoutKind) migré via `migrateLegacyKind`.
 */
export type SeamPosition = CalepSeamPosition;

/** Mode de taille des carreaux : N sur le tour (défaut) ou largeur/hauteur libres en mailles. */
export type TileSizeMode = 'around' | 'free';

export interface LayoutSettings {
  calepinage: CalepinageSpec;
  /** Carreaux utilisés, dans l'ordre (motif 1, 2…). Au moins 1. */
  tileIds: string[];
  /** Taille d'un carreau en mailles (colonnes) et en rangs (lignes). */
  tileStitches: number;
  tileRows: number;
  /** Joint entre carreaux, en mailles / rangs (0 = pas de joint) et sa couleur. */
  gapStitches: number;
  gapRows: number;
  gapColor: Hex;
  /** Décalage global du motif (pour choisir où tombe le raccord). */
  offsetStitches: number;
  offsetRows: number;
  /** Où tombe le raccord circulaire (T37). */
  seam: SeamPosition;
  /** Nombre de carreaux sur le tour (T36) ; utilisé si `tileSizeMode === 'around'`. */
  tilesAround: number;
  tileSizeMode: TileSizeMode;
}

/** Décor sol/mur (T38) — champs minimaux pour le lien de partage dès T35. */
export type DecorMode = 'aucun' | 'sol' | 'mur' | 'coin';

export interface DecorSettings {
  mode: DecorMode;
  tileCm: number;
  groutMm: number;
  groutColor: Hex;
  patina: number;
  /** 0 = couleurs franches (défaut), 1 = décor très pâle. */
  attenuation: number;
  /** Intensité du grain photo de ciment, 0–1. */
  grainStrength: number;
  /** Source des carreaux du décor. */
  tileSource: 'sock' | 'collection-origin' | 'other-collection';
  otherCollectionId: string | null;
}

export type SizeId = 'homme' | 'femme';

/** Dimensions de la chaussette en mailles et rangs (voir config/sizes.json). */
export interface SockDimensions {
  size: SizeId;
  /** Nombre d'aiguilles du cylindre = nombre de mailles sur le tour. */
  needles: number;
  cuffRows: number;   // bord-côte (0 si absent)
  legRows: number;    // tige (zone motif) — peut être raccourcie, jamais allongée au-delà du max de la taille
  heelRows: number;   // talon (tricoté sur la moitié des aiguilles)
  footRows: number;   // pied (zone motif)
  toeRows: number;    // pointe (tricotée sur la moitié des aiguilles)
  /** Jauge : densité du tricot, sert à l'échelle réelle et au rapport largeur/hauteur de la maille. */
  stitchesPerCm: number;
  rowsPerCm: number;
}

export interface ZoneSettings {
  cuffEnabled: boolean;
  cuffColor: Hex;
  heelColor: Hex;
  toeColor: Hex;
  /** Le motif continue-t-il sur le pied (dessus + semelle) ? */
  patternOnFoot: boolean;
  /** Couleur de fond du pied si patternOnFoot = false. */
  footColor: Hex;
  /**
   * Aperçu 3D seulement : hauteur du talon au dos (mm, taille homme ; 25–110).
   * N’affecte pas le nombre de rangs de talon de la grille.
   */
  heelHeightMm: number;
  /** Aperçu 3D : profondeur du talon sous le pied (mm ; 40–130). */
  heelDepthMm: number;
  /** Aperçu 3D : largeur du talon autour de la cheville (50–100 %). */
  heelSpread: number;
}

export interface QuantizeSettings {
  /** Nombre max de couleurs du motif (hors couleurs de zones). */
  maxColors: number;
  /** 'auto' = palette calculée (k-means), 'manuelle' = palette imposée (fils du fabricant). */
  paletteMode: 'auto' | 'manuelle';
  palette: Hex[];
  /** Échantillonnage de chaque maille : couleur majoritaire (net) ou moyenne (doux). */
  sampling: 'majoritaire' | 'moyenne';
  /** Supprime les mailles isolées (1 maille seule d'une couleur). */
  despeckle: boolean;
  /** Longueur de flotté max tolérée (mailles consécutives de même couleur sur un rang) pour l'alerte. */
  maxFloat: number;
}

/** Réglages complets d'un modèle : c'est l'état de l'application (sérialisable en JSON). */
export interface SockDesign {
  version: 1;
  name: string;
  layout: LayoutSettings;
  dimensions: SockDimensions;
  zones: ZoneSettings;
  quantize: QuantizeSettings;
  decor: DecorSettings;
  /** Source du motif ; absent dans les anciens projets ⇒ traité comme `carreaux`. */
  pattern: PatternSource;
}

/** Frontière des mailles en 3D : droite (simple) ou en V (fidèle). Hors sérialisation projet. */
export type KnitFidelity = 'simple' | 'fidele';

/** Zones de la grille de mailles (objet constant plutôt qu'enum : compatible isolatedModules). */
export const Zone = {
  Cuff: 0,
  Leg: 1,
  Heel: 2,
  Foot: 3,
  Toe: 4,
  Empty: 255, // hors tricot (moitié inutilisée des rangs talon/pointe dans la vue à plat)
} as const;
export type ZoneId = (typeof Zone)[keyof typeof Zone];

/**
 * Grille de mailles : 1 cellule = 1 maille. Ligne 0 = premier rang tricoté (haut du bord-côte).
 * C'est LA source de vérité : la texture 3D et l'export à plat en dérivent.
 */
export interface StitchGrid {
  width: number;  // = needles
  height: number; // = somme des rangs
  palette: Hex[]; // index → couleur
  colorIndex: Uint8Array; // width × height
  zone: Uint8Array;       // width × height (valeurs de Zone)
}
