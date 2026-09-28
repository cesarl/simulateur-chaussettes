/**
 * Identifiants des collections partagées (`p-…`) — PUR (T100).
 */

/** Minuscules, sans accents, caractères hors [a-z0-9] → tirets, collapsés. */
export function slugifyNom(nom: string): string {
  const base = nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'motif';
}

/** Préfixe obligatoire des collections en ligne. */
export function collectionIdFromNom(nom: string, suffix = 0): string {
  const slug = slugifyNom(nom);
  if (suffix <= 1) return `p-${slug}`;
  return `p-${slug}-${suffix}`;
}

export function isSharedCollectionId(id: string): boolean {
  return /^p-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}
