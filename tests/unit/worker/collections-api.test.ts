/**
 * Tests API collections partagées (D1 + R2) via getPlatformProxy — T100.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD_HEADER } from '../../../worker/password';
import worker from '../../../worker/index';
import type { Env } from '../../../worker/env';
import { FILE_MAX } from '../../../worker/api/collectionsHelpers';

type Platform = {
  env: Env;
  dispose: () => Promise<void>;
};

let platform: Platform;
const ORIGIN = 'http://localhost:4173';

async function call(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), platform.env);
}

function tinySvg(extra = ''): Uint8Array {
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">
  <g id="zone-1"><rect width="20" height="20" fill="#ab4236"/></g>
  ${extra}
</svg>`;
  return new TextEncoder().encode(text);
}

function dirtySvg(): Uint8Array {
  return tinySvg(`<script>alert(1)</script><rect onload="x()" width="1" height="1" fill="#000"/>`);
}

function tinyPng(): Uint8Array {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function baseDonnees(nVars = 3) {
  const variations = Array.from({ length: nVars }, (_, i) => ({
    name: `VAR${i + 1}`,
    motif: i + 1,
    file: '',
    zones: ['zone-1'],
  }));
  return {
    zones: ['zone-1'],
    couleursParDefaut: { 'zone-1': 'RD060' },
    recommandations: [{ nom: 'Mer', colors: { 'zone-1': 'BL016' } }],
    calepinages: ['grille', 'damier'],
    calepinageParDefaut: 'damier',
    variations,
  };
}

function buildForm(
  meta: Record<string, unknown>,
  files: Record<string, Uint8Array>,
  vignette?: Uint8Array,
): FormData {
  const form = new FormData();
  form.set('json', JSON.stringify(meta));
  for (const [name, bytes] of Object.entries(files)) {
    const copy = new Uint8Array(bytes);
    form.set(name, new Blob([copy.buffer], { type: 'image/svg+xml' }), `${name}.svg`);
  }
  if (vignette) {
    const copy = new Uint8Array(vignette);
    form.set('vignette', new Blob([copy.buffer], { type: 'image/webp' }), 'vignette.webp');
  }
  return form;
}

describe('API collections (D1 + R2)', () => {
  beforeAll(async () => {
    const { getPlatformProxy } = await import('wrangler');
    platform = (await getPlatformProxy({
      configPath: './wrangler.jsonc',
      persist: { path: '.wrangler/state' },
    })) as unknown as Platform;
    await platform.env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        format TEXT NOT NULL,
        donnees TEXT NOT NULL,
        vignette BLOB,
        cree_le INTEGER NOT NULL,
        modifie_le INTEGER NOT NULL,
        supprime_le INTEGER
      )`,
    ).run();
    await platform.env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS collections_modifie ON collections(modifie_le DESC)`,
    ).run();
  }, 60_000);

  afterAll(async () => {
    await platform?.dispose();
  });

  beforeEach(async () => {
    await platform.env.DB.prepare('DELETE FROM collections').run();
  });

  it('crée (3 SVG), lit, modifie, supprime, restaure', async () => {
    const meta = {
      nom: 'Vagues',
      description: 'Motif test',
      format: '20x20',
      donnees: baseDonnees(3),
    };
    const form = buildForm(meta, {
      VAR1: tinySvg(),
      VAR2: tinySvg('<circle cx="5" cy="5" r="2" fill="#303446"/>'),
      VAR3: tinySvg(),
    });
    const created = await call('/api/collections', {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: 'essai' },
      body: form,
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: string;
      source: string;
      variations: Array<{ name: string; file: string }>;
      calepinageParDefaut: string;
      couleursParDefaut: Record<string, string>;
    };
    expect(body.id).toBe('p-vagues');
    expect(body.source).toBe('partagee');
    expect(body.variations).toHaveLength(3);
    expect(body.calepinageParDefaut).toBe('damier');
    expect(body.variations[0]!.file).toContain('/api/collections/p-vagues/fichiers/');
    expect(body.variations[0]!.file).toContain('?v=');

    const list = (await (await call('/api/collections')).json()) as { collections: unknown[] };
    expect(list.collections).toHaveLength(1);

    const one = await call(`/api/collections/${body.id}`);
    expect(one.status).toBe(200);

    const filePath = body.variations[0]!.file.startsWith('http')
      ? new URL(body.variations[0]!.file).pathname + new URL(body.variations[0]!.file).search
      : body.variations[0]!.file;
    const fileGet = await call(filePath);
    expect(fileGet.status).toBe(200);
    expect(fileGet.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(fileGet.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(fileGet.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(fileGet.headers.get('Cache-Control')).toContain('immutable');

    // Modifier : remplacer VAR2 + changer couleur
    const patchMeta = {
      nom: 'Vagues',
      description: 'Maj',
      format: '20x20',
      donnees: {
        ...baseDonnees(3),
        couleursParDefaut: { 'zone-1': 'BL016' },
      },
    };
    const patchForm = buildForm(patchMeta, {
      VAR2: tinySvg('<rect width="10" height="10" fill="#fff8eb"/>'),
    });
    const patched = await call(`/api/collections/${body.id}`, {
      method: 'PATCH',
      headers: { [PASSWORD_HEADER]: 'essai' },
      body: patchForm,
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as {
      couleursParDefaut: Record<string, string>;
      variations: Array<{ name: string; file: string }>;
    };
    expect(patchedBody.couleursParDefaut['zone-1']).toBe('BL016');
    // VAR1 inchangé (même nom de fichier), VAR2 changé ; ?v= suit modifie_le
    const var1Old = body.variations[0]!.file.split('?')[0]!;
    const var1New = patchedBody.variations[0]!.file.split('?')[0]!;
    const var2Old = body.variations[1]!.file.split('?')[0]!;
    const var2New = patchedBody.variations[1]!.file.split('?')[0]!;
    expect(var1New).toBe(var1Old);
    expect(var2New).not.toBe(var2Old);

    const del = await call(`/api/collections/${body.id}`, {
      method: 'DELETE',
      headers: { [PASSWORD_HEADER]: 'essai' },
    });
    expect(del.status).toBe(200);
    const empty = (await (await call('/api/collections')).json()) as { collections: unknown[] };
    expect(empty.collections).toHaveLength(0);
    const trash = (await (await call('/api/collections?corbeille=1')).json()) as {
      collections: Array<{ id: string }>;
    };
    expect(trash.collections).toHaveLength(1);

    // Toujours lisible par id (corbeille)
    const still = await call(`/api/collections/${body.id}`);
    expect(still.status).toBe(200);

    const restore = await call(`/api/collections/${body.id}/restaurer`, {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: 'essai' },
    });
    expect(restore.status).toBe(200);
    const back = (await (await call('/api/collections')).json()) as { collections: unknown[] };
    expect(back.collections).toHaveLength(1);
  });

  it('401 sans mot de passe', async () => {
    const form = buildForm(
      { nom: 'X', description: '', format: '20x20', donnees: baseDonnees(1) },
      { VAR1: tinySvg() },
    );
    const res = await call('/api/collections', { method: 'POST', body: form });
    expect(res.status).toBe(401);
  });

  it('413 et 415 pour un fichier refusé', async () => {
    const big = new Uint8Array(FILE_MAX + 1);
    big.set(tinySvg().subarray(0, 8), 0);
    // Forcer signature SVG-like en tête
    const enc = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    big.set(enc, 0);
    const formBig = buildForm(
      { nom: 'Gros', description: '', format: '20x20', donnees: baseDonnees(1) },
      { VAR1: big },
    );
    const res413 = await call('/api/collections', {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: 'essai' },
      body: formBig,
    });
    expect(res413.status).toBe(413);

    const form415 = buildForm(
      { nom: 'Jpeg', description: '', format: '20x20', donnees: baseDonnees(1) },
      { VAR1: new TextEncoder().encode('not-an-image') },
    );
    // Remplacer le blob type
    form415.set(
      'VAR1',
      new Blob([new TextEncoder().encode('not-an-image').buffer], { type: 'image/jpeg' }),
      'x.jpg',
    );
    const res415 = await call('/api/collections', {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: 'essai' },
      body: form415,
    });
    expect(res415.status).toBe(415);
  });

  it('nettoie un SVG avec script ou onload', async () => {
    const form = buildForm(
      { nom: 'Propre', description: '', format: '20x20', donnees: baseDonnees(1) },
      { VAR1: dirtySvg() },
    );
    const created = await call('/api/collections', {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: 'essai' },
      body: form,
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; variations: Array<{ file: string }> };
    const filePath = body.variations[0]!.file;
    const fileGet = await call(filePath);
    const text = await fileGet.text();
    expect(text).not.toMatch(/<script/i);
    expect(text).not.toMatch(/onload/i);
    expect(text).toContain('id="zone-1"');
  });

  it('deux collections du même nom reçoivent deux identifiants', async () => {
    const meta = { nom: 'Vagues', description: '', format: '20x20', donnees: baseDonnees(1) };
    const a = await call('/api/collections', {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: 'essai' },
      body: buildForm(meta, { VAR1: tinySvg() }),
    });
    const b = await call('/api/collections', {
      method: 'POST',
      headers: { [PASSWORD_HEADER]: 'essai' },
      body: buildForm(meta, { VAR1: tinyPng() }),
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const idA = ((await a.json()) as { id: string }).id;
    const idB = ((await b.json()) as { id: string }).id;
    expect(idA).toBe('p-vagues');
    expect(idB).toBe('p-vagues-2');
    expect(idA).not.toBe(idB);
  });
});
