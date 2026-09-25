/**
 * Bibliothèque de préréglages de calepinage (configurateur de César) + migration des anciens `LayoutKind`.
 */
import rawCalepinages from '../../config/calepinages.json';
import {
  DEFAULT_CALEPINAGE,
  GENERATED_PRESETS,
  normalizePresets,
  type CalepinageSpec,
  type Preset,
  type Rot,
} from './calepinage';

const normalized = normalizePresets(rawCalepinages);

/** Les 75 préréglages du configurateur, normalisés. */
export const BUILTIN_PRESETS: readonly Preset[] = normalized.presets;

/** Avertissements d’import du fichier fourni (opale, Amour…). */
export const BUILTIN_PRESET_WARNINGS: readonly string[] = normalized.warnings;

export function presetById(id: string | null | undefined, library: readonly Preset[] = BUILTIN_PRESETS): Preset | null {
  if (!id) return null;
  return library.find((p) => p.id === id) ?? null;
}

export function resolvePreset(spec: CalepinageSpec, library: readonly Preset[] = BUILTIN_PRESETS): Preset | null {
  if (spec.source !== 'prereglage') return null;
  return presetById(spec.presetId, library);
}

/** Anciens identifiants `LayoutKind` (V1) → `CalepinageSpec`. */
const LEGACY_KINDS = new Set([
  'grille',
  'quinconce-h',
  'quinconce-v',
  'rotation-4',
  'miroir-4',
  'damier',
  'rotation-aleatoire',
]);

export function isLegacyLayoutKind(value: string): boolean {
  return LEGACY_KINDS.has(value);
}

/**
 * Migration V1 → V3 :
 * grille → unique ; quinconce-h/v → unique + appareillage ; rotation-4 → rosace ;
 * miroir-4 → miroir ; damier → suite (pas 1) ; rotation-aleatoire → unique + aleatoire-90.
 * La graine et la rotation globale existantes sont conservées.
 */
export function migrateLegacyKind(
  kind: string,
  seed = 1,
  rotation: Rot = 0,
): CalepinageSpec {
  const base: CalepinageSpec = {
    source: 'genere',
    presetId: null,
    genere: { ordre: 'unique', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 },
    appareil: 'droit',
    rotationGlobale: rotation,
    graine: seed,
  };
  switch (kind) {
    case 'grille':
      return base;
    case 'quinconce-h':
      return { ...base, appareil: 'quinconce-h' };
    case 'quinconce-v':
      return { ...base, appareil: 'quinconce-v' };
    case 'rotation-4':
      return { ...base, genere: { ordre: 'unique', pasRangee: 0, rotation: 'rosace', rotationFixe: 0 } };
    case 'miroir-4':
      return { ...base, genere: { ordre: 'unique', pasRangee: 0, rotation: 'miroir', rotationFixe: 0 } };
    case 'damier':
      return { ...base, genere: { ordre: 'suite', pasRangee: 1, rotation: 'aucune', rotationFixe: 0 } };
    case 'rotation-aleatoire':
      return { ...base, genere: { ordre: 'unique', pasRangee: 0, rotation: 'aleatoire-90', rotationFixe: 0 } };
    default:
      return { ...DEFAULT_CALEPINAGE, graine: seed, rotationGlobale: rotation };
  }
}

/** Identifiant de galerie pour un calepinage généré (sinon null). */
export function generatedPresetId(spec: CalepinageSpec): string | null {
  if (spec.source !== 'genere') return null;
  const found = GENERATED_PRESETS.find(
    (g) =>
      g.genere.ordre === spec.genere.ordre &&
      g.genere.pasRangee === spec.genere.pasRangee &&
      g.genere.rotation === spec.genere.rotation &&
      g.genere.rotationFixe === spec.genere.rotationFixe &&
      (g.appareil ?? 'droit') === spec.appareil,
  );
  return found?.id ?? null;
}

export function applyGeneratedPreset(id: string, seed: number, rotationGlobale: Rot = 0): CalepinageSpec | null {
  const g = GENERATED_PRESETS.find((item) => item.id === id);
  if (!g) return null;
  return {
    source: 'genere',
    presetId: null,
    genere: { ...g.genere },
    appareil: g.appareil ?? 'droit',
    rotationGlobale,
    graine: seed,
  };
}
