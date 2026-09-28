/** Client API collections partagées (`/api/collections`) — T102 / T103. */

import { shareDefaultsFor } from '../core/layers';
import { FavorisApiError } from './favorisApi';
import { decodeShare } from './shareLink';
import { PASSWORD_HEADER } from '../../worker/password';

export type SharedCollectionApi = {
  id: string;
  nom: string;
  description: string;
  format: string;
  variations: Array<{ name: string; motif: number; file: string; zones: string[] }>;
  zones: string[];
  couleursParDefaut: Record<string, string>;
  recommandations: Record<string, string>[];
  calepinages: string[];
  calepinageParDefaut: string | null;
  source: string;
  modifie_le?: number;
  has_vignette?: boolean;
  vignette_url?: string | null;
};

/** Message quand la réponse n’est pas du JSON (HTML Vite/Cloudflare, table absente, Worker non redéployé). */
export const COLLECTIONS_API_UNAVAILABLE =
  'API collections indisponible : en local lancer « npm run dev:api » ; en prod « npm run db:migrate:remote » puis redéployer le Worker.';

export async function listSharedCollections(corbeille = false): Promise<SharedCollectionApi[]> {
  const q = corbeille ? '?corbeille=1' : '';
  const res = await fetch(`/api/collections${q}`);
  const body = await parseJson(res);
  if (!res.ok) throw new FavorisApiError(erreurOf(body, res.status), res.status);
  const list = (body as { collections?: SharedCollectionApi[] }).collections;
  return Array.isArray(list) ? list : [];
}

/**
 * Interprète le corps ; si ce n’est pas du JSON, message actionnable (plus « illisible »).
 * Exporté pour les tests unitaires.
 */
export function messageForNonJsonBody(status: number, text: string, contentType: string | null): string {
  const ct = (contentType ?? '').toLowerCase();
  const trimmed = text.trim();
  const looksHtml = ct.includes('text/html') || /^<!doctype|^<html|^<body/i.test(trimmed);
  if (looksHtml || status === 502 || status === 503 || status === 520) {
    return COLLECTIONS_API_UNAVAILABLE;
  }
  if (!trimmed) {
    return `Réponse API vide (${status}). ${COLLECTIONS_API_UNAVAILABLE}`;
  }
  if (status === 404) {
    return `Route collections introuvable (${status}) : Worker à redéployer après V12 ?`;
  }
  return `Réponse API non JSON (${status}). Vérifier migration D1 (collections) et déploiement Worker.`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) {
      throw new FavorisApiError(messageForNonJsonBody(res.status, text, res.headers.get('Content-Type')), res.status);
    }
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FavorisApiError(
      messageForNonJsonBody(res.status, text, res.headers.get('Content-Type')),
      res.status,
    );
  }
}

function erreurOf(body: unknown, status: number): string {
  if (body && typeof body === 'object' && body !== null && 'erreur' in body) {
    return String((body as { erreur: unknown }).erreur);
  }
  if (status === 401) return 'Mot de passe incorrect';
  return `Erreur API (${status})`;
}

export async function createSharedCollection(
  form: FormData,
  password: string,
): Promise<SharedCollectionApi> {
  let res: Response;
  try {
    res = await fetch('/api/collections', {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: password },
      body: form,
    });
  } catch {
    throw new FavorisApiError(COLLECTIONS_API_UNAVAILABLE);
  }
  const body = await parseJson(res);
  if (!res.ok) throw new FavorisApiError(erreurOf(body, res.status), res.status);
  return body as SharedCollectionApi;
}

export async function patchSharedCollection(
  id: string,
  form: FormData,
  password: string,
): Promise<SharedCollectionApi> {
  let res: Response;
  try {
    res = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { [PASSWORD_HEADER]: password },
      body: form,
    });
  } catch {
    throw new FavorisApiError(COLLECTIONS_API_UNAVAILABLE);
  }
  const body = await parseJson(res);
  if (!res.ok) throw new FavorisApiError(erreurOf(body, res.status), res.status);
  return body as SharedCollectionApi;
}

export async function deleteSharedCollection(id: string, password: string): Promise<void> {
  const res = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { [PASSWORD_HEADER]: password },
  });
  if (!res.ok) {
    const body = await parseJson(res);
    throw new FavorisApiError(erreurOf(body, res.status), res.status);
  }
}

export async function restoreSharedCollection(id: string, password: string): Promise<void> {
  const res = await fetch(`/api/collections/${encodeURIComponent(id)}/restaurer`, {
    method: 'POST',
    headers: { [PASSWORD_HEADER]: password },
  });
  if (!res.ok) {
    const body = await parseJson(res);
    throw new FavorisApiError(erreurOf(body, res.status), res.status);
  }
}

/** Le lien favori est compressé (`p=2.…`) : on décode pour retrouver l’id `p-…`. */
async function favoriLienCitesCollection(lien: string, collectionId: string): Promise<boolean> {
  if (lien.includes(collectionId)) return true;
  const hash = lien.startsWith('#') || lien.startsWith('p=') ? (lien.startsWith('#') ? lien : `#${lien}`) : `#${lien}`;
  const decoded = await decodeShare(hash, shareDefaultsFor);
  if (!decoded.ok) return false;
  return JSON.stringify(decoded.design).includes(collectionId);
}

export async function countFavorisUsingCollection(collectionId: string): Promise<number> {
  try {
    const res = await fetch('/api/favoris');
    if (!res.ok) return 0;
    const body = (await res.json()) as { favoris: Array<{ lien: string }> };
    let n = 0;
    for (const f of body.favoris) {
      if (await favoriLienCitesCollection(f.lien, collectionId)) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
