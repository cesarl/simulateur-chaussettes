/**
 * Synchronise `bibliotheque-images/` → `public/images/` (+ index.json).
 * Exporté pour les tests unitaires ; appelé par `sync-carreaux.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{ sourceDir: string, outDir: string, warn?: (msg: string) => void }} opts
 * @returns {{ index: Array<{ id: string, nom: string, fichier: string, categorie: string }>, warnings: string[], copied: string[] }}
 */
export function syncBibliothequeImages({ sourceDir, outDir, warn }) {
  const warnings = [];
  const note = (msg) => {
    warnings.push(msg);
    warn?.(msg);
  };

  const indexPath = path.join(sourceDir, 'images.json');
  if (!fs.existsSync(indexPath)) {
    note(`bibliotheque-images/images.json introuvable (${sourceDir})`);
    return { index: [], warnings, copied: [] };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (e) {
    note(`images.json illisible : ${e instanceof Error ? e.message : String(e)}`);
    return { index: [], warnings, copied: [] };
  }

  if (!Array.isArray(raw)) {
    note('images.json doit être un tableau');
    return { index: [], warnings, copied: [] };
  }

  const index = [];
  const copied = [];
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      note('entrée bibliothèque ignorée (objet invalide)');
      continue;
    }
    const id = String(entry.id ?? '').trim();
    const nom = String(entry.nom ?? '').trim();
    const fichier = String(entry.fichier ?? '').trim();
    const categorie = String(entry.categorie ?? '').trim() || 'Divers';
    if (!id || !fichier) {
      note(`entrée bibliothèque ignorée (id/fichier manquant) : ${JSON.stringify(entry)}`);
      continue;
    }
    const from = path.join(sourceDir, fichier);
    if (!fs.existsSync(from)) {
      note(`fichier bibliothèque absent, entrée ignorée : ${fichier} (id ${id})`);
      continue;
    }
    const to = path.join(outDir, path.basename(fichier));
    fs.copyFileSync(from, to);
    copied.push(path.basename(fichier));
    index.push({ id, nom: nom || id, fichier: path.basename(fichier), categorie });
  }

  // Retirer les fichiers orphelins (hors index.json / rapport)
  const keep = new Set(index.map((e) => e.fichier));
  for (const name of fs.readdirSync(outDir)) {
    if (name === 'index.json' || name === 'SYNC_REPORT.md') continue;
    if (!keep.has(name)) {
      try {
        fs.unlinkSync(path.join(outDir, name));
      } catch {
        /* ignore */
      }
    }
  }

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return { index, warnings, copied };
}
