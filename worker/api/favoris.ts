/**
 * API des favoris — logique testable prenant `env` en paramètre.
 * Lecture publique ; écriture avec en-tête X-Mot-De-Passe.
 */
import { decodeShare } from '../../src/io/shareLink';
import type { Env } from '../env';
import { passwordsMatch, PASSWORD_HEADER, requirePassword } from '../password';
import {
  decodeBase64Vignette,
  ID_LENGTH,
  jsonErreur,
  LIEN_MAX,
  newFavoriId,
  NOM_MAX,
  normalizeLien,
  VIGNETTE_MAX,
  type FavoriRow,
} from './favorisHelpers';

type FavoriDb = {
  id: string;
  nom: string;
  lien: string;
  vignette: ArrayBuffer | null;
  cree_le: number;
  modifie_le: number;
  supprime_le: number | null;
};

export async function handleFavoris(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  // parts: ['api', 'favoris'] ou ['api', 'favoris', ':id'] ou ['api', 'favoris', ':id', 'vignette'|'restaurer']

  if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'favoris') {
    if (request.method === 'GET') return listFavoris(env, url);
    if (request.method === 'POST') return createFavori(request, env);
    return jsonErreur('Méthode non autorisée.', 405);
  }

  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'favoris') {
    const id = parts[2]!;
    if (request.method === 'GET') return getFavori(env, id);
    if (request.method === 'PATCH') return patchFavori(request, env, id);
    if (request.method === 'DELETE') return softDeleteFavori(request, env, id);
    return jsonErreur('Méthode non autorisée.', 405);
  }

  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'favoris') {
    const id = parts[2]!;
    const action = parts[3]!;
    if (action === 'vignette' && request.method === 'GET') return getVignette(env, id, url);
    if (action === 'restaurer' && request.method === 'POST') return restoreFavori(request, env, id);
    return jsonErreur('Route API inconnue.', 404);
  }

  return jsonErreur('Route API inconnue.', 404);
}

async function listFavoris(env: Env, url: URL): Promise<Response> {
  const corbeille = url.searchParams.get('corbeille') === '1';
  const sql = corbeille
    ? `SELECT id, nom, lien, cree_le, modifie_le, supprime_le,
              CASE WHEN vignette IS NOT NULL THEN 1 ELSE 0 END AS has_vignette
       FROM favoris WHERE supprime_le IS NOT NULL ORDER BY modifie_le DESC`
    : `SELECT id, nom, lien, cree_le, modifie_le, supprime_le,
              CASE WHEN vignette IS NOT NULL THEN 1 ELSE 0 END AS has_vignette
       FROM favoris WHERE supprime_le IS NULL ORDER BY modifie_le DESC`;
  const { results } = await env.DB.prepare(sql).all<FavoriRow & { has_vignette: number }>();
  const items = results.map((r) => ({
    id: r.id,
    nom: r.nom,
    lien: r.lien,
    cree_le: r.cree_le,
    modifie_le: r.modifie_le,
    supprime_le: r.supprime_le,
    has_vignette: r.has_vignette === 1,
  }));
  return Response.json({ favoris: items });
}

async function getFavori(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, nom, lien, cree_le, modifie_le, supprime_le,
            CASE WHEN vignette IS NOT NULL THEN 1 ELSE 0 END AS has_vignette
     FROM favoris WHERE id = ?`,
  )
    .bind(id)
    .first<FavoriRow & { has_vignette: number }>();
  if (!row) return jsonErreur('Favori introuvable.', 404);
  return Response.json({
    id: row.id,
    nom: row.nom,
    lien: row.lien,
    cree_le: row.cree_le,
    modifie_le: row.modifie_le,
    supprime_le: row.supprime_le,
    has_vignette: row.has_vignette === 1,
  });
}

async function getVignette(env: Env, id: string, url: URL): Promise<Response> {
  const row = await env.DB.prepare(`SELECT vignette, modifie_le, supprime_le FROM favoris WHERE id = ?`)
    .bind(id)
    .first<{ vignette: ArrayBuffer | null; modifie_le: number; supprime_le: number | null }>();
  if (!row || !row.vignette) return jsonErreur('Vignette introuvable.', 404);
  const v = url.searchParams.get('v');
  if (v !== null && v !== String(row.modifie_le)) {
    // On sert quand même : le cache-busting est indicatif.
  }
  return new Response(row.vignette, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

async function createFavori(request: Request, env: Env): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  if (!isObj(body)) return jsonErreur('Corps JSON invalide.', 400);

  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom || nom.length > NOM_MAX) return jsonErreur('Nom invalide (1 à 80 caractères).', 400);

  const lienRaw = typeof body.lien === 'string' ? body.lien : '';
  const lien = normalizeLien(lienRaw);
  if (!lien) return jsonErreur('Lien invalide (doit commencer par p=1. ou p=2.).', 400);
  if (lien.length > LIEN_MAX) return jsonErreur('Lien trop long.', 413);

  const decoded = await decodeShare(lien, () => ({}));
  if (!decoded.ok) return jsonErreur('Lien abîmé ou illisible.', 400);

  let vignette: Uint8Array | null = null;
  if (body.vignette !== undefined && body.vignette !== null) {
    if (typeof body.vignette !== 'string') return jsonErreur('Vignette invalide (base64 attendu).', 400);
    vignette = decodeBase64Vignette(body.vignette);
    if (!vignette) return jsonErreur('Vignette invalide (base64 attendu).', 400);
    if (vignette.byteLength > VIGNETTE_MAX) return jsonErreur('Vignette trop grosse (200 Ko max).', 413);
  }

  const now = Date.now();
  let id = newFavoriId();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await env.DB.prepare(
        `INSERT INTO favoris (id, nom, lien, vignette, cree_le, modifie_le, supprime_le)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
        .bind(id, nom, lien, vignette, now, now)
        .run();
      return Response.json({ id }, { status: 201 });
    } catch {
      id = newFavoriId();
    }
  }
  return jsonErreur('Impossible de créer le favori.', 500);
}

