#!/usr/bin/env node
/**
 * Synchronise les données du simulateur de carreaux vers le simulateur de chaussettes.
 *
 *   npm run sync:carreaux                          (source par défaut : ../configurateur-carreaux-cesar-bazaar)
 *   npm run sync:carreaux -- --source "C:\\chemin\\vers\\configurateur-carreaux-cesar-bazaar"
 *   npm run sync:carreaux -- --dry-run             (affiche ce qui serait fait, n'écrit rien)
 *
 * Ce qui est copié (liste fermée, rien d'autre) :
 *   data/collections.json, data/calepinages.json, data/nuancier.json  → lus, normalisés
 *   assets/svg/<COLLECTION>-VAR<n>.svg (uniquement ceux des collections)  → public/carreaux/svg/
 * Ce qui n'est JAMAIS copié : recettes de pigments, config, mockups, images, PSD, outils.
 *
 * Résultat dans public/carreaux/ :
 *   catalogue.json   collections + nuancier normalisés, prêts pour l'application
 *   calepinages.json copie conforme (l'application corrige les petites anomalies à la lecture)
 *   svg/…            SVG des variations
 *   SYNC_REPORT.md   résumé + avertissements (couleurs inconnues, fichiers manquants…)
 *
 * Le script ne modifie jamais le dépôt source. Aucune dépendance : Node 18+.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = args.includes('--dry-run');
const source = path.resolve(
  opt('--source') ?? process.env.CARREAUX_SOURCE ?? path.join(projectRoot, '..', 'configurateur-carreaux-cesar-bazaar'),
);
const outDir = path.resolve(opt('--out') ?? path.join(projectRoot, 'public', 'carreaux'));

const warnings = [];
const warn = (msg) => {
  if (!warnings.includes(msg)) warnings.push(msg);
};

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function readJson(rel) {
  const p = path.join(source, rel);
  if (!fs.existsSync(p)) fail(`Fichier introuvable dans la source : ${rel}\n  Source utilisée : ${source}\n  Précisez-la avec --source "<chemin>" ou la variable CARREAUX_SOURCE.`);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`JSON illisible : ${rel} (${e.message})`);
  }
}

/** Commit courant du dépôt source, sans appeler git. */
function sourceCommit() {
  try {
    const gitDir = path.join(source, '.git');
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head.slice(0, 12);
    const ref = head.slice(5).trim();
    const refFile = path.join(gitDir, ref);
    if (fs.existsSync(refFile)) return fs.readFileSync(refFile, 'utf8').trim().slice(0, 12);
    const packed = path.join(gitDir, 'packed-refs');
    if (fs.existsSync(packed)) {
      const line = fs.readFileSync(packed, 'utf8').split('\n').find((l) => l.endsWith(' ' + ref));
      if (line) return line.slice(0, 12);
    }
  } catch {
    /* pas un dépôt git : sans importance */
  }
  return null;
}

// ---------------------------------------------------------------- couleurs
const normHex = (h) => {
  let s = String(h ?? '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dist = (a, b) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
};

// ---------------------------------------------------------------- lecture des SVG
/** Zones d'un SVG : id, couleur par défaut (data-color-id ou remplissage), nombre de formes. */
function readZones(svg, file, nuancier, byHex) {
  const zones = [];
  const classFill = {};
  for (const m of svg.matchAll(/\.([\w-]+)\s*\{[^}]*?fill\s*:\s*(#[0-9a-fA-F]{3,6})/g)) classFill[m[1]] = normHex(m[2]);
  const re = /<g\b([^>]*)>/g;
  let m;
  while ((m = re.exec(svg))) {
    const attrs = m[1];
    const idm = /\bid="(zone-\d+)"/.exec(attrs);
    if (!idm) continue;
    const zoneId = idm[1];
    // contenu jusqu'au </g> correspondant (gère les <g> imbriqués)
    let depth = 1;
    let i = re.lastIndex;
    const tag = /<\/?g\b[^>]*>/g;
    tag.lastIndex = i;
    let end = svg.length;
    let t;
    while ((t = tag.exec(svg))) {
      if (t[0].startsWith('</')) depth--;
      else if (!t[0].endsWith('/>')) depth++;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    const body = svg.slice(i, end);
    const shapes = (body.match(/<(path|rect|circle|ellipse|polygon|polyline|line)\b/g) ?? []).length;
    let colorId = (/\bdata-color-id="([^"]*)"/.exec(attrs)?.[1] ?? '').trim().toUpperCase() || null;
    let origin = 'data-color-id';
    if (colorId && !nuancier.has(colorId)) {
      warn(`${file} ${zoneId} : couleur ${colorId} absente du nuancier`);
      colorId = null;
    }
    if (!colorId) {
      // ancien format : on déduit la couleur du remplissage (attribut ou classe CSS)
      const fillAttr = /\bfill="([^"]+)"/.exec(body)?.[1];
      const cls = /\bclass="([^"]+)"/.exec(body)?.[1]?.split(/\s+/).find((c) => classFill[c]);
      const hex = normHex(fillAttr) ?? (cls ? classFill[cls] : null);
      if (hex) {
        const exact = byHex.get(hex);
        if (exact) {
          colorId = exact;
          origin = 'remplissage';
        } else {
          let best = null;
          let bd = Infinity;
          for (const [id, c] of nuancier) {
            const d = dist(hex, c.hex);
            if (d < bd) {
              bd = d;
              best = id;
            }
          }
          colorId = best;
          origin = 'remplissage (couleur la plus proche)';
          warn(`${file} ${zoneId} : pas de data-color-id, remplissage ${hex} → couleur la plus proche ${best}`);
        }
      }
    }
    zones.push({ id: zoneId, colorId, origin, shapes });
    re.lastIndex = end;
  }
  return zones;
}

