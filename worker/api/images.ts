/**
 * API images partagées (R2 + D1) — logique testable avec `env`.
 */
import type { Env } from '../env';
import { requirePassword } from '../password';
import { jsonErreur } from './favorisHelpers';

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageRow = {
  id: string;
  nom: string;
  mime: string;
  largeur: number | null;
  hauteur: number | null;
  octets: number;
  cree_le: number;
  supprime_le: number | null;
};

export async function handleImages(request: Request, env: Env, path: string): Promise<Response> {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  // api / images  |  api / images / :id

  if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'images') {
    if (request.method === 'GET') return listImages(env);
    if (request.method === 'POST') return createImage(request, env);
    return jsonErreur('Méthode non autorisée.', 405);
  }

  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'images') {
    const id = parts[2]!;
    if (request.method === 'GET') return getImageFile(env, id);
    if (request.method === 'PATCH') return patchImage(request, env, id);
    if (request.method === 'DELETE') return deleteImage(request, env, id);
    return jsonErreur('Méthode non autorisée.', 405);
  }

  return jsonErreur('Route API inconnue.', 404);
}

async function listImages(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, nom, mime, largeur, hauteur, octets, cree_le, supprime_le
     FROM images WHERE supprime_le IS NULL ORDER BY cree_le DESC`,
  ).all<ImageRow>();
  return Response.json({ images: results });
}

async function getImageFile(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, mime, supprime_le FROM images WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; mime: string; supprime_le: number | null }>();
  if (!row || row.supprime_le !== null) return jsonErreur('Image introuvable.', 404);
  if (!env.IMAGES) return jsonErreur('Stockage images indisponible.', 503);
  const obj = await env.IMAGES.get(id);
  if (!obj) return jsonErreur('Fichier image introuvable.', 404);
  const body = await obj.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': row.mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

async function createImage(request: Request, env: Env): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;
  if (!env.IMAGES) return jsonErreur('Stockage images indisponible.', 503);

  const nomHeader = request.headers.get('X-Nom')?.trim() || 'image';
  const nom = nomHeader.slice(0, 120);
  const contentType = (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength === 0) return jsonErreur('Fichier vide.', 400);
  if (buf.byteLength > IMAGE_MAX_BYTES) return jsonErreur('Image trop grosse (2 Mo max).', 413);

  const detected = detectImageMime(buf, contentType);
  if (!detected) return jsonErreur('Type non supporté : PNG ou SVG uniquement.', 415);

  const id = await sha256Hex16(buf);
  const existing = await env.DB.prepare(`SELECT id, nom, mime, largeur, hauteur, octets, cree_le, supprime_le FROM images WHERE id = ?`)
    .bind(id)
    .first<ImageRow>();
  if (existing) {
    if (existing.supprime_le !== null) {
      await env.DB.prepare(`UPDATE images SET supprime_le = NULL, nom = ? WHERE id = ?`).bind(nom, id).run();
    }
    return Response.json({
      id: existing.id,
      nom: existing.supprime_le !== null ? nom : existing.nom,
      mime: existing.mime,
      octets: existing.octets,
      doublon: true,
    });
  }

  await env.IMAGES.put(id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
    httpMetadata: { contentType: detected },
  });
  const now = Date.now();
  const dims = detected === 'image/png' ? readPngSize(buf) : { largeur: null, hauteur: null };
  await env.DB.prepare(
    `INSERT INTO images (id, nom, mime, largeur, hauteur, octets, cree_le, supprime_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
  )
    .bind(id, nom, detected, dims.largeur, dims.hauteur, buf.byteLength, now)
    .run();

  return Response.json(
    { id, nom, mime: detected, octets: buf.byteLength, largeur: dims.largeur, hauteur: dims.hauteur, doublon: false },
    { status: 201 },
  );
}

async function patchImage(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;
  const existing = await env.DB.prepare(`SELECT id FROM images WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) return jsonErreur('Image introuvable.', 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErreur('Corps JSON invalide.', 400);
  }
  if (!body || typeof body !== 'object' || typeof (body as { nom?: unknown }).nom !== 'string') {
    return jsonErreur('Nom invalide.', 400);
  }
  const nom = (body as { nom: string }).nom.trim().slice(0, 120);
  if (!nom) return jsonErreur('Nom invalide.', 400);
  await env.DB.prepare(`UPDATE images SET nom = ? WHERE id = ?`).bind(nom, id).run();
  return Response.json({ ok: true });
}

async function deleteImage(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;
  const existing = await env.DB.prepare(`SELECT id FROM images WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) return jsonErreur('Image introuvable.', 404);
  await env.DB.prepare(`UPDATE images SET supprime_le = ? WHERE id = ?`).bind(Date.now(), id).run();
  return Response.json({ ok: true });
}

export function detectImageMime(buf: Uint8Array, contentType: string): 'image/png' | 'image/svg+xml' | null {
  if (isPng(buf)) return 'image/png';
  if (isSvg(buf)) return 'image/svg+xml';
  if (contentType === 'image/png' && isPng(buf)) return 'image/png';
  if ((contentType === 'image/svg+xml' || contentType === 'text/xml') && isSvg(buf)) return 'image/svg+xml';
  return null;
}

function isPng(buf: Uint8Array): boolean {
  if (buf.byteLength < 8) return false;
  return PNG_SIG.every((b, i) => buf[i] === b);
}

function isSvg(buf: Uint8Array): boolean {
  const head = new TextDecoder().decode(buf.subarray(0, Math.min(buf.byteLength, 256))).trimStart();
  return head.startsWith('<svg') || head.startsWith('<?xml');
}

function readPngSize(buf: Uint8Array): { largeur: number | null; hauteur: number | null } {
  // IHDR commence à l'octet 16 : largeur/hauteur big-endian
  if (buf.byteLength < 24) return { largeur: null, hauteur: null };
  const largeur = (buf[16]! << 24) | (buf[17]! << 16) | (buf[18]! << 8) | buf[19]!;
  const hauteur = (buf[20]! << 24) | (buf[21]! << 16) | (buf[22]! << 8) | buf[23]!;
  return { largeur, hauteur };
}

async function sha256Hex16(buf: Uint8Array): Promise<string> {
  const copy = new Uint8Array(buf);
  const hash = await crypto.subtle.digest('SHA-256', copy);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < 8; i++) hex += bytes[i]!.toString(16).padStart(2, '0');
  return hex; // 16 hex chars
}
