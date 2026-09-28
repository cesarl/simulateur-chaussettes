/**
 * Chargement du catalogue synchronisé (`public/carreaux/`) + collections partagées `/api/collections`.
 * Chemins relatifs à la page (`base: './'`). Absent → l’app fonctionne comme avant.
 */
import { normalizePresets, type Preset } from '../core/calepinage';
import type { Catalogue, Collection } from '../core/collections';
import {
  collectionFromSharedPayload,
  mergeSharedIntoCatalogue,
  type SharedCollectionPayload,
} from '../core/sharedCatalogue';
import { isSharedCollectionId } from '../core/collectionSlug';

const DEFAULT_BASE = './carreaux/';

export const CATALOGUE_MISSING_MESSAGE =
  'Collections non synchronisées : lancez `npm run sync:carreaux`';

export const SHARED_UNAVAILABLE_MESSAGE =
  'Collections partagées indisponibles (hors ligne ou API absente).';

export interface CatalogueBundle {
  catalogue: Catalogue | null;
  presets: Preset[] | null;
  warnings: string[];
  /** true si catalogue.json est introuvable (404 / réseau). */
  missing: boolean;
  /** true si `/api/collections` n’a pas répondu (vite sans Worker, hors ligne…). */
  sharedUnavailable: boolean;
}

function isCatalogue(value: unknown): value is Catalogue {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return Array.isArray(o.collections) && Array.isArray(o.nuancier);
}

function isSharedPayload(value: unknown): value is SharedCollectionPayload {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.nom === 'string' &&
    typeof o.format === 'string' &&
    Array.isArray(o.variations) &&
    Array.isArray(o.zones) &&
    typeof o.couleursParDefaut === 'object' &&
    o.couleursParDefaut !== null
  );
}

/** GET /api/collections (liste publique). Échec silencieux → []. */
export async function fetchSharedCollectionsList(): Promise<{
  collections: SharedCollectionPayload[];
  unavailable: boolean;
}> {
  try {
    const res = await fetch('/api/collections');
    if (!res.ok) return { collections: [], unavailable: true };
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== 'object') return { collections: [], unavailable: true };
    const list = (raw as { collections?: unknown }).collections;
    if (!Array.isArray(list)) return { collections: [], unavailable: true };
    return {
      collections: list.filter(isSharedPayload),
      unavailable: false,
    };
  } catch {
    return { collections: [], unavailable: true };
  }
}

/** GET /api/collections/:id — lit aussi la corbeille (favoris / liens). */
export async function fetchSharedCollectionById(id: string): Promise<Collection | null> {
  if (!isSharedCollectionId(id)) return null;
  try {
    const res = await fetch(`/api/collections/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    if (!isSharedPayload(raw)) return null;
    return collectionFromSharedPayload(raw);
  } catch {
    return null;
  }
}

/**
 * Charge `catalogue.json` et `calepinages.json` sous `base` (défaut `./carreaux/`).
 * Fusionne ensuite `/api/collections` si disponible.
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

  let sharedUnavailable = false;
  if (catalogue) {
    const shared = await fetchSharedCollectionsList();
    sharedUnavailable = shared.unavailable;
    if (!shared.unavailable && shared.collections.length > 0) {
      catalogue = mergeSharedIntoCatalogue(catalogue, shared.collections);
    }
  } else {
    // Pas de catalogue local : on tente quand même les partagées (nuancier vide).
    const shared = await fetchSharedCollectionsList();
    sharedUnavailable = shared.unavailable;
    if (!shared.unavailable && shared.collections.length > 0) {
      catalogue = mergeSharedIntoCatalogue(
        {
          version: 0,
          synchroniseLe: '',
          source: { dossier: '', commit: null },
          nuancier: [],
          collections: [],
        },
        shared.collections,
      );
      missing = false;
    }
  }

  return { catalogue, presets, warnings, missing, sharedUnavailable };
}
