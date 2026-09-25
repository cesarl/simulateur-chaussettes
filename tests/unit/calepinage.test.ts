import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  cellAtStitch, DEFAULT_CALEPINAGE, fittingTileWidths, normalizePresets, planPlacements, raccord, tileUV,
  type CalepinageSpec, type Placement, type TileGeometry,
} from '../../src/core/calepinage';

const raw = JSON.parse(fs.readFileSync(new URL('../../config/calepinages.json', import.meta.url), 'utf8'));
const { presets, warnings } = normalizePresets(raw);
const byId = (id: string) => presets.find((p) => p.id === id)!;
const geo: TileGeometry = { needles: 168, tileStitches: 28, tileRows: 37, gapStitches: 0, gapRows: 0, offsetStitches: 0, offsetRows: 0, appareil: 'droit' };
const spec = (o: Partial<CalepinageSpec>): CalepinageSpec => ({ ...DEFAULT_CALEPINAGE, ...o, genere: { ...DEFAULT_CALEPINAGE.genere, ...(o.genere ?? {}) } });

describe('import des préréglages du configurateur', () => {
  it('lit les 75 préréglages', () => {
    expect(presets).toHaveLength(75);
    expect(byId('damier_16').tilesUsed).toBe(16);
    expect(byId('aleatoire').aleatoire).toBe(true);
  });
  it('corrige et signale les anomalies', () => {
    // mêmes règles que getCellSpec() du simulateur de carreaux
    expect(byId('opale').cells[5]!.rot).toBe(0); // 1800 → 0° (non reconnu)
    expect(byId('rosace revert').cells[3]!.rot).toBe(0); // 360 → 0°
    expect(byId('Amour').blockH).toBe(12); // la 13ᵉ rangée hors bloc est ignorée
    expect(warnings.some((w) => w.includes('opale'))).toBe(true);
    expect(warnings.some((w) => w.includes('Amour'))).toBe(true);
  });
});

