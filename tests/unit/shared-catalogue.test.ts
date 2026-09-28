import { describe, expect, it } from 'vitest';
import type { Catalogue } from '../../src/core/collections';
import {
  collectionFromSharedPayload,
  mergeSharedIntoCatalogue,
  upsertSharedCollection,
} from '../../src/core/sharedCatalogue';
import { resolveVariationUrl, fichierUrl } from '../../src/io/collectionTiles';

const emptyCat = (): Catalogue => ({
  version: 1,
  synchroniseLe: '2026-01-01',
  source: { dossier: 'x', commit: null },
  nuancier: [],
  collections: [
    {
      id: 'medina',
      nom: 'Medina',
      description: '',
      categorie: 'signature',
      format: '20x20',
      actif: true,
      devSeulement: false,
      zonesLibres: false,
      variations: [{ name: 'VAR1', motif: 1, file: 'svg/MEDINA-VAR1.svg', zones: ['zone-1'] }],
      zones: ['zone-1'],
      couleursParDefaut: { 'zone-1': 'OR008' },
      couleursCollection: [],
      recommandations: [],
      calepinages: ['grille'],
      calepinageParDefaut: 'grille',
      urlCollection: null,
      source: 'carreaux',
    },
  ],
});

describe('mergeSharedIntoCatalogue', () => {
  it('ajoute les ids p-, catégorie Collections partagées, URL versionnées', () => {
    const shared = [
      {
        id: 'p-vagues',
        nom: 'Vagues',
        format: '20x20',
        zones: ['zone-1'],
        couleursParDefaut: { 'zone-1': 'RD060' },
        variations: [
          {
            name: 'VAR1',
            motif: 1,
            file: '/api/collections/p-vagues/fichiers/VAR1-abc.svg?v=42',
            zones: ['zone-1'],
          },
        ],
        recommandations: [],
        calepinages: ['damier'],
        calepinageParDefaut: 'damier',
      },
    ];
    const merged = mergeSharedIntoCatalogue(emptyCat(), shared);
    expect(merged.collections).toHaveLength(2);
    const p = merged.collections.find((c) => c.id === 'p-vagues');
    expect(p).toBeDefined();
    expect(p!.source).toBe('partagee');
    expect(p!.categorie).toBe('Collections partagées');
    expect(p!.variations[0]!.file).toContain('/api/collections/p-vagues/fichiers/');
    expect(p!.variations[0]!.file).toContain('?v=42');
    expect(fichierUrl(p!, p!.variations[0]!)).toBe(p!.variations[0]!.file);
    expect(resolveVariationUrl('svg/X.svg')).toBe('./carreaux/svg/X.svg');
    expect(resolveVariationUrl('/api/collections/p-x/fichiers/a.svg?v=1')).toBe(
      '/api/collections/p-x/fichiers/a.svg?v=1',
    );
  });

  it('remplace les anciennes partagées sans toucher au catalogue local', () => {
    const withOld = mergeSharedIntoCatalogue(emptyCat(), [
      {
        id: 'p-old',
        nom: 'Old',
        format: '10x10',
        zones: ['zone-1'],
        couleursParDefaut: { 'zone-1': 'BK001' },
        variations: [{ name: 'VAR1', motif: 1, file: '/api/collections/p-old/fichiers/VAR1-x.svg?v=1', zones: ['zone-1'] }],
      },
    ]);
    const again = mergeSharedIntoCatalogue(withOld, [
      {
        id: 'p-new',
        nom: 'New',
        format: '20x20',
        zones: ['zone-1'],
        couleursParDefaut: { 'zone-1': 'BL016' },
        variations: [{ name: 'VAR1', motif: 1, file: '/api/collections/p-new/fichiers/VAR1-y.svg?v=2', zones: ['zone-1'] }],
      },
    ]);
    expect(again.collections.map((c) => c.id).sort()).toEqual(['medina', 'p-new']);
  });

  it('upsertSharedCollection injecte une collection corbeille', () => {
    const base = emptyCat();
    const col = collectionFromSharedPayload({
      id: 'p-corbeille',
      nom: 'Corbeille',
      format: '15x15',
      zones: ['zone-1'],
      couleursParDefaut: { 'zone-1': 'YL010' },
      variations: [
        {
          name: 'VAR1',
          motif: 1,
          file: '/api/collections/p-corbeille/fichiers/VAR1-z.svg?v=9',
          zones: ['zone-1'],
        },
      ],
      supprime_le: 123,
    });
    const up = upsertSharedCollection(base, col);
    expect(up.collections.some((c) => c.id === 'p-corbeille')).toBe(true);
  });
});
