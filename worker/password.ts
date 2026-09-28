/** Comparaison à temps constant du mot de passe commun (en-tête X-Mot-De-Passe). */

export const PASSWORD_HEADER = 'X-Mot-De-Passe';

/**
 * Compare deux chaînes en temps constant (longueur max des deux).
 * Renvoie false si l'attendu est vide (secret non configuré).
 */
export function passwordsMatch(provided: string | null, expected: string | undefined): boolean {
  if (!expected || expected.length === 0) return false;
  const a = provided ?? '';
  const max = Math.max(a.length, expected.length);
  let diff = a.length === expected.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const ce = i < expected.length ? expected.charCodeAt(i) : 0;
    diff |= ca ^ ce;
  }
  return diff === 0;
}

export function requirePassword(request: Request, expected: string | undefined): Response | null {
  const provided = request.headers.get(PASSWORD_HEADER);
  if (passwordsMatch(provided, expected)) return null;
  return Response.json({ erreur: 'Mot de passe incorrect ou manquant.' }, { status: 401 });
}
