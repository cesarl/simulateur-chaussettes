/**
 * Contrat de données central du simulateur.
 * Toute la logique métier (src/core) est PURE : elle ne dépend ni du DOM ni de Three.js,
 * pour être testable avec Vitest. Ce fichier est un point de départ : l'agent peut l'affiner
 * (en notant la décision dans docs/DECISIONS.md), mais pas le contourner.
 */

/** Couleur au format '#rrggbb' (minuscules). */
export type Hex = string;

/** Un carreau importé (PNG ou SVG), converti en image bitmap RGBA à l'import. */
export interface TileAsset {
  id: string;
  name: string;
  source: 'png' | 'svg';
  /** Pixels RGBA du carreau rasterisé (largeur × hauteur × 4). */
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/** Calepinages disponibles (mêmes idées que le simulateur de carreaux). */
export type LayoutKind =
  | 'grille'          // grille droite
  | 'quinconce-h'     // rangées décalées d'une demi-largeur (appareillage brique)
  | 'quinconce-v'     // colonnes décalées d'une demi-hauteur
  | 'rotation-4'      // bloc 2×2 : 0°, 90°, 180°, 270°
  | 'miroir-4'        // bloc 2×2 : normal, miroir H, miroir V, miroir HV
  | 'damier'          // alternance de 2 carreaux (A/B) en damier
  | 'rotation-aleatoire'; // rotation par carreau tirée au hasard (graine fixe)

export interface LayoutSettings {
  kind: LayoutKind;
  /** Carreaux utilisés, dans l'ordre (A, B…). Au moins 1. */
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
  /** Rotation globale appliquée à chaque carreau avant calepinage. */
  rotation: 0 | 90 | 180 | 270;
  /** Graine pour les calepinages aléatoires (rendu reproductible). */
  seed: number;
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
