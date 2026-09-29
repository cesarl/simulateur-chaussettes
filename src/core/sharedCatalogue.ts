/**
 * Fusion des collections partagées (API) dans le catalogue local — PUR (T101).
 */
import type { Catalogue, Collection, CollectionVariation, ZoneColors } from './collections';
import { isSharedCollectionId } from './collectionSlug';
import type { CalepinagePerso } from './motifPreviewEdit';
import { parseCalepinagePerso } from './motifPreviewEdit';

export type SharedCollectionPayload = {
  id: string;
  nom: string;
  description?: string;
  format: string;
  variations: CollectionVariation[];
  zones: string[];
  couleursParDefaut: ZoneColors;
  recommandations?: ZoneColors[];
  recommandationsNoms?: string[];
  calepinages?: string[];
  calepinageParDefaut?: string | null;
  calepinagePerso?: CalepinagePerso | null;
  categorie?: string | null;
  source?: string;
  actif?: boolean;
  has_vignette?: boolean;
  vignette_url?: string | null;
  modifie_le?: number;
  cree_le?: number;
  supprime_le?: number | null;
};

/** Convertit la charge utile API en `Collection` catalogue. */
export function collectionFromSharedPayload(raw: SharedCollectionPayload): Collection {
  return {
    id: raw.id,
    nom: raw.nom,
    description: raw.description ?? '',
    categorie: 'Collections partagées',
    format: raw.format,
    actif: raw.actif !== false,
    devSeulement: false,
    zonesLibres: false,
    variations: raw.variations.map((v) => ({
      name: v.name,
      motif: v.motif,
      file: v.file,
      zones: [...v.zones],
    })),
    zones: [...raw.zones],
    couleursParDefaut: { ...raw.couleursParDefaut },
    couleursCollection: [],
    recommandations: (raw.recommandations ?? []).map((r) => ({ ...r })),
    calepinages: [...(raw.calepinages ?? [])],
    calepinageParDefaut: raw.calepinageParDefaut ?? null,
    calepinagePerso: parseCalepinagePerso(raw.calepinagePerso ?? null),
    urlCollection: null,
    source: 'partagee',
    vignetteUrl: raw.vignette_url ?? null,
    modifieLe: raw.modifie_le,
  };
}

/**
 * Remplace les anciennes entrées `partagee` et ajoute les nouvelles.
 * Les ids locaux (catalogue / locale) ne sont jamais écrasés.
 */
export function mergeSharedIntoCatalogue(
  catalogue: Catalogue,
  shared: readonly SharedCollectionPayload[],
): Catalogue {
  const keep = catalogue.collections.filter((c) => c.source !== 'partagee');
  const localIds = new Set(keep.map((c) => c.id));
  const added: Collection[] = [];
  for (const raw of shared) {
    if (!isSharedCollectionId(raw.id)) continue;
    if (localIds.has(raw.id)) continue;
    added.push(collectionFromSharedPayload(raw));
  }
  return { ...catalogue, collections: [...keep, ...added] };
}

/** Injecte (ou remplace) une collection partagée déjà connue par id (ex. corbeille). */
export function upsertSharedCollection(catalogue: Catalogue, collection: Collection): Catalogue {
  const others = catalogue.collections.filter((c) => c.id !== collection.id);
  return {
    ...catalogue,
    collections: [...others, { ...collection, source: 'partagee', categorie: 'Collections partagées' }],
  };
}

export function isSharedCollection(c: Collection): boolean {
  return c.source === 'partagee' || isSharedCollectionId(c.id);
}
