/**
 * Catalogue des images de la bibliothèque publique (`public/images/index.json`).
 */
export interface BibliothequeImage {
  id: string;
  nom: string;
  fichier: string;
  categorie: string;
}

let cache: BibliothequeImage[] | null = null;
let inflight: Promise<BibliothequeImage[]> | null = null;

export function bibliothequeImageUrl(fichier: string): string {
  const base = import.meta.env.BASE_URL ?? './';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}images/${fichier}`;
}

export function bibliothequeIndexUrl(): string {
  const base = import.meta.env.BASE_URL ?? './';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}images/index.json`;
}

/** Charge (et met en cache) l’index de la bibliothèque. */
export async function loadBibliothequeImages(): Promise<BibliothequeImage[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(bibliothequeIndexUrl());
      if (!res.ok) return [];
      const raw: unknown = await res.json();
      if (!Array.isArray(raw)) return [];
      const list: BibliothequeImage[] = [];
      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        const id = typeof rec.id === 'string' ? rec.id.trim() : '';
        const fichier = typeof rec.fichier === 'string' ? rec.fichier.trim() : '';
        if (!id || !fichier) continue;
        list.push({
          id,
          nom: typeof rec.nom === 'string' && rec.nom.trim() ? rec.nom.trim() : id,
          fichier,
          categorie: typeof rec.categorie === 'string' && rec.categorie.trim() ? rec.categorie.trim() : 'Divers',
        });
      }
      cache = list;
      return list;
    } catch {
      return [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearBibliothequeCache(): void {
  cache = null;
  inflight = null;
}

export async function resolveBibliothequeFichier(imageId: string): Promise<string | null> {
  const list = await loadBibliothequeImages();
  return list.find((e) => e.id === imageId)?.fichier ?? null;
}
