/**
 * Tests API images (R2 local + D1) via getPlatformProxy.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD_HEADER } from '../../../worker/password';
import worker from '../../../worker/index';
import type { Env } from '../../../worker/env';
import { IMAGE_MAX_BYTES } from '../../../worker/api/images';

type Platform = {
  env: Env;
  dispose: () => Promise<void>;
};

let platform: Platform;
const ORIGIN = 'http://localhost:4173';

async function call(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), platform.env);
}

/** PNG 1×1 rouge minimal. */
function tinyPng(): ArrayBuffer {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function tinySvg(): ArrayBuffer {
  return new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>').buffer;
}

describe('API images (R2 + D1)', () => {
  beforeAll(async () => {
    const { getPlatformProxy } = await import('wrangler');
    platform = (await getPlatformProxy({
      configPath: './wrangler.jsonc',
      persist: { path: '.wrangler/state' },
    })) as unknown as Platform;
    await platform.env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL,
        mime TEXT NOT NULL,
        largeur INTEGER, hauteur INTEGER, octets INTEGER NOT NULL,
        cree_le INTEGER NOT NULL, supprime_le INTEGER
      )`,
    ).run();
  }, 60_000);

  afterAll(async () => {
    await platform?.dispose();
  });

  beforeEach(async () => {
    await platform.env.DB.prepare('DELETE FROM images').run();
  });

  it('envoie PNG et SVG', async () => {
    const png = await call('/api/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-Nom': 'point.png',
        [PASSWORD_HEADER]: 'essai',
      },
      body: tinyPng(),
    });
    expect(png.status).toBe(201);
    const pngBody = (await png.json()) as { id: string; mime: string };
    expect(pngBody.mime).toBe('image/png');
    expect(pngBody.id).toMatch(/^[a-f0-9]{16}$/);

    const get = await call(`/api/images/${pngBody.id}`);
    expect(get.status).toBe(200);
    expect(get.headers.get('Content-Type')).toBe('image/png');
    expect(get.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(get.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(get.headers.get('Cache-Control')).toContain('immutable');

    const svg = await call('/api/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/svg+xml',
        'X-Nom': 'carre.svg',
        [PASSWORD_HEADER]: 'essai',
      },
      body: tinySvg(),
    });
    expect(svg.status).toBe(201);
    const svgBody = (await svg.json()) as { mime: string };
    expect(svgBody.mime).toBe('image/svg+xml');
  });

  it('fusionne les doublons', async () => {
    const body = tinyPng();
    const a = await call('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Nom': 'a', [PASSWORD_HEADER]: 'essai' },
      body,
    });
    const b = await call('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Nom': 'b', [PASSWORD_HEADER]: 'essai' },
      body,
    });
    const idA = ((await a.json()) as { id: string }).id;
    const bodyB = (await b.json()) as { id: string; doublon: boolean };
    expect(bodyB.id).toBe(idA);
    expect(bodyB.doublon).toBe(true);
    const list = (await (await call('/api/images')).json()) as { images: unknown[] };
    expect(list.images).toHaveLength(1);
  });

  it('413 au-delà de 2 Mo', async () => {
    const big = new Uint8Array(IMAGE_MAX_BYTES + 1);
    big.set(new Uint8Array(tinyPng()).subarray(0, 8), 0);
    const res = await call('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Nom': 'gros', [PASSWORD_HEADER]: 'essai' },
      body: big.buffer,
    });
    expect(res.status).toBe(413);
  });

  it('415 pour JPEG ou faux PNG', async () => {
    const jpeg = new TextEncoder().encode('not-a-png').buffer;
    const res = await call('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Nom': 'x.jpg', [PASSWORD_HEADER]: 'essai' },
      body: jpeg,
    });
    expect(res.status).toBe(415);

    const fake = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    const res2 = await call('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Nom': 'fake', [PASSWORD_HEADER]: 'essai' },
      body: fake,
    });
    expect(res2.status).toBe(415);
  });

  it('401 sans mot de passe', async () => {
    const res = await call('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Nom': 'x' },
      body: tinyPng(),
    });
    expect(res.status).toBe(401);
  });
});
