/** Client favoris : messages d’indisponibilité hors `dev:api`. */

export const FAVORIS_VITE_MESSAGE =
  'Favoris indisponibles en mode vite : lancer npm run dev:api';

export class FavorisApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FavorisApiError';
  }
}

/**
 * GET/POST JSON vers l’API. En mode vite seul (pas de Worker), le fetch échoue
 * ou renvoie du HTML : on remonte le message dédié.
 */
export async function fetchFavorisJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new FavorisApiError(FAVORIS_VITE_MESSAGE);
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      if (!res.ok) throw new FavorisApiError(FAVORIS_VITE_MESSAGE, res.status);
      throw new FavorisApiError(FAVORIS_VITE_MESSAGE, res.status);
    }
  }
  if (!res.ok) {
    const err =
      body && typeof body === 'object' && body !== null && 'erreur' in body && typeof (body as { erreur: unknown }).erreur === 'string'
        ? (body as { erreur: string }).erreur
        : res.status === 401
          ? 'Mot de passe incorrect'
          : `Erreur API (${res.status})`;
    throw new FavorisApiError(err, res.status);
  }
  return body as T;
}
