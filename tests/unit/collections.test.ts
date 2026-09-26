import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isPngCollection, paletteOptions, recolorSvg, suggestZoneColors, visibleCollections, yarnColors, zoneHex,
  type Catalogue, type NuancierColor,
} from '../../src/core/collections';

const root = path.resolve(__dirname, '../..');
const fixture = path.join(root, 'tests/fixtures/configurateur-mini');
let out = '';
let cat: Catalogue;
let nuancier: Map<string, NuancierColor>;
let log = '';

beforeAll(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
  log = execFileSync(process.execPath, [path.join(root, 'scripts/sync-carreaux.mjs'), '--source', fixture, '--out', out], { encoding: 'utf8' });
  cat = JSON.parse(fs.readFileSync(path.join(out, 'catalogue.json'), 'utf8'));
  nuancier = new Map(cat.nuancier.map((c) => [c.id, c]));
});

describe('script de synchronisation', () => {
  it('produit le catalogue, les calepinages, les SVG et le rapport', () => {
    expect(log).toContain('4 collections');
    for (const f of ['catalogue.json', 'calepinages.json', 'SYNC_REPORT.md', 'svg/MEDINA-VAR4.svg', 'svg/FLEURKE-VAR1.svg']) {
      expect(fs.existsSync(path.join(out, f))).toBe(true);
    }
  });
  it('ne copie jamais rien d’autre (recettes de pigments, SVG orphelins)', () => {
    const all = fs.readdirSync(out, { recursive: true }).map(String);
    expect(all.some((f) => f.includes('pigment'))).toBe(false);
    expect(all.some((f) => f.includes('ORPHELIN'))).toBe(false);
  });
  it('lit les zones et les couleurs par défaut, y compris les SVG sans data-color-id', () => {
    const medina = cat.collections.find((c) => c.id === 'medina')!;
    expect(medina.variations.map((v) => v.motif)).toEqual([1, 2, 3, 4]);
    expect(medina.couleursParDefaut).toEqual({ 'zone-1': 'BW002', 'zone-2': 'OR008', 'zone-3': 'WT001', 'zone-4': 'BL017' });
    const fleurke = cat.collections.find((c) => c.id === 'FLEURKE')!;
    expect(Object.keys(fleurke.couleursParDefaut)).toHaveLength(fleurke.zones.length); // déduit des classes CSS
  });
  it('lit les recommandations de l’artiste et signale les problèmes', () => {
    const lianes = cat.collections.find((c) => c.id === 'lianes')!;
    expect(lianes.recommandations.length).toBeGreaterThan(3);
    expect(lianes.recommandations[0]).toEqual({ 'zone-1': 'GN007', 'zone-2': 'GN020', 'zone-3': 'GN002' });
    expect(lianes.calepinages.every((l) => ['Liane_1', 'Liane_2', 'Liane_3'].includes(l))).toBe(true);
    const report = fs.readFileSync(path.join(out, 'SYNC_REPORT.md'), 'utf8');
    expect(report).toContain('FANTOME-VAR1.svg / FANTOME-VAR1.png manquant');
    expect(report).toContain('mal formée');
    expect(report).toContain('ZZ999');
    expect(report).toContain('ORPHELIN-VAR1.svg');
    expect(cat.collections.every((c) => c.source === 'carreaux')).toBe(true);  });
  it('est rejouable : une seconde synchronisation donne le même résultat', () => {
    execFileSync(process.execPath, [path.join(root, 'scripts/sync-carreaux.mjs'), '--source', fixture, '--out', out]);
    const again = JSON.parse(fs.readFileSync(path.join(out, 'catalogue.json'), 'utf8')) as Catalogue;
    expect({ ...again, synchroniseLe: '' }).toEqual({ ...cat, synchroniseLe: '' });
  });
});

