import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS_API_UNAVAILABLE,
  messageForNonJsonBody,
} from '../../src/io/collectionsClient';

describe('collectionsClient erreurs lisibles', () => {
  it('HTML Vite / Cloudflare → message actionnable (plus « illisible »)', () => {
    const msg = messageForNonJsonBody(200, '<!DOCTYPE html><html></html>', 'text/html; charset=utf-8');
    expect(msg).toBe(COLLECTIONS_API_UNAVAILABLE);
    expect(msg.toLowerCase()).not.toContain('illisible');
  });

  it('corps vide en erreur → message avec statut', () => {
    const msg = messageForNonJsonBody(502, '', null);
    expect(msg).toContain('migrate');
  });

  it('404 non-JSON → hint redéploiement Worker', () => {
    const msg = messageForNonJsonBody(404, 'Not Found', 'text/plain');
    expect(msg).toMatch(/Worker|404/i);
    expect(msg.toLowerCase()).not.toContain('illisible');
  });
});
