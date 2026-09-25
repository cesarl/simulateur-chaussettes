import type { DesignPatch } from './state';
import type { Catalogue } from './core/collections';
import type { KnitFidelity, SockDesign } from './core/types';
import type { ViewName } from './render/sock3d/studio';

export interface StitchRead {
  col: number;
  row: number;
  zone: number;
  color: string;
}

/** Crochet lu par les tests e2e. Pas destiné à l'utilisateur. */
export interface SimHook {
  ready: boolean;
  computeId: number;
  lastComputeMs: number;
  design: SockDesign;
  grid: { width: number; height: number; palette: string[] };
  /** Empreinte de la grille de mailles, pour comparer deux projets. */
  gridHash: string;
  /** Couleurs du motif seul, après réduction (hors couleurs de zones). */
  patternPalette: string[];
  geometryBuilds: number;
  /** Nombre de mises à jour de la texture de couleur, sans reconstruire le maillage. */
  textureUpdates: number;
  /** Mode de frontière des mailles en 3D. */
  knitFidelity: KnitFidelity;
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  warnings: string[];
  /** Catalogue synchronisé, ou null si absent. */
  catalogue: Catalogue | null;
  catalogueMissing: boolean;
  /** Collection active, ou null. */
  activeCollectionId: string | null;
  loadFixture: (name: string) => Promise<void>;
  setDesign: (partial: DesignPatch) => void;
  getStitch: (col: number, row: number) => StitchRead | null;
  /** Centre bitmap d'une maille dans la vue à plat, ou null si elle est hors cadre. */
  flatCenter: (col: number, row: number) => { x: number; y: number } | null;
  /** Capture PNG studio (data URL), pour les contrôles visuels. */
  captureView: (view: ViewName, size: number, background?: string | null) => Promise<string>;
  /** Export paire (data URL). */
  capturePair: (size: number, background?: string | null) => Promise<string>;
}

declare global {
  interface Window {
    __SIM__?: SimHook;
  }
}
