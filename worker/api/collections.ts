/**
 * API collections partagées (D1 + R2) — T100.
 * Lecture publique ; écriture avec en-tête X-Mot-De-Passe (multipart).
 */
import type { Env } from '../env';
import { requirePassword } from '../password';
import {
  blobBind,
  collectionIdFromNom,
  DESC_MAX,
  DONNEES_MAX,
  FILE_MAX,
  fileFingerprint,
  isFormat,
  isObj,
  jsonErreur,
  NOM_MAX,
  parseDonneesJson,
  prepareVariationFile,
  publicCollectionPayload,
  publicFileUrl,
  r2Key,
  toUint8,
  validateDonnees,
  variationFileName,
  VIGNETTE_MAX,
  type CollectionDonnees,
  type CollectionRow,
  type StoredVariation,
} from './collectionsHelpers';

/** Erreur D1 lisible (table absente après merge V12 sans migrate remote). */
function mapCollectionsDbError(err: unknown): Response {
  const msg = err instanceof Error ? err.message : String(err);
  if (/no such table/i.test(msg) && /collections/i.test(msg)) {
    return jsonErreur(
      'Table « collections » absente : lancer « npm run db:migrate:remote » puis redéployer le Worker.',
      503,
    );
  }
  return jsonErreur('Erreur base de données collections.', 500);
}

async function withCollectionsDb<T extends Response>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    return mapCollectionsDbError(err);
  }
}

export async function handleCollections(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  // api/collections
  // api/collections/:id
  // api/collections/:id/vignette | restaurer
  // api/collections/:id/fichiers/:nom

  if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'collections') {
    if (request.method === 'GET') return withCollectionsDb(() => listCollections(env, url));
    if (request.method === 'POST') return withCollectionsDb(() => createCollection(request, env));
    return jsonErreur('Méthode non autorisée.', 405);
  }

  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'collections') {
    const id = decodeURIComponent(parts[2]!);
    if (request.method === 'GET') return withCollectionsDb(() => getCollection(env, id));
    if (request.method === 'PATCH') return withCollectionsDb(() => patchCollection(request, env, id));
    if (request.method === 'DELETE') return withCollectionsDb(() => softDeleteCollection(request, env, id));
    return jsonErreur('Méthode non autorisée.', 405);
  }

  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'collections') {
    const id = decodeURIComponent(parts[2]!);
    const action = parts[3]!;
    if (action === 'vignette' && request.method === 'GET') return withCollectionsDb(() => getVignette(env, id));
    if (action === 'restaurer' && request.method === 'POST') {
      return withCollectionsDb(() => restoreCollection(request, env, id));
    }
    return jsonErreur('Route API inconnue.', 404);
  }

  if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'collections' && parts[3] === 'fichiers') {
    const id = decodeURIComponent(parts[2]!);
    const nom = decodeURIComponent(parts[4]!);
    if (request.method === 'GET') return withCollectionsDb(() => getFichier(env, id, nom));
    return jsonErreur('Méthode non autorisée.', 405);
  }

  return jsonErreur('Route API inconnue.', 404);
}

async function listCollections(env: Env, url: URL): Promise<Response> {
  const corbeille = url.searchParams.get('corbeille') === '1';
  const sql = corbeille
    ? `SELECT id, nom, description, format, donnees, cree_le, modifie_le, supprime_le,
              CASE WHEN vignette IS NOT NULL THEN 1 ELSE 0 END AS has_vignette
       FROM collections WHERE supprime_le IS NOT NULL ORDER BY modifie_le DESC`
    : `SELECT id, nom, description, format, donnees, cree_le, modifie_le, supprime_le,
              CASE WHEN vignette IS NOT NULL THEN 1 ELSE 0 END AS has_vignette
       FROM collections WHERE supprime_le IS NULL ORDER BY modifie_le DESC`;
  const { results } = await env.DB.prepare(sql).all<CollectionRow & { has_vignette: number }>();
  const collections = results
    .map((r) => publicCollectionPayload(r))
    .filter((c): c is Record<string, unknown> => c !== null);
  return Response.json({ collections });
}

