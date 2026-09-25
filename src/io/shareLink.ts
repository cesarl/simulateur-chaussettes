/**
 * Lien de partage : tout le projet dans le hash de l'URL — sans serveur, sans fichier JSON.
 *
 *   https://…/#p=1.<données>
 *
 * - On n'encode que ce qui DIFFÈRE des valeurs par défaut (liens courts).
 * - JSON → compression deflate (CompressionStream, natif navigateur et Node 18+) → base64url.
 * - Le hash n'est jamais envoyé au serveur : le partage reste privé entre les personnes qui ont le lien.
 * - Le mode « dev » n'est JAMAIS dans le lien (il vit dans le localStorage de chaque personne).
 * - Carreaux importés à la main : inclus seulement s'ils sont petits (SVG compressés), sinon signalés
 *   comme absents ; les carreaux d'une collection ne sont que référencés (id de collection + couleurs).
 *
 * Module PUR (aucune dépendance au DOM hors CompressionStream / TextEncoder, disponibles partout).
 */

export const SHARE_PARAM = 'p';
export const SHARE_VERSION = 1;
/** Au-delà, certaines messageries tronquent les liens : on prévient l'utilisateur. */
export const SHARE_SOFT_LIMIT = 6000;

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ------------------------------------------------------------------ diff / fusion
const isObj = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Ce qui change par rapport à `base` (les tableaux sont comparés en bloc). `undefined` = identique. */
export function diff(value: Json, base: Json): Json | undefined {
  if (isObj(value) && isObj(base)) {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(value)) {
      const d = diff(value[k]!, base[k] as Json);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return JSON.stringify(value) === JSON.stringify(base) ? undefined : value;
}

/** Réapplique un diff sur les valeurs par défaut (les clés inconnues du défaut sont conservées). */
export function merge(base: Json, patch: Json | undefined): Json {
  if (patch === undefined) return structuredClone(base);
  if (isObj(base) && isObj(patch)) {
    const out: Record<string, Json> = structuredClone(base);
    for (const k of Object.keys(patch)) out[k] = merge(base[k] as Json, patch[k]);
    return out;
  }
  return structuredClone(patch);
}

// ------------------------------------------------------------------ compression
async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------------ API
export interface SharePayload {
  /** État du projet (réglages), tel que sérialisé par l'application (sans images lourdes). */
  design: Json;
  /** Carreaux importés à la main, uniquement s'ils tiennent dans le lien : { nom, svg } */
  tiles?: Array<{ name: string; svg: string }>;
}

export interface EncodeResult {
  hash: string; // « #p=1.… »
  length: number;
  tooLong: boolean;
}

/** Encode l'état en fragment d'URL. `defaults` = état par défaut de la même version de l'application. */
export async function encodeShare(payload: SharePayload, defaults: Json): Promise<EncodeResult> {
  const compact: Record<string, Json> = {};
  const d = diff(payload.design, defaults);
  if (d !== undefined) compact.d = d;
  if (payload.tiles?.length) compact.t = payload.tiles.map((t) => [t.name, t.svg]);
  const json = JSON.stringify(compact);
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  const hash = `#${SHARE_PARAM}=${SHARE_VERSION}.${toBase64Url(packed)}`;
  return { hash, length: hash.length, tooLong: hash.length > SHARE_SOFT_LIMIT };
}

export type DecodeResult =
  | { ok: true; design: Json; tiles: Array<{ name: string; svg: string }> }
  | { ok: false; reason: 'absent' | 'version' | 'illisible' };

/** Lit le fragment (avec ou sans « # »). Ne lève jamais d'exception : un lien abîmé donne `ok: false`. */
export async function decodeShare(hash: string, defaults: Json): Promise<DecodeResult> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get(SHARE_PARAM);
  if (!raw) return { ok: false, reason: 'absent' };
  const dot = raw.indexOf('.');
  const version = Number(raw.slice(0, dot));
  if (dot < 0 || !Number.isInteger(version)) return { ok: false, reason: 'illisible' };
  if (version > SHARE_VERSION) return { ok: false, reason: 'version' };
  try {
    const bytes = await pipe(fromBase64Url(raw.slice(dot + 1)), new DecompressionStream('deflate-raw'));
    const compact = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, Json>;
    const design = merge(defaults, compact.d);
    const tiles = Array.isArray(compact.t)
      ? (compact.t as Json[]).filter(Array.isArray).map((x) => ({ name: String((x as Json[])[0]), svg: String((x as Json[])[1]) }))
      : [];
    return { ok: true, design: stripDev(design), tiles };
  } catch {
    return { ok: false, reason: 'illisible' };
  }
}

/** Sécurité : aucune clé liée au mode dev ne doit survivre au décodage d'un lien. */
function stripDev(v: Json): Json {
  if (Array.isArray(v)) return v.map(stripDev);
  if (isObj(v)) {
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) if (k !== 'dev' && k !== 'devMode') out[k] = stripDev(x);
    return out;
  }
  return v;
}

// ------------------------------------------------------------------ mode dev (navigateur)
export const DEV_STORAGE_KEY = 'simulateur-chaussettes:dev';

/**
 * Mode dev : activé par `?dev` dans l'URL, puis mémorisé (localStorage) jusqu'à ce qu'on le quitte.
 * Retire `?dev` de la barre d'adresse pour qu'il ne se retrouve jamais dans un lien copié.
 * Robuste si le stockage est indisponible (navigation privée) : on reste alors en dev pour la session.
 */
export function resolveDevMode(loc: { search: string; hash: string; pathname: string }, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null, replaceUrl: (url: string) => void): boolean {
  const params = new URLSearchParams(loc.search);
  const asked = params.has('dev');
  let stored = false;
  try {
    stored = storage?.getItem(DEV_STORAGE_KEY) === '1';
    if (asked) storage?.setItem(DEV_STORAGE_KEY, '1');
  } catch {
    /* stockage indisponible */
  }
  if (asked) {
    params.delete('dev');
    const q = params.toString();
    replaceUrl(`${loc.pathname}${q ? `?${q}` : ''}${loc.hash}`);
  }
  return asked || stored;
}

export function leaveDevMode(storage: Pick<Storage, 'removeItem'> | null): void {
  try {
    storage?.removeItem(DEV_STORAGE_KEY);
  } catch {
    /* rien */
  }
}
