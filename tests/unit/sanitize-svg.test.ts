import { describe, expect, it } from 'vitest';
import { sanitizeSvg, svgHadDangerousContent } from '../../src/core/sanitizeSvg';
import { collectionIdFromNom, isSharedCollectionId, slugifyNom } from '../../src/core/collectionSlug';

describe('sanitizeSvg', () => {
  it('retire script, onload et liens externes, conserve zone-N', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg">
  <script>alert(1)</script>
  <g id="zone-1" onload="evil()">
    <rect width="10" height="10" fill="#f00"/>
    <a href="https://evil.example/x"><path d="M0 0"/></a>
    <use xlink:href="https://evil.example/y"/>
    <use href="#zone-1"/>
  </g>
  <foreignObject width="10" height="10"><div>x</div></foreignObject>
</svg>`;
    expect(svgHadDangerousContent(dirty)).toBe(true);
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onload/i);
    expect(clean).not.toMatch(/foreignObject/i);
    expect(clean).not.toMatch(/https:\/\/evil/i);
    expect(clean).toContain('id="zone-1"');
    expect(clean).toContain('href="#zone-1"');
    expect(svgHadDangerousContent(clean)).toBe(false);
  });
});

describe('collectionSlug', () => {
  it('produit p- sans accents', () => {
    expect(slugifyNom('Vagues bleues')).toBe('vagues-bleues');
    expect(collectionIdFromNom('Été')).toBe('p-ete');
    expect(collectionIdFromNom('Vagues', 2)).toBe('p-vagues-2');
    expect(isSharedCollectionId('p-vagues')).toBe(true);
    expect(isSharedCollectionId('medina')).toBe(false);
  });
});