async function patchFavori(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;

  const existing = await env.DB.prepare(`SELECT id FROM favoris WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) return jsonErreur('Favori introuvable.', 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  if (!isObj(body)) return jsonErreur('Corps JSON invalide.', 400);

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.nom !== undefined) {
    if (typeof body.nom !== 'string' || !body.nom.trim() || body.nom.trim().length > NOM_MAX) {
      return jsonErreur('Nom invalide (1 à 80 caractères).', 400);
    }
    sets.push('nom = ?');
    values.push(body.nom.trim());
  }

  if (body.lien !== undefined) {
    if (typeof body.lien !== 'string') return jsonErreur('Lien invalide.', 400);
    const lien = normalizeLien(body.lien);
    if (!lien) return jsonErreur('Lien invalide (doit commencer par p=1. ou p=2.).', 400);
    if (lien.length > LIEN_MAX) return jsonErreur('Lien trop long.', 413);
    const decoded = await decodeShare(lien, () => ({}));
    if (!decoded.ok) return jsonErreur('Lien abîmé ou illisible.', 400);
    sets.push('lien = ?');
    values.push(lien);
  }

  if (body.vignette !== undefined) {
    if (body.vignette === null) {
      sets.push('vignette = NULL');
    } else if (typeof body.vignette === 'string') {
      const vignette = decodeBase64Vignette(body.vignette);
      if (!vignette) return jsonErreur('Vignette invalide (base64 attendu).', 400);
      if (vignette.byteLength > VIGNETTE_MAX) return jsonErreur('Vignette trop grosse (200 Ko max).', 413);
      sets.push('vignette = ?');
      values.push(vignette);
    } else {
      return jsonErreur('Vignette invalide (base64 attendu).', 400);
    }
  }

  if (sets.length === 0) return jsonErreur('Aucune modification.', 400);
  sets.push('modifie_le = ?');
  values.push(Date.now());
  values.push(id);

  await env.DB.prepare(`UPDATE favoris SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return Response.json({ ok: true });
}

async function softDeleteFavori(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;
  const existing = await env.DB.prepare(`SELECT id, supprime_le FROM favoris WHERE id = ?`)
    .bind(id)
    .first<{ id: string; supprime_le: number | null }>();
  if (!existing) return jsonErreur('Favori introuvable.', 404);
  if (existing.supprime_le !== null) return Response.json({ ok: true });
  const now = Date.now();
  await env.DB.prepare(`UPDATE favoris SET supprime_le = ?, modifie_le = ? WHERE id = ?`).bind(now, now, id).run();
  return Response.json({ ok: true });
}

async function restoreFavori(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;
  const existing = await env.DB.prepare(`SELECT id FROM favoris WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) return jsonErreur('Favori introuvable.', 404);
  const now = Date.now();
  await env.DB.prepare(`UPDATE favoris SET supprime_le = NULL, modifie_le = ? WHERE id = ?`).bind(now, id).run();
  return Response.json({ ok: true });
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Exposé pour les tests : vérifie le mot de passe sans effet de bord. */
export function checkPasswordHeader(request: Request, expected: string | undefined): boolean {
  return passwordsMatch(request.headers.get(PASSWORD_HEADER), expected);
}

export type { FavoriDb };
export { ID_LENGTH, NOM_MAX, LIEN_MAX, VIGNETTE_MAX };
