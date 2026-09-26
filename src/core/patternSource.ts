/**
 * Aiguillage de la source de motif (T42).
 * Carreaux → samplePattern ; composition → renderComposition.
 * Tout ce qui suit (quantize, zones, grille, 3D, exports) reste inchangé.
 */
import type { Preset } from './calepinage';
import { renderComposition, type RasterImage } from './composition';
import { motifRows, samplePattern } from './layout';
import type { PatternSource, SockDesign, TileAsset } from './types';

export function normalizePatternSource(value: PatternSource | undefined | null): PatternSource {
  if (!value || value.kind !== 'composition') return { kind: 'carreaux' };
  return value;
}

export interface PatternComputeInput {
  design: SockDesign;
  tiles: TileAsset[];
  calepPresets: readonly Preset[];
  /** Images pixelisées pour le mode composition (remplies en T45). */
  compositionImages?: ReadonlyMap<string, RasterImage>;
}

/**
 * Couleurs RVB de la zone motif (aiguilles × rangs de motif × 3),
 * ou `null` s’il n’y a rien à peindre (mode carreaux sans carreaux).
 */
export function computePatternRgb(input: PatternComputeInput): Uint8ClampedArray | null {
  const { design, tiles, calepPresets } = input;
  const pattern = normalizePatternSource(design.pattern);

  if (pattern.kind === 'composition') {
    const rows = motifRows(design.dimensions, design.zones);
    if (rows < 1 || design.dimensions.needles < 1) return null;
    const result = renderComposition(
      pattern.composition,
      new Map(input.compositionImages ?? []),
      {
        needles: design.dimensions.needles,
        rows,
        stitchesPerCm: design.dimensions.stitchesPerCm,
        rowsPerCm: design.dimensions.rowsPerCm,
      },
    );
    return result.rgb;
  }

  if (tiles.length === 0 || design.layout.tileIds.length === 0) return null;
  return samplePattern(
    tiles,
    design.layout,
    design.dimensions,
    design.zones,
    design.quantize.sampling,
    calepPresets,
  );
}
