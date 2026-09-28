/** Mot de passe commun mémorisé + appels d’écriture favoris. */

import { FAVORIS_VITE_MESSAGE, FavorisApiError, fetchFavorisJson } from './favorisApi';

export const MDP_STORAGE_KEY = 'simulateur-chaussettes:mdp';

export const IMPORTED_IMAGES_MESSAGE =
  'Ce projet contient des images importées : elles ne peuvent pas encore être enregistrées en ligne. Utilisez des images de la bibliothèque, ou envoyez le fichier .json.';

export function readStoredPassword(): string | null {
  try {
    return localStorage.getItem(MDP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storePassword(password: string): void {
  try {
    localStorage.setItem(MDP_STORAGE_KEY, password);
  } catch {
    /* ignore */
  }
}

export function forgetPassword(): void {
  try {
    localStorage.removeItem(MDP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type FavoriCreateBody = { nom: string; lien: string; vignette?: string };
export type FavoriPatchBody = { nom?: string; lien?: string; vignette?: string };

export async function createFavori(
  body: FavoriCreateBody,
  password: string,
): Promise<{ id: string }> {
  return fetchFavorisJson<{ id: string }>('/api/favoris', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mot-De-Passe': password,
    },
    body: JSON.stringify(body),
  });
}

export async function patchFavori(
  id: string,
  body: FavoriPatchBody,
  password: string,
): Promise<{ ok: boolean }> {
  return fetchFavorisJson<{ ok: boolean }>(`/api/favoris/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Mot-De-Passe': password,
    },
    body: JSON.stringify(body),
  });
}

export { FAVORIS_VITE_MESSAGE, FavorisApiError };
