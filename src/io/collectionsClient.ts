/** Client API collections partagées (`/api/collections`) — T102. */

import { FavorisApiError } from './favorisApi';
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
};

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FavorisApiError('Réponse API illisible', res.status);
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
    throw new FavorisApiError('API collections indisponible');
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
    throw new FavorisApiError('API collections indisponible');
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

export async function countFavorisUsingCollection(collectionId: string): Promise<number> {
  try {
    const res = await fetch('/api/favoris');
    if (!res.ok) return 0;
    const body = (await res.json()) as { favoris: Array<{ lien: string }> };
    return body.favoris.filter((f) => f.lien.includes(collectionId)).length;
  } catch {
    return 0;
  }
}
