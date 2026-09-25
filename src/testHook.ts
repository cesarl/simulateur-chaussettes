import type { DesignPatch } from './state';
import type { SockDesign } from './core/types';

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
  geometryBuilds: number;
  /** Nombre de mises à jour de la texture de couleur, sans reconstruire le maillage. */
  textureUpdates: number;
  warnings: string[];
  loadFixture: (name: string) => Promise<void>;
  setDesign: (partial: DesignPatch) => void;
  getStitch: (col: number, row: number) => StitchRead | null;
}

declare global {
  interface Window {
    __SIM__?: SimHook;
  }
}
