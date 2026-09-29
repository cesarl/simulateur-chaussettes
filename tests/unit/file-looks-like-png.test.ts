import { describe, expect, it } from 'vitest';
import { fileLooksLikePng, filePathWithoutQuery, isPngCollection } from '../../src/core/collections';
import type { Collection } from '../../src/core/collections';

describe('fileLooksLikePng / ?v= versioning', () => {
  it('strip query et hash', () => {
    expect(filePathWithoutQuery('/api/collections/p-x/fichiers/VAR1-ab.png?v=171')).toBe(
      '/api/collections/p-x/fichiers/VAR1-ab.png',
    );
    expect(filePathWithoutQuery('svg/FOO.svg#frag')).toBe('svg/FOO.svg');
  });

  it('détecte PNG même avec ?v=', () => {
    expect(fileLooksLikePng('/api/collections/p-x/fichiers/VAR1-ab.png?v=1')).toBe(true);
    expect(fileLooksLikePng('svg/MEDINA-VAR1.svg?v=9')).toBe(false);
    expect(fileLooksLikePng('local.png')).toBe(true);
  });

  it('isPngCollection accepte les URL API versionnées', () => {
    const png: Collection = {
      id: 'p-test',
      nom: 'Test',
      description: '',
      categorie: null,
      format: '20x20',
      actif: true,
      devSeulement: false,
      zonesLibres: false,
      variations: [
        {
          name: 'VAR1',
          motif: 1,
          file: '/api/collections/p-test/fichiers/VAR1-aa.png?v=42',
          zones: [],
        },
      ],
      zones: [],
      couleursParDefaut: {},
      couleursCollection: [],
      recommandations: [],
      calepinages: [],
      calepinageParDefaut: 'g-suite',
      urlCollection: null,
      source: 'partagee',
    };
    expect(isPngCollection(png)).toBe(true);
  });
});