/** « …?collection=x&zone-1=GN007&zone-2=GN020 » → { "zone-1": "GN007", … } (codes ou hexadécimaux). */
function parseRecommendation(url, nuancier, byHex, where) {
  const out = {};
  let query = String(url);
  if ((query.match(/https?:\/\//g) ?? []).length > 1 || /[a-z0-9]www\./i.test(query)) {
    warn(`${where} : URL de recommandation mal formée (deux adresses collées ?) : ${query.slice(0, 90)}…`);
  }
  const q = query.indexOf('?');
  if (q >= 0) query = query.slice(q + 1);
  for (const part of query.split('&')) {
    const [k, v] = part.split('=');
    if (!k || !/^zone-\d+$/.test(k) || !v) continue;
    const val = decodeURIComponent(v).trim().toUpperCase();
    if (nuancier.has(val)) out[k] = val;
    else {
      const hex = normHex(val);
      if (hex && byHex.has(hex)) out[k] = byHex.get(hex);
      else warn(`${where} : recommandation ${k}=${val} inconnue du nuancier (ignorée)`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- traitement
if (!fs.existsSync(source)) fail(`Dossier source introuvable : ${source}`);
console.log(`Source : ${source}`);
console.log(`Destination : ${outDir}${DRY ? '  (essai à blanc : rien ne sera écrit)' : ''}`);

const collectionsRaw = readJson('data/collections.json');
const calepinagesRaw = readJson('data/calepinages.json');
const nuancierRaw = readJson('data/nuancier.json');
if (!Array.isArray(collectionsRaw) || !Array.isArray(nuancierRaw) || !Array.isArray(calepinagesRaw)) fail('Format inattendu : les trois fichiers JSON doivent contenir des tableaux.');

const nuancier = new Map();
const byHex = new Map();
for (const c of nuancierRaw) {
  const id = String(c.Color_ID ?? '').trim().toUpperCase();
  const hex = normHex(c.Hex);
  if (!id || !hex) {
    warn(`Nuancier : entrée ignorée (${JSON.stringify(c).slice(0, 80)})`);
    continue;
  }
  const etat = String(c.Etat ?? '').trim();
  nuancier.set(id, { id, nom: String(c['Nom couleur'] ?? id).trim(), hex, ral: String(c.RAL ?? '').trim(), etat, public: etat === 'Validé' });
  if (!byHex.has(hex)) byHex.set(hex, id);
}

const calepinageIds = new Set(calepinagesRaw.map((p) => String(p.id)));
const svgDir = path.join(source, 'assets', 'svg');
const svgFiles = new Set(fs.existsSync(svgDir) ? fs.readdirSync(svgDir).filter((f) => f.toLowerCase().endsWith('.svg')) : []);
const usedSvgs = new Set();
const toCopy = [];

const collections = [];
for (const c of collectionsRaw) {
  const id = String(c.id ?? '').trim();
  if (!id) {
    warn('Collection sans identifiant ignorée');
    continue;
  }
  const prefix = id.toUpperCase();
  const n = Math.max(1, Number(c.variations) || 1);
  const variations = [];
  const defaultColors = {};
  const zoneIds = new Set();
  for (let i = 1; i <= n; i++) {
    const file = `${prefix}-VAR${i}.svg`;
    if (!svgFiles.has(file)) {
      warn(`${id} : ${file} manquant dans assets/svg`);
      continue;
    }
    usedSvgs.add(file);
    const svg = fs.readFileSync(path.join(svgDir, file), 'utf8');
    const zones = readZones(svg, file, nuancier, byHex);
    if (!zones.length) warn(`${file} : aucune zone « zone-N » (recoloration impossible, le SVG sera utilisé tel quel)`);
    for (const z of zones) {
      zoneIds.add(z.id);
      if (z.colorId && !defaultColors[z.id]) defaultColors[z.id] = z.colorId;
    }
    variations.push({ name: `VAR${i}`, motif: i, file: `svg/${file}`, zones: zones.filter((z) => z.shapes > 0).map((z) => z.id) });
    toCopy.push(file);
  }
  const zones = [...zoneIds].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  const recommendations = (Array.isArray(c.artist_recommendations) ? c.artist_recommendations : [])
    .map((u) => parseRecommendation(u, nuancier, byHex, id))
    .filter((r) => Object.keys(r).length > 0);
  const layouts = (Array.isArray(c.layouts) ? c.layouts : []).map(String);
  for (const l of [...layouts, c.defaut_layout].filter(Boolean)) {
    if (!calepinageIds.has(String(l))) warn(`${id} : calepinage « ${l} » inconnu de calepinages.json`);
  }
  const colors = (Array.isArray(c.colors) ? c.colors : []).map((x) => String(x).toUpperCase());
  for (const col of colors) if (!nuancier.has(col)) warn(`${id} : couleur ${col} absente du nuancier`);
  collections.push({
    id,
    nom: String(c.nom ?? id),
    description: String(c.description ?? ''),
    categorie: c.category ?? null,
    format: String(c.format ?? ''),
    actif: c.active !== false,
    devSeulement: c.dev_only === true,
    zonesLibres: c.no_color_zone_restriction === true,
    variations,
    zones,
    couleursParDefaut: defaultColors,
    couleursCollection: colors,
    recommandations: recommendations,
    calepinages: layouts.filter((l) => calepinageIds.has(l)),
    calepinageParDefaut: calepinageIds.has(String(c.defaut_layout)) ? String(c.defaut_layout) : null,
    urlCollection: c.collection_url ?? null,
  });
}
for (const f of svgFiles) if (!usedSvgs.has(f)) warn(`assets/svg/${f} : n'appartient à aucune collection (non copié)`);

const commit = sourceCommit();
const catalogue = {
  version: 1,
  synchroniseLe: new Date().toISOString(),
  source: { dossier: path.basename(source), commit },
  nuancier: [...nuancier.values()],
  collections,
};

// ---------------------------------------------------------------- écriture
const report = [
  '# Rapport de synchronisation carreaux → chaussettes',
  '',
  `- Date : ${catalogue.synchroniseLe}`,
  `- Source : \`${path.basename(source)}\`${commit ? ` (commit ${commit})` : ''}`,
  `- Collections : ${collections.length} (${collections.filter((c) => c.actif && !c.devSeulement).length} publiques)`,
  `- Variations (SVG copiés) : ${toCopy.length}`,
  `- Couleurs du nuancier : ${nuancier.size} (${[...nuancier.values()].filter((c) => c.public).length} validées)`,
  `- Calepinages : ${calepinagesRaw.length}`,
  `- Recommandations de l'artiste : ${collections.reduce((s, c) => s + c.recommandations.length, 0)}`,
  '',
  `## Avertissements (${warnings.length})`,
  '',
  ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['Aucun.']),
  '',
].join('\n');

if (DRY) {
  console.log(report);
  process.exit(0);
}

const svgOut = path.join(outDir, 'svg');
fs.mkdirSync(svgOut, { recursive: true });
// on ne supprime que nos propres SVG (ceux listés au précédent passage), jamais autre chose
const manifestPath = path.join(outDir, '.sync-manifest.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
const keep = new Set(toCopy);
for (const f of previous) if (!keep.has(f) && fs.existsSync(path.join(svgOut, f))) fs.unlinkSync(path.join(svgOut, f));
for (const f of toCopy) fs.copyFileSync(path.join(svgDir, f), path.join(svgOut, f));
fs.writeFileSync(manifestPath, JSON.stringify(toCopy, null, 0));
fs.writeFileSync(path.join(outDir, 'catalogue.json'), JSON.stringify(catalogue, null, 1));
fs.writeFileSync(path.join(outDir, 'calepinages.json'), JSON.stringify(calepinagesRaw, null, 1));
fs.writeFileSync(path.join(outDir, 'SYNC_REPORT.md'), report);

console.log(`\n✔ ${collections.length} collections, ${toCopy.length} SVG, ${nuancier.size} couleurs, ${calepinagesRaw.length} calepinages.`);
console.log(warnings.length ? `⚠ ${warnings.length} avertissement(s) : voir public/carreaux/SYNC_REPORT.md` : 'Aucun avertissement.');
