/** Constantes et validation des collections partagées (API Worker, T100). */

import { collectionIdFromNom, isSharedCollectionId } from '../../src/core/collectionSlug';
import { sanitizeSvg } from '../../src/core/sanitizeSvg';
import { jsonErreur } from './favorisHelpers';

export { jsonErreur, collectionIdFromNom, isSharedCollectionId, sanitizeSvg };

export const NOM_MAX = 60;
export const DESC_MAX = 500;
export const DONNEES_MAX = 64 * 1024; // 64 Ko
export const FILE_MAX = 1 * 1024 * 1024; // 1 Mo
export const VIGNETTE_MAX = 200 * 1024; // 200 Ko (comme favoris)
export const VARIATIONS_MIN = 1;
export const VARIATIONS_MAX = 16;
export const ZONES_MAX = 8;

export const FORMATS = ['20x20', '15x15', '10x10'] as const;
export type CollectionFormat = (typeof FORMATS)[number];

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ZoneColors = Record<string, string>;

export type Recommendation = {
  nom?: string;
  colors: ZoneColors;
};

export type StoredVariation = {
  name: string; // VAR1…
  motif: number;
  /** Nom de fichier R2 (ex. VAR1-a1b2c3d4.svg), sans chemin. */
  file: string;
  zones: string[];
};

export type CollectionDonnees = {
  zones: string[];
  couleursParDefaut: ZoneColors;
  /** Liste de palettes (objet {nom?, colors}) ou ZoneColors brutes (compat catalogue). */
  recommandations: Array<Recommendation | ZoneColors>;
  calepinages: string[];
  calepinageParDefaut: string | null;
  variations: StoredVariation[];
};

export type CollectionRow = {
  id: string;
  nom: string;
  description: string;
  format: string;
  donnees: string;
  cree_le: number;
  modifie_le: number;
  supprime_le: number | null;
};

export function isFormat(v: unknown): v is CollectionFormat {
  return typeof v === 'string' && (FORMATS as readonly string[]).includes(v);
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isZoneColors(v: unknown): v is ZoneColors {
  if (!isObj(v)) return false;
  for (const [k, val] of Object.entries(v)) {
    if (!/^zone-\d+$/.test(k)) return false;
    if (typeof val !== 'string' || !val.trim()) return false;
  }
  return true;
}

export function normalizeRecommendation(raw: unknown): Recommendation | null {
  if (!isObj(raw)) return null;
  if (isZoneColors(raw) && !('colors' in raw)) {
    return { colors: raw };
  }
  if (!isZoneColors(raw.colors)) return null;
  const nom = typeof raw.nom === 'string' ? raw.nom.trim().slice(0, 60) : undefined;
  return nom ? { nom, colors: raw.colors } : { colors: raw.colors };
}

export function parseDonneesJson(raw: string): CollectionDonnees | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateDonnees(parsed);
}

export function validateDonnees(raw: unknown): CollectionDonnees | null {
  if (!isObj(raw)) return null;
  if (!Array.isArray(raw.zones) || raw.zones.length > ZONES_MAX) return null;
  if (!raw.zones.every((z) => typeof z === 'string' && /^zone-\d+$/.test(z))) return null;
  if (!isZoneColors(raw.couleursParDefaut)) return null;
  if (!Array.isArray(raw.recommandations) || raw.recommandations.length > 3) return null;
  const recommandations: Recommendation[] = [];
  for (const r of raw.recommandations) {
    const n = normalizeRecommendation(r);
    if (!n) return null;
    recommandations.push(n);
  }
  if (!Array.isArray(raw.calepinages) || !raw.calepinages.every((c) => typeof c === 'string')) return null;
  const calepinageParDefaut =
    raw.calepinageParDefaut === null || typeof raw.calepinageParDefaut === 'string'
      ? (raw.calepinageParDefaut as string | null)
      : null;
  if (raw.calepinageParDefaut !== null && typeof raw.calepinageParDefaut !== 'string') return null;
  if (!Array.isArray(raw.variations)) return null;
  if (raw.variations.length < VARIATIONS_MIN || raw.variations.length > VARIATIONS_MAX) return null;

  const variations: StoredVariation[] = [];
  for (let i = 0; i < raw.variations.length; i++) {
    const v = raw.variations[i];
    if (!isObj(v)) return null;
    const name = typeof v.name === 'string' ? v.name.trim() : '';
    if (!/^VAR\d+$/i.test(name)) return null;
    const motif = typeof v.motif === 'number' && Number.isInteger(v.motif) && v.motif >= 1 ? v.motif : i + 1;
    const file = typeof v.file === 'string' ? v.file.trim() : '';
    // À la création le client peut omettre `file` (rempli après upload) : on accepte '' temporairement côté validateCreate.
    if (file && !/^[A-Za-z0-9._-]+\.(svg|png)$/i.test(file)) return null;
    if (!Array.isArray(v.zones) || !v.zones.every((z) => typeof z === 'string' && /^zone-\d+$/.test(z))) return null;
    if (v.zones.length > ZONES_MAX) return null;
    variations.push({ name: name.toUpperCase(), motif, file, zones: v.zones as string[] });
  }

  return {
    zones: raw.zones as string[],
    couleursParDefaut: raw.couleursParDefaut,
    recommandations,
    calepinages: raw.calepinages as string[],
    calepinageParDefaut,
    variations,
  };
}

