import type { Env } from './env';

/** Point d'entrée Worker : API `/api/*` ; le reste est servi par les assets. */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/sante' || url.pathname === '/api/sante/') {
      return handleSante(env);
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
