/**
 * Nettoyage SVG pour les collections partagées (T100) — PUR, sans DOM.
 * Supprime scripts, foreignObject, gestionnaires d’événements et liens externes.
 * Conserve les groupes `<g id="zone-N">` produits par `autoZoneSvg`.
 */

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SCRIPT_SELF_RE = /<script\b[^>]*\/>/gi;
const FOREIGN_RE = /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi;
const FOREIGN_SELF_RE = /<foreignObject\b[^>]*\/>/gi;
/** Attributs on* (onload, onclick…) — y compris avec espaces autour du =. */
const ON_ATTR_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
/**
 * href / xlink:href dont la valeur n’est pas une ancre locale `#…`.
 * Conservé : href="#zone-1", xlink:href="#clip".
 */
const EXT_HREF_RE =
  /\s(?:xlink:)?href\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*'|(?!#)[^\s>"']+)/gi;

export function sanitizeSvg(svg: string): string {
  let out = svg;
  out = out.replace(SCRIPT_RE, '');
  out = out.replace(SCRIPT_SELF_RE, '');
  out = out.replace(FOREIGN_RE, '');
  out = out.replace(FOREIGN_SELF_RE, '');
  out = out.replace(ON_ATTR_RE, '');
  out = out.replace(EXT_HREF_RE, '');
  return out;
}

/** Indique si le SVG contient encore un danger évident (après ou avant nettoyage). */
export function svgHadDangerousContent(svg: string): boolean {
  if (/<script\b/i.test(svg)) return true;
  if (/<foreignObject\b/i.test(svg)) return true;
  if (/\son[a-z]+\s*=/i.test(svg)) return true;
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) return true;
  return false;
}
