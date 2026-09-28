import type { Env } from './env';
import { handleCollections } from './api/collections';
import { handleFavoris } from './api/favoris';
import { handleImages } from './api/images';

/** Point d'entrée Worker : API `/api/*` ; le reste est servi par les assets. */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/sante' || path === '/api/sante/') {
      return handleSante(env);
    }

    if (path === '/api/favoris' || path.startsWith('/api/favoris/')) {
      return handleFavoris(request, env, path);
    }

    if (path === '/api/images' || path.startsWith('/api/images/')) {
      return handleImages(request, env, path);
    }

    if (path === '/api/collections' || path.startsWith('/api/collections/')) {
      return handleCollections(request, env, path);
    }

    return Response.json({ erreur: 'Route API inconnue.' }, { status: 404 });
  },
};

async function handleSante(env: Env): Promise<Response> {
  let db = false;
  try {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    db = row?.ok === 1;
  } catch {
    db = false;
  }
  return Response.json({ ok: true, db });
}
