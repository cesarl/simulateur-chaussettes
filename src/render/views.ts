import type { ViewName } from './sock3d/studio';

/** Vues proposées à l’utilisateur (hors `dessous`, réservée aux contrôles). */
export type ViewId = Exclude<ViewName, 'dessous'>;

export interface ViewAngle {
  id: ViewId;
  label: string;
  testId: string;
}

export const VIEW_ANGLES: readonly ViewAngle[] = [
  { id: 'trois-quarts', label: 'Trois-quarts', testId: 'export-trois-quarts' },
  { id: 'profil-exterieur', label: 'Profil extérieur', testId: 'export-profil-exterieur' },
  { id: 'face', label: 'Face', testId: 'export-face' },
  { id: 'dos', label: 'Dos', testId: 'export-dos' },
  { id: 'profil-interieur', label: 'Profil intérieur', testId: 'export-profil-interieur' },
  { id: 'trois-quarts-dos', label: 'Trois-quarts dos', testId: 'export-trois-quarts-dos' },
];

export function viewById(id: ViewId): ViewAngle {
  const found = VIEW_ANGLES.find((view) => view.id === id);
  if (!found) throw new Error(`Vue inconnue : ${id}`);
  return found;
}
