/** Constantes et validation des favoris (API Worker). */

export const NOM_MAX = 80;
export const LIEN_MAX = 20_000;
export const VIGNETTE_MAX = 200 * 1024; // 200 Ko
export const ID_LENGTH = 10;

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function newFavoriId(randomBytes: (n: number) => Uint8Array = defaultRandom): string {
  const bytes = randomBytes(ID_LENGTH);
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length]!;
  }
  return out;
}

function defaultRandom(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/** Normalise le lien stocké : sans « # », doit commencer par p=1. ou p=2. */
export function normalizeLien(raw: string): string | null {
  const lien = raw.replace(/^#/, '').trim();
  if (!lien.startsWith('p=1.') && !lien.startsWith('p=2.')) return null;
  if (lien.length > LIEN_MAX) return null;
  return lien;
}

export function decodeBase64Vignette(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function encodeBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type FavoriRow = {
  id: string;
  nom: string;
  lien: string;
  cree_le: number;
  modifie_le: number;
  supprime_le: number | null;
};

export type FavoriListItem = Omit<FavoriRow, never> & { has_vignette?: boolean };

export function jsonErreur(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status });
}
