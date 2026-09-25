import { describe, expect, it } from 'vitest';
import { decodeShare, diff, encodeShare, merge, resolveDevMode, DEV_STORAGE_KEY } from '../../reference/share/shareLink';

// état proche de celui de l'application
const defaults = {
  version: 1,
  name: 'Sans titre',
  collection: { id: null, colors: {}, paletteId: 'defaut' },
  layout: { tileStitches: 28, tileRows: 37, gapStitches: 0, gapRows: 0, gapColor: '#ffffff', offsetStitches: 0, offsetRows: 0, seam: 'dos', tilesAround: 6,
    calepinage: { source: 'genere', presetId: null, genere: { ordre: 'suite', pasRangee: 1, rotation: 'aucune', rotationFixe: 0 }, appareil: 'droit', rotationGlobale: 0, graine: 1 } },
  dimensions: { size: 'homme', needles: 168, cuffRows: 30, legRows: 180, heelRows: 56, footRows: 200, toeRows: 50, stitchesPerCm: 7.5, rowsPerCm: 10 },
  zones: { cuffEnabled: true, cuffColor: '#1d1d1b', heelColor: '#b5462f', toeColor: '#b5462f', patternOnFoot: true, footColor: '#f1e9dc', heelHeightMm: 55, heelDepthMm: 72, heelSpread: 1 },
  quantize: { maxColors: 4, paletteMode: 'auto', palette: [] as string[], sampling: 'majoritaire', despeckle: true, maxFloat: 7 },
  decor: { mode: 'aucun', tileCm: 20 },
};

describe('lien de partage', () => {
  it('aller-retour exact, lien court', async () => {
    const design = merge(defaults, {
      name: 'Medina automne',
      collection: { id: 'medina', colors: { 'zone-1': 'BW002', 'zone-2': 'OR012', 'zone-3': 'WT001', 'zone-4': 'BL017' }, paletteId: 'perso' },
      layout: { calepinage: { source: 'prereglage', presetId: 'damier_4_random', graine: 12 }, tilesAround: 4 },
      zones: { heelHeightMm: 45, cuffColor: '#123456' },
      decor: { mode: 'sol', tileCm: 20 },
    });
    const { hash, length, tooLong } = await encodeShare({ design }, defaults);
    expect(hash.startsWith('#p=1.')).toBe(true);
    expect(length).toBeLessThan(600);
    expect(tooLong).toBe(false);
    const back = await decodeShare(hash, defaults);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.design).toEqual(design);
  });
  it('état par défaut → lien minimal', async () => {
    const { length } = await encodeShare({ design: defaults }, defaults);
    expect(length).toBeLessThan(20);
  });
  it('carreaux importés (SVG) inclus et restitués', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c0392b"/></svg>';
    const { hash } = await encodeShare({ design: defaults, tiles: [{ name: 'rouge.svg', svg }] }, defaults);
    const back = await decodeShare(hash, defaults);
    expect(back.ok && back.tiles[0]).toEqual({ name: 'rouge.svg', svg });
  });
  it('un lien abîmé ou d’une version future ne casse rien', async () => {
    expect((await decodeShare('#p=1.%%%abc', defaults)).ok).toBe(false);
    expect(await decodeShare('#p=9.abc', defaults)).toEqual({ ok: false, reason: 'version' });
    expect(await decodeShare('', defaults)).toEqual({ ok: false, reason: 'absent' });
  });
  it('le mode dev ne passe jamais par un lien', async () => {
    const { hash } = await encodeShare({ design: { ...defaults, dev: true } as never }, defaults);
    const back = await decodeShare(hash, defaults);
    expect(back.ok && 'dev' in (back.design as object)).toBe(false);
  });
  it('diff/merge : seules les différences sont gardées', () => {
    expect(diff(defaults, defaults)).toBeUndefined();
    expect(diff({ ...defaults, name: 'X' }, defaults)).toEqual({ name: 'X' });
  });
});

describe('mode dev', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('?dev active, mémorise et retire le paramètre de l’URL', () => {
    const st = mem();
    let url = '';
    expect(resolveDevMode({ search: '?dev', hash: '#p=1.x', pathname: '/' }, st, (u) => (url = u))).toBe(true);
    expect(st.m.get(DEV_STORAGE_KEY)).toBe('1');
    expect(url).toBe('/#p=1.x');
    expect(resolveDevMode({ search: '', hash: '', pathname: '/' }, st, () => {})).toBe(true); // reste en dev
    st.removeItem(DEV_STORAGE_KEY);
    expect(resolveDevMode({ search: '', hash: '', pathname: '/' }, st, () => {})).toBe(false);
  });
  it('stockage indisponible : pas d’erreur', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => {} };
    expect(resolveDevMode({ search: '?dev=1', hash: '', pathname: '/a' }, broken, () => {})).toBe(true);
  });
});
