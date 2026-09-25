/** Angles d'export. La caméra se place dans cette direction, depuis le centre de la chaussette. */

export type ViewId = 'face' | 'trois-quarts' | 'profil-exterieur' | 'dos' | 'profil-interieur';

export interface ViewAngle {
  id: ViewId;
  label: string;
  testId: string;
  /** Direction du centre vers la caméra. +Z = face, −X = extérieur, +X = intérieur, −Z = dos. */
  direction: readonly [number, number, number];
}

export const VIEW_ANGLES: readonly ViewAngle[] = [
  { id: 'face', label: 'Face', testId: 'export-face', direction: [0, 0.12, 1] },
  { id: 'trois-quarts', label: 'Trois-quarts', testId: 'export-trois-quarts', direction: [-0.72, 0.18, 0.78] },
  { id: 'profil-exterieur', label: 'Profil extérieur', testId: 'export-profil-exterieur', direction: [-1, 0.1, 0] },
  { id: 'dos', label: 'Dos', testId: 'export-dos', direction: [0, 0.12, -1] },
  { id: 'profil-interieur', label: 'Profil intérieur', testId: 'export-profil-interieur', direction: [1, 0.1, 0] },
];

export function viewById(id: ViewId): ViewAngle {
  const found = VIEW_ANGLES.find((view) => view.id === id);
  if (!found) throw new Error(`Vue inconnue : ${id}`);
  return found;
}
