import { describe, expect, it } from 'vitest';
import { assetKey } from '../../src/core/composition';

describe('assetKey partagee (T85)', () => {
  it('préfixe s:', () => {
    expect(assetKey({ kind: 'partagee', imageId: 'abcdef0123456789' })).toBe('s:abcdef0123456789');
  });
});
