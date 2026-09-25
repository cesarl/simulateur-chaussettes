/**
 * Chargement du catalogue synchronisé (`public/carreaux/`).
 * Chemins relatifs à la page (`base: './'`). Absent → l’app fonctionne comme avant.
 */
import { normalizePresets, type Preset } from '../core/calepinage';
import type { Catalogue } from '../core/collections';

const DEFAULT_BASE = './carreaux/';

export const CATALOGUE_MISSING_MESSAGE =
  'Collections non synchronisées : lancez `npm run sync:carreaux`';

export interface CatalogueBundle {
  catalogue: Catalogue | null;
  presets: Preset[] | null;
  warnings: string[];
  /** true si catalogue.json est introuvable (404 / réseau). */
  missing: boolean;
}

function isCatalogue(value: unknown): value is Catalogue {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return Array.isArray(o.collections) && Array.isArray(o.nuancier);
}

/**
 * Charge `catalogue.json` et `calepinages.json` sous `base` (défaut `./carreaux/`).
 * Si le catalogue manque, `missing` est vrai et `presets` reste null (garder config/calepinages).
 */
export async function loadCatalogue(base = DEFAULT_BASE): Promise<CatalogueBundle> {
  const root = base.endsWith('/') ? base : `${base}/`;
  const catalogueUrl = `${root}catalogue.json`;
  const calepUrl = `${root}calepinages.json`;

  let catalogue: Catalogue | null = null;
  let missing = false;

  try {
    const res = await fetch(catalogueUrl);
    if (res.status === 404) {
      missing = true;
    } else if (!res.ok) {
      missing = true;
    } else {
      const raw: unknown = await res.json();
      if (isCatalogue(raw)) catalogue = raw;
      else missing = true;
    }
  } catch {
    missing = true;
  }

  let presets: Preset[] | null = null;
  let warnings: string[] = [];

  if (!missing) {
    try {
      const res = await fetch(calepUrl);
      if (res.ok) {
        const raw: unknown = await res.json();
        const normalized = normalizePresets(raw);
        presets = normalized.presets;
        warnings = [...normalized.warnings];
      }
    } catch {
      // calepinages absents : on garde la bibliothèque embarquée
    }
  }

  return { catalogue, presets, warnings, missing };
}