export function isPng(buf: Uint8Array): boolean {
  if (buf.byteLength < 8) return false;
  return PNG_SIG.every((b, i) => buf[i] === b);
}

export function isSvg(buf: Uint8Array): boolean {
  const head = new TextDecoder().decode(buf.subarray(0, Math.min(buf.byteLength, 256))).trimStart();
  return head.startsWith('<svg') || head.startsWith('<?xml');
}

export type DetectedFile = { mime: 'image/png' | 'image/svg+xml'; ext: 'png' | 'svg'; bytes: Uint8Array };

/** Vérifie signature PNG/SVG ; nettoie les SVG ; refuse le reste. */
export function prepareVariationFile(buf: Uint8Array): DetectedFile | { error: 'too_large' | 'unsupported' } {
  if (buf.byteLength === 0) return { error: 'unsupported' };
  if (buf.byteLength > FILE_MAX) return { error: 'too_large' };
  if (isPng(buf)) return { mime: 'image/png', ext: 'png', bytes: buf };
  if (isSvg(buf)) {
    const text = new TextDecoder().decode(buf);
    const cleaned = sanitizeSvg(text);
    return { mime: 'image/svg+xml', ext: 'svg', bytes: new TextEncoder().encode(cleaned) };
  }
  return { error: 'unsupported' };
}

export async function fileFingerprint(buf: Uint8Array): Promise<string> {
  const copy = new Uint8Array(buf);
  const hash = await crypto.subtle.digest('SHA-256', copy);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < 8; i++) hex += bytes[i]!.toString(16).padStart(2, '0');
  return hex;
}

export function r2Key(collectionId: string, fileName: string): string {
  return `collections/${collectionId}/${fileName}`;
}

export function variationFileName(varName: string, fingerprint: string, ext: 'svg' | 'png'): string {
  return `${varName.toUpperCase()}-${fingerprint}.${ext}`;
}

export function publicFileUrl(collectionId: string, fileName: string, modifieLe: number): string {
  return `/api/collections/${encodeURIComponent(collectionId)}/fichiers/${encodeURIComponent(fileName)}?v=${modifieLe}`;
}

export function publicVignetteUrl(collectionId: string, modifieLe: number): string {
  return `/api/collections/${encodeURIComponent(collectionId)}/vignette?v=${modifieLe}`;
}

export function toUint8(value: ArrayBuffer | Uint8Array | string): Uint8Array | null {
  if (typeof value === 'string') {
    try {
      const bin = atob(value);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

export function blobBind(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Réponse publique prête à construire un objet `Collection` côté client. */
export function publicCollectionPayload(
  row: CollectionRow & { has_vignette?: number },
  originPath = '',
): Record<string, unknown> | null {
  const donnees = parseDonneesJson(row.donnees);
  if (!donnees) return null;
  const v = row.modifie_le;
  const variations = donnees.variations.map((vr) => ({
    name: vr.name,
    motif: vr.motif,
    file: `${originPath}${publicFileUrl(row.id, vr.file, v)}`,
    zones: vr.zones,
  }));
  const recoColors: ZoneColors[] = [];
  const recoNoms: string[] = [];
  for (const r of donnees.recommandations) {
    if ('colors' in r && isZoneColors(r.colors)) {
      recoColors.push(r.colors);
      recoNoms.push(typeof r.nom === 'string' ? r.nom : '');
    } else if (isZoneColors(r)) {
      recoColors.push(r);
      recoNoms.push('');
    }
  }
  return {
    id: row.id,
    nom: row.nom,
    description: row.description,
    categorie: 'Collections partagées',
    format: row.format,
    actif: true,
    devSeulement: false,
    zonesLibres: false,
    variations,
    zones: donnees.zones,
    couleursParDefaut: donnees.couleursParDefaut,
    couleursCollection: [],
    recommandations: recoColors,
    recommandationsNoms: recoNoms,
    calepinages: donnees.calepinages,
    calepinageParDefaut: donnees.calepinageParDefaut,
    urlCollection: null,
    source: 'partagee',
    cree_le: row.cree_le,
    modifie_le: row.modifie_le,
    supprime_le: row.supprime_le,
    has_vignette: row.has_vignette === 1,
    vignette_url: row.has_vignette === 1 ? `${originPath}${publicVignetteUrl(row.id, v)}` : null,
  };
}
