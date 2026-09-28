/**
 * Tests de l’API favoris contre le D1 local via `getPlatformProxy` (wrangler).
 * Remplace `@cloudflare/vitest-pool-workers` (peer Vitest 4 uniquement) — voir D70.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encodeShare } from '../../../src/io/shareLink';
import { PASSWORD_HEADER } from '../../../worker/password';
import worker from '../../../worker/index';
import type { Env } from '../../../worker/env';
import { encodeBase64, VIGNETTE_MAX } from '../../../worker/api/favorisHelpers';

type Platform = {
  env: Env;
  dispose: () => Promise<void>;
};

let platform: Platform;
const ORIGIN = 'http://localhost:4173';

async function call(path: string, init?: RequestInit): Promise<Response> {
  const request = new Request(`${ORIGIN}${path}`, init);
  return worker.fetch(request, platform.env);
}

async function validLien(): Promise<string> {
  const { hash } = await encodeShare({ design: { name: 'test-favori' } }, {});
  return hash.replace(/^#/, '');
}

function authHeaders(password = 'essai'): HeadersInit {
  return {
    'Content-Type': 'application/json',
    [PASSWORD_HEADER]: password,
  };
}

describe('API favoris (D1 local)', () => {
  beforeAll(async () => {
    const { getPlatformProxy } = await import('wrangler');
    platform = (await getPlatformProxy({
      configPath: './wrangler.jsonc',
      persist: { path: '.wrangler/state' },
    })) as unknown as Platform;
    // Garantit le schéma même si le persist proxy diffère de `db:migrate:local`.
    await platform.env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS favoris (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        lien TEXT NOT NULL,
        vignette BLOB,
        cree_le INTEGER NOT NULL,
        modifie_le INTEGER NOT NULL,
        supprime_le INTEGER
      )`,
    ).run();
    await platform.env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS favoris_modifie ON favoris(modifie_le DESC)`,
    ).run();
  }, 60_000);

  afterAll(async () => {
    await platform?.dispose();
  });

  beforeEach(async () => {
    await platform.env.DB.prepare('DELETE FROM favoris').run();
  });

  it('crée, liste, renomme, supprime, corbeille, restaure', async () => {
    const lien = await validLien();
    const vignette = encodeBase64(new Uint8Array([0x52, 0x49, 0x46, 0x46])); // RIFF…

    const created = await call('/api/favoris', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ nom: 'Jardin test', lien, vignette }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toMatch(/^[\w-]{10}$/);

    const list = await call('/api/favoris');
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { favoris: Array<{ id: string; nom: string }> };
    expect(listed.favoris).toHaveLength(1);
    expect(listed.favoris[0]!.nom).toBe('Jardin test');

    const renamed = await call(`/api/favoris/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ nom: 'Jardin renommé' }),
    });
    expect(renamed.status).toBe(200);

    const one = await call(`/api/favoris/${id}`);
    const detail = (await one.json()) as { nom: string };
    expect(detail.nom).toBe('Jardin renommé');

    const vignetteRes = await call(`/api/favoris/${id}/vignette?v=1`);
    expect(vignetteRes.status).toBe(200);
    expect(vignetteRes.headers.get('Content-Type')).toBe('image/webp');
    expect(vignetteRes.headers.get('Cache-Control')).toContain('immutable');

    const del = await call(`/api/favoris/${id}`, { method: 'DELETE', headers: authHeaders() });
    expect(del.status).toBe(200);

    const empty = (await (await call('/api/favoris')).json()) as { favoris: unknown[] };
    expect(empty.favoris).toHaveLength(0);

    const trash = (await (await call('/api/favoris?corbeille=1')).json()) as {
      favoris: Array<{ id: string }>;
    };
    expect(trash.favoris).toHaveLength(1);
    expect(trash.favoris[0]!.id).toBe(id);

    const restore = await call(`/api/favoris/${id}/restaurer`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(restore.status).toBe(200);

    const back = (await (await call('/api/favoris')).json()) as { favoris: unknown[] };
    expect(back.favoris).toHaveLength(1);
  });

  it('401 sans mot de passe et avec un faux', async () => {
    const lien = await validLien();
    const noPwd = await call('/api/favoris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: 'x', lien }),
    });
    expect(noPwd.status).toBe(401);

    const bad = await call('/api/favoris', {
      method: 'POST',
      headers: authHeaders('mauvais'),
      body: JSON.stringify({ nom: 'x', lien }),
    });
    expect(bad.status).toBe(401);

    const listed = (await (await call('/api/favoris')).json()) as { favoris: unknown[] };
    expect(listed.favoris).toHaveLength(0);
  });

  it('refuse un lien abîmé', async () => {
    const res = await call('/api/favoris', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ nom: 'x', lien: 'p=2.!!!pas-du-base64!!!' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { erreur: string };
    expect(body.erreur).toMatch(/abîmé|illisible|invalide/i);
  });

  it('refuse une vignette trop grosse (413)', async () => {
    const lien = await validLien();
    const big = encodeBase64(new Uint8Array(VIGNETTE_MAX + 1));
    const res = await call('/api/favoris', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ nom: 'gros', lien, vignette: big }),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { erreur: string };
    expect(body.erreur).toMatch(/trop grosse/i);
  });
});
