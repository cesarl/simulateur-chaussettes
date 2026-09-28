import { describe, expect, it } from 'vitest';
import { passwordsMatch } from '../../worker/password';

describe('passwordsMatch (temps constant)', () => {
  it('accepte le bon mot de passe', () => {
    expect(passwordsMatch('essai', 'essai')).toBe(true);
  });

  it('refuse un faux ou un manquant', () => {
    expect(passwordsMatch('faux', 'essai')).toBe(false);
    expect(passwordsMatch(null, 'essai')).toBe(false);
    expect(passwordsMatch('essai', '')).toBe(false);
    expect(passwordsMatch('essai', undefined)).toBe(false);
  });

  it('refuse une longueur différente', () => {
    expect(passwordsMatch('essai!', 'essai')).toBe(false);
    expect(passwordsMatch('essa', 'essai')).toBe(false);
  });
});