describe('placements', () => {
  it('suit exactement la matrice d’un préréglage (rosace)', () => {
    const plan = planPlacements(spec({ source: 'prereglage', presetId: 'rosace' }), { tileCount: 1, preset: byId('rosace'), tilesAround: 6 }, 6, 4);
    expect(plan.slice(0, 2).map((p) => p.rot)).toEqual([90, 180]);
    expect(plan.slice(6, 8).map((p) => p.rot)).toEqual([0, 270]);
    expect(plan[2]!.rot).toBe(90); // le bloc se répète
  });
  it('motif manquant → dernier motif disponible (comme le simulateur de carreaux)', () => {
    const plan = planPlacements(spec({ source: 'prereglage' }), { tileCount: 3, preset: byId('damier_4'), tilesAround: 8 }, 8, 1);
    expect(plan.slice(0, 4).map((p) => p.tile)).toEqual([0, 1, 2, 2]);
  });
  it('accepte une liste de motifs dans une case (tirage parmi la liste)', () => {
    const { presets: [p] } = normalizePresets([{ id: 'liste', nom: 'Liste', block_size: [1, 1], matrix: [{ x: 0, y: 0, tile: [2, 3], rot: 0 }] }]);
    const plan = planPlacements(spec({ source: 'prereglage' }), { tileCount: 4, preset: p!, tilesAround: 12 }, 12, 6);
    const used = new Set(plan.map((x) => x.tile));
    expect([...used].sort()).toEqual([1, 2]);
  });
  it('« à la suite » enchaîne les motifs et décale chaque rangée', () => {
    const plan = planPlacements(spec({ genere: { ordre: 'suite', pasRangee: 1, rotation: 'aucune', rotationFixe: 0 } }), { tileCount: 3, tilesAround: 6 }, 6, 2);
    expect(plan.slice(0, 6).map((p) => p.tile)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(plan.slice(6, 12).map((p) => p.tile)).toEqual([1, 2, 0, 1, 2, 0]);
  });
  it('« +90° à chaque carreau » tourne d’un quart à chaque case', () => {
    const plan = planPlacements(spec({ genere: { ordre: 'suite', pasRangee: 1, rotation: 'suite-90', rotationFixe: 0 } }), { tileCount: 2, tilesAround: 8 }, 8, 1);
    expect(plan.slice(0, 5).map((p) => p.rot)).toEqual([0, 90, 180, 270, 0]);
  });
  it('l’aléatoire est reproductible, change avec la graine, et boucle sur le tour', () => {
    const s1 = spec({ genere: { ordre: 'aleatoire', pasRangee: 0, rotation: 'aleatoire-90', rotationFixe: 0 }, graine: 7 });
    const a = planPlacements(s1, { tileCount: 5, tilesAround: 6 }, 6, 10);
    const b = planPlacements(s1, { tileCount: 5, tilesAround: 6 }, 6, 10);
    const c = planPlacements({ ...s1, graine: 8 }, { tileCount: 5, tilesAround: 6 }, 6, 10);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const used = new Set(a.map((p) => p.tile));
    expect(used.size).toBeGreaterThan(3);
    const rots = new Set(a.map((p) => p.rot));
    expect(rots.size).toBe(4);
  });
  it('« sans voisins identiques » n’a jamais deux motifs égaux côte à côte (tour compris)', () => {
    const nx = 6, ny = 30;
    const plan = planPlacements(spec({ genere: { ordre: 'aleatoire-sans-voisin', pasRangee: 0, rotation: 'aucune', rotationFixe: 0 } }), { tileCount: 3, tilesAround: nx }, nx, ny);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const t = plan[y * nx + x]!.tile;
      expect(t).not.toBe(plan[y * nx + ((x + 1) % nx)]!.tile);
      if (y + 1 < ny) expect(t).not.toBe(plan[(y + 1) * nx + x]!.tile);
    }
  });
  it('rosace et miroir générés', () => {
    const r = planPlacements(spec({ genere: { ordre: 'unique', pasRangee: 0, rotation: 'rosace', rotationFixe: 0 } }), { tileCount: 1, tilesAround: 6 }, 6, 2);
    expect([r[0]!.rot, r[1]!.rot, r[6]!.rot, r[7]!.rot]).toEqual([90, 180, 0, 270]);
    // identique au préréglage « Rosace » du configurateur
    const ref = planPlacements(spec({ source: 'prereglage' }), { tileCount: 1, preset: byId('rosace'), tilesAround: 6 }, 6, 2);
    expect(r.map((p) => p.rot)).toEqual(ref.map((p) => p.rot));
    const m = planPlacements(spec({ genere: { ordre: 'unique', pasRangee: 0, rotation: 'miroir', rotationFixe: 0 } }), { tileCount: 1, tilesAround: 6 }, 6, 2);
    expect([m[1]!.flipX, m[6]!.flipY, m[7]!.flipX && m[7]!.flipY]).toEqual([true, true, true]);
  });
  it('la rotation globale s’ajoute', () => {
    const p = planPlacements(spec({ rotationGlobale: 90, genere: { ordre: 'unique', pasRangee: 0, rotation: 'fixe', rotationFixe: 270 } }), { tileCount: 1, tilesAround: 6 }, 6, 1);
    expect(p[0]!.rot).toBe(0);
  });
});

describe('géométrie', () => {
  it('rotation horaire : le coin haut-gauche du motif passe en haut-droite à 90°', () => {
    const p: Placement = { tile: 0, rot: 90, flipX: false, flipY: false };
    const [a, b] = tileUV(p, 0.99, 0.01); // coin haut-droit de la case
    expect(a).toBeLessThan(0.05);
    expect(b).toBeLessThan(0.05);
  });
  it('quinconce : une rangée sur deux décalée d’une demi-case, joints détectés', () => {
    const g = { ...geo, appareil: 'quinconce-h' as const, gapStitches: 2 };
    expect(cellAtStitch(g, 0, 0).cx).toBe(0);
    const h = cellAtStitch(g, 0, 37);
    expect(h.cy).toBe(1);
    expect(h.u).toBeCloseTo(15 / 28, 2);
    expect(cellAtStitch(g, 28.5, 0).gap).toBe(true);
  });
  it('raccord : signale les cas où le motif ne tombe pas juste et propose des largeurs', () => {
    const s = spec({ genere: { ordre: 'suite', pasRangee: 1, rotation: 'aucune', rotationFixe: 0 } });
    expect(raccord(geo, s, 3).seamless).toBe(true); // 6 cases, période 3
    expect(raccord(geo, s, 4).seamless).toBe(false); // 6 cases, période 4
    const w = fittingTileWidths(geo, s, 4, null, 28);
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) expect(raccord({ ...geo, tileStitches: x }, s, 4).seamless).toBe(true);
    const pre = raccord(geo, spec({ source: 'prereglage' }), 8, byId('ramo'));
    expect(pre.seamless).toBe(false); // 6 cases, bloc de 4
  });
});
