import { describe, expect, it } from 'vitest';
import { FAVORIS_VITE_MESSAGE } from '../../src/io/favorisApi';

describe('favorisApi', () => {
  it('expose le message mode vite', () => {
    expect(FAVORIS_VITE_MESSAGE).toContain('npm run dev:api');
  });
});