describe('collections dans le simulateur', () => {
  it('masque les collections sans SVG', () => {
    expect(visibleCollections(cat).map((c) => c.id)).not.toContain('fantome');
  });
  it('propose les palettes : origine puis suggestions de l’artiste (validées seulement par défaut)', () => {
    const lianes = cat.collections.find((c) => c.id === 'lianes')!;
    const all = paletteOptions(lianes, nuancier, true);
    const pub = paletteOptions(lianes, nuancier);
    expect(all[0]!.id).toBe('defaut');
    expect(all.length).toBe(1 + lianes.recommandations.length);
    expect(pub.length).toBeLessThanOrEqual(all.length);
    expect(pub.slice(1).every((p) => p.public)).toBe(true);
  });
  it('recolore chaque zone d’un vrai SVG sans toucher au reste', () => {
    const svg = fs.readFileSync(path.join(fixture, 'assets/svg/MEDINA-VAR2.svg'), 'utf8');
    const out2 = recolorSvg(svg, { 'zone-2': '#112233', 'zone-9': '#ffffff', bad: '#000000' });
    expect(out2).toContain('#zone-2,#zone-2 *{fill:#112233 !important}');
    expect(out2).not.toContain('#bad');
    expect(out2.endsWith('</svg>\n') || out2.trimEnd().endsWith('</svg>')).toBe(true);
    expect(out2.replace(/<style data-chaussettes[^<]*<\/style>/, '')).toBe(svg);
  });
  it('donne les couleurs de fil distinctes et des couleurs de zones assorties', () => {
    const medina = cat.collections.find((c) => c.id === 'medina')!;
    const yarns = yarnColors(medina, medina.couleursParDefaut, nuancier);
    expect(yarns.map((y) => y.id)).toEqual(['BW002', 'OR008', 'WT001', 'BL017']);
    expect(Object.keys(zoneHex(medina.couleursParDefaut, nuancier))).toHaveLength(4);
    const s = suggestZoneColors(yarns);
    expect(yarns.map((y) => y.hex)).toContain(s.cuff);
    expect(yarns.map((y) => y.hex)).toContain(s.heel);
  });
});

describe('collections locales (T43)', () => {
  const localFixture = path.join(root, 'tests/fixtures/collections-locales-mini');
  let localOut = '';
  let localCat: Catalogue;

  beforeAll(() => {
    localOut = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-local-'));
    execFileSync(
      process.execPath,
      [
        path.join(root, 'scripts/sync-carreaux.mjs'),
        '--source',
        fixture,
        '--local',
        localFixture,
        '--out',
        localOut,
      ],
      { encoding: 'utf8' },
    );
    localCat = JSON.parse(fs.readFileSync(path.join(localOut, 'catalogue.json'), 'utf8'));
  });

  it('fusionne SVG et PNG locaux avec source locale et catégorie Mes collections', () => {
    const svg = localCat.collections.find((c) => c.id === 'LOCALSVG')!;
    const png = localCat.collections.find((c) => c.id === 'LOCALPNG')!;
    expect(svg.source).toBe('locale');
    expect(png.source).toBe('locale');
    expect(svg.categorie).toBe('mes-collections');
    expect(png.categorie).toBe('mes-collections');
    expect(svg.variations[0]?.file).toBe('svg/LOCALSVG-VAR1.svg');
    expect(png.variations[0]?.file).toBe('svg/LOCALPNG-VAR1.png');
    expect(png.variations[0]?.zones).toEqual([]);
    expect(isPngCollection(png)).toBe(true);
    expect(isPngCollection(svg)).toBe(false);
    expect(fs.existsSync(path.join(localOut, 'svg/LOCALSVG-VAR1.svg'))).toBe(true);
    expect(fs.existsSync(path.join(localOut, 'svg/LOCALPNG-VAR1.png'))).toBe(true);
    expect(visibleCollections(localCat).some((c) => c.id === 'LOCALSVG')).toBe(true);
  });

  it('sync:local (--local-only) met à jour seulement les locales', () => {
    const again = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-lo-'));
    // catalogue de départ = sync carreaux seul
    execFileSync(process.execPath, [
      path.join(root, 'scripts/sync-carreaux.mjs'),
      '--source',
      fixture,
      '--local',
      path.join(root, 'collections-locales'),
      '--out',
      again,
    ]);
    const before = JSON.parse(fs.readFileSync(path.join(again, 'catalogue.json'), 'utf8')) as Catalogue;
    const carreauxIds = before.collections.filter((c) => c.source !== 'locale').map((c) => c.id);
    execFileSync(process.execPath, [
      path.join(root, 'scripts/sync-carreaux.mjs'),
      '--local-only',
      '--local',
      localFixture,
      '--out',
      again,
    ]);
    const after = JSON.parse(fs.readFileSync(path.join(again, 'catalogue.json'), 'utf8')) as Catalogue;
    for (const id of carreauxIds) {
      expect(after.collections.some((c) => c.id === id && c.source !== 'locale')).toBe(true);
    }
    expect(after.collections.some((c) => c.id === 'LOCALPNG' && c.source === 'locale')).toBe(true);
  });
});