async function getCollection(env: Env, id: string): Promise<Response> {
  // Corbeille encore lisible par id (favoris / liens) — T101.
  const row = await env.DB.prepare(
    `SELECT id, nom, description, format, donnees, cree_le, modifie_le, supprime_le,
            CASE WHEN vignette IS NOT NULL THEN 1 ELSE 0 END AS has_vignette
     FROM collections WHERE id = ?`,
  )
    .bind(id)
    .first<CollectionRow & { has_vignette: number }>();
  if (!row) return jsonErreur('Collection introuvable.', 404);
  const payload = publicCollectionPayload(row);
  if (!payload) return jsonErreur('Données de collection invalides.', 500);
  return Response.json(payload);
}

async function getVignette(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT vignette, modifie_le FROM collections WHERE id = ?`)
    .bind(id)
    .first<{ vignette: ArrayBuffer | Uint8Array | string | null; modifie_le: number }>();
  if (!row || row.vignette == null) return jsonErreur('Vignette introuvable.', 404);
  const bytes = toUint8(row.vignette);
  if (!bytes || bytes.byteLength === 0) return jsonErreur('Vignette introuvable.', 404);
  return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function getFichier(env: Env, id: string, nom: string): Promise<Response> {
  if (!/^[A-Za-z0-9._-]+\.(svg|png)$/i.test(nom)) return jsonErreur('Nom de fichier invalide.', 400);
  const row = await env.DB.prepare(`SELECT id, donnees FROM collections WHERE id = ?`)
    .bind(id)
    .first<{ id: string; donnees: string }>();
  if (!row) return jsonErreur('Collection introuvable.', 404);
  const donnees = parseDonneesJson(row.donnees);
  if (!donnees || !donnees.variations.some((v) => v.file === nom)) {
    return jsonErreur('Fichier introuvable.', 404);
  }
  if (!env.IMAGES) return jsonErreur('Stockage fichiers indisponible.', 503);
  const obj = await env.IMAGES.get(r2Key(id, nom));
  if (!obj) return jsonErreur('Fichier introuvable.', 404);
  const body = await obj.arrayBuffer();
  const mime = /\.png$/i.test(nom) ? 'image/png' : 'image/svg+xml';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

type MetaBody = {
  nom: string;
  description: string;
  format: string;
  donnees: CollectionDonnees;
};

async function parseMultipart(
  request: Request,
): Promise<{ meta: unknown; files: Map<string, Uint8Array>; vignette: Uint8Array | null } | Response> {
  const ct = request.headers.get('Content-Type') ?? '';
  if (!ct.includes('multipart/form-data')) {
    return jsonErreur('multipart/form-data attendu.', 400);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonErreur('Formulaire multipart invalide.', 400);
  }
  const jsonField = form.get('json');
  if (typeof jsonField !== 'string') return jsonErreur('Champ JSON manquant.', 400);
  if (jsonField.length > DONNEES_MAX * 2) return jsonErreur('JSON trop volumineux.', 413);
  let meta: unknown;
  try {
    meta = JSON.parse(jsonField);
  } catch {
    return jsonErreur('JSON invalide.', 400);
  }

  const files = new Map<string, Uint8Array>();
  let vignette: Uint8Array | null = null;
  for (const [key, value] of form.entries()) {
    if (key === 'json') continue;
    if (typeof value === 'string') continue;
    const blob = value as File;
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (key === 'vignette') {
      if (buf.byteLength > VIGNETTE_MAX) return jsonErreur('Vignette trop grosse (200 Ko max).', 413);
      vignette = buf;
      continue;
    }
    // Fichiers de variation : clé = VAR1, VAR2… ou le nom du fichier.
    const varKey = /^VAR\d+$/i.test(key) ? key.toUpperCase() : key;
    if (buf.byteLength > FILE_MAX) return jsonErreur(`Fichier ${key} trop gros (1 Mo max).`, 413);
    files.set(varKey, buf);
  }
  return { meta, files, vignette };
}

function parseMeta(meta: unknown, requireFiles: boolean): MetaBody | string {
  if (!isObj(meta)) return 'Métadonnées invalides.';
  const nom = typeof meta.nom === 'string' ? meta.nom.trim() : '';
  if (!nom || nom.length > NOM_MAX) return `Nom invalide (1 à ${NOM_MAX} caractères).`;
  const description = typeof meta.description === 'string' ? meta.description.trim().slice(0, DESC_MAX) : '';
  if (!isFormat(meta.format)) return 'Format invalide (20x20, 15x15 ou 10x10).';
  const donnees = validateDonnees(meta.donnees);
  if (!donnees) return 'Données de motif invalides.';
  if (requireFiles) {
    for (const v of donnees.variations) {
      if (!v.file && !/^VAR\d+$/i.test(v.name)) return 'Variation sans nom.';
    }
  }
  const encoded = JSON.stringify(donnees);
  if (encoded.length > DONNEES_MAX) return 'Données trop volumineuses (64 Ko max).';
  return { nom, description, format: meta.format, donnees };
}

async function allocateId(env: Env, nom: string): Promise<string | null> {
  for (let suffix = 1; suffix < 1000; suffix++) {
    const id = collectionIdFromNom(nom, suffix);
    const existing = await env.DB.prepare(`SELECT id FROM collections WHERE id = ?`).bind(id).first<{ id: string }>();
    if (!existing) return id;
  }
  return null;
}

async function storeVariationFiles(
  env: Env,
  collectionId: string,
  variations: StoredVariation[],
  files: Map<string, Uint8Array>,
  requireAll: boolean,
): Promise<StoredVariation[] | Response> {
  const out: StoredVariation[] = [];
  for (const v of variations) {
    const uploaded = files.get(v.name) ?? files.get(v.name.toLowerCase());
    if (!uploaded) {
      if (requireAll) return jsonErreur(`Fichier manquant pour ${v.name}.`, 400);
      if (!v.file) return jsonErreur(`Fichier manquant pour ${v.name}.`, 400);
      out.push(v);
      continue;
    }
    const prepared = prepareVariationFile(uploaded);
    if ('error' in prepared) {
      if (prepared.error === 'too_large') return jsonErreur(`Fichier ${v.name} trop gros (1 Mo max).`, 413);
      return jsonErreur(`Type non supporté pour ${v.name} : SVG ou PNG uniquement.`, 415);
    }
    const fp = await fileFingerprint(prepared.bytes);
    const fileName = variationFileName(v.name, fp, prepared.ext);
    if (!env.IMAGES) return jsonErreur('Stockage fichiers indisponible.', 503);
    await env.IMAGES.put(r2Key(collectionId, fileName), blobBind(prepared.bytes), {
      httpMetadata: { contentType: prepared.mime },
    });
    out.push({ ...v, file: fileName });
  }
  return out;
}

async function createCollection(request: Request, env: Env): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;

  const parsed = await parseMultipart(request);
  if (parsed instanceof Response) return parsed;
  const { meta, files, vignette } = parsed;

  const metaResult = parseMeta(meta, true);
  if (typeof metaResult === 'string') return jsonErreur(metaResult, 400);
  const { nom, description, format, donnees } = metaResult;

  const id = await allocateId(env, nom);
  if (!id) return jsonErreur('Impossible d’allouer un identifiant.', 500);

  const stored = await storeVariationFiles(env, id, donnees.variations, files, true);
  if (stored instanceof Response) return stored;

  const finalDonnees: CollectionDonnees = { ...donnees, variations: stored };
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO collections (id, nom, description, format, donnees, vignette, cree_le, modifie_le, supprime_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  )
    .bind(
      id,
      nom,
      description,
      format,
      JSON.stringify(finalDonnees),
      vignette ? blobBind(vignette) : null,
      now,
      now,
    )
    .run();

  const row: CollectionRow & { has_vignette: number } = {
    id,
    nom,
    description,
    format,
    donnees: JSON.stringify(finalDonnees),
    cree_le: now,
    modifie_le: now,
    supprime_le: null,
    has_vignette: vignette ? 1 : 0,
  };
  const payload = publicCollectionPayload(row);
  return Response.json(payload, { status: 201 });
}

async function patchCollection(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;

  const existing = await env.DB.prepare(
    `SELECT id, nom, description, format, donnees, cree_le, modifie_le, supprime_le,
            CASE WHEN vignette IS NOT NULL THEN 1 ELSE 0 END AS has_vignette
     FROM collections WHERE id = ?`,
  )
    .bind(id)
    .first<CollectionRow & { has_vignette: number }>();
  if (!existing) return jsonErreur('Collection introuvable.', 404);

  const parsed = await parseMultipart(request);
  if (parsed instanceof Response) return parsed;
  const { meta, files, vignette } = parsed;

  const metaResult = parseMeta(meta, false);
  if (typeof metaResult === 'string') return jsonErreur(metaResult, 400);
  const { nom, description, format, donnees } = metaResult;

  // Fusionne les fichiers : nouvelles variations / remplacements ; conserve les file existants.
  const prev = parseDonneesJson(existing.donnees);
  const prevByName = new Map((prev?.variations ?? []).map((v) => [v.name, v]));
  const mergedVars: StoredVariation[] = donnees.variations.map((v) => {
    const old = prevByName.get(v.name);
    return { ...v, file: v.file || old?.file || '' };
  });

  const stored = await storeVariationFiles(env, id, mergedVars, files, false);
  if (stored instanceof Response) return stored;
  if (stored.some((v) => !v.file)) return jsonErreur('Chaque variation doit avoir un fichier.', 400);

  const finalDonnees: CollectionDonnees = { ...donnees, variations: stored };
  const now = Date.now();

  if (vignette) {
    await env.DB.prepare(
      `UPDATE collections SET nom = ?, description = ?, format = ?, donnees = ?, vignette = ?, modifie_le = ?
       WHERE id = ?`,
    )
      .bind(nom, description, format, JSON.stringify(finalDonnees), blobBind(vignette), now, id)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE collections SET nom = ?, description = ?, format = ?, donnees = ?, modifie_le = ?
       WHERE id = ?`,
    )
      .bind(nom, description, format, JSON.stringify(finalDonnees), now, id)
      .run();
  }

  const row: CollectionRow & { has_vignette: number } = {
    id,
    nom,
    description,
    format,
    donnees: JSON.stringify(finalDonnees),
    cree_le: existing.cree_le,
    modifie_le: now,
    supprime_le: existing.supprime_le,
    has_vignette: vignette ? 1 : existing.has_vignette,
  };
  const payload = publicCollectionPayload(row);
  return Response.json(payload);
}

async function softDeleteCollection(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;
  const existing = await env.DB.prepare(`SELECT id, supprime_le FROM collections WHERE id = ?`)
    .bind(id)
    .first<{ id: string; supprime_le: number | null }>();
  if (!existing) return jsonErreur('Collection introuvable.', 404);
  if (existing.supprime_le !== null) return Response.json({ ok: true });
  const now = Date.now();
  await env.DB.prepare(`UPDATE collections SET supprime_le = ?, modifie_le = ? WHERE id = ?`)
    .bind(now, now, id)
    .run();
  return Response.json({ ok: true });
}

async function restoreCollection(request: Request, env: Env, id: string): Promise<Response> {
  const denied = requirePassword(request, env.MOT_DE_PASSE);
  if (denied) return denied;
  const existing = await env.DB.prepare(`SELECT id FROM collections WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) return jsonErreur('Collection introuvable.', 404);
  const now = Date.now();
  await env.DB.prepare(`UPDATE collections SET supprime_le = NULL, modifie_le = ? WHERE id = ?`)
    .bind(now, id)
    .run();
  return Response.json({ ok: true });
}

export { publicFileUrl, FILE_MAX };
