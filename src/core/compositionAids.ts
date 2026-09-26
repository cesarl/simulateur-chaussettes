/**
 * Aides jacquard pour le mode composition (T48).
 * Détecte les mailles isolées (détail plus fin qu’une maille) après réduction.
 */
export interface IsolatedStitchReport {
  isolatedCount: number;
  totalStitches: number;
  /** Proportion 0..1 des mailles isolées. */
  ratio: number;
  /** true si la proportion dépasse le seuil (détails trop fins). */
  tooFine: boolean;
}

const DEFAULT_RATIO_THRESHOLD = 0.02;

/**
 * Une maille est « isolée » si ses 4 voisins (tour circulaire en colonnes)
 * sont tous d’une autre couleur, et tous égaux entre eux.
 * Même critère que le despeckle de `quantize.ts`.
 */
export function countIsolatedStitches(
  indices: Uint8Array,
  width: number,
  height: number,
  ratioThreshold = DEFAULT_RATIO_THRESHOLD,
): IsolatedStitchReport {
  let isolatedCount = 0;
  const totalStitches = Math.max(0, width * height);
  if (width <= 0 || height <= 2) {
    return { isolatedCount: 0, totalStitches, ratio: 0, tooFine: false };
  }
  for (let row = 1; row < height - 1; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const center = indices[index] ?? 0;
      const left = indices[row * width + ((col + width - 1) % width)] ?? 0;
      const right = indices[row * width + ((col + 1) % width)] ?? 0;
      const up = indices[(row - 1) * width + col] ?? 0;
      const down = indices[(row + 1) * width + col] ?? 0;
      if (left === right && right === up && up === down && left !== center) {
        isolatedCount += 1;
      }
    }
  }
  const ratio = totalStitches > 0 ? isolatedCount / totalStitches : 0;
  return {
    isolatedCount,
    totalStitches,
    ratio,
    tooFine: ratio > ratioThreshold,
  };
}
