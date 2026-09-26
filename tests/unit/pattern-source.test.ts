/**
 * T42 — source de motif : anciens projets sans `pattern` ⇒ carreaux.
 */
import { describe, expect, it } from 'vitest';
import { computePatternRgb, normalizePatternSource } from '../../src/core/patternSource';
import { EMPTY_COMPOSITION } from '../../src/core/composition';
import { parseProject, serializeProject } from '../../src/io/project';
import { defaultDesign } from '../../src/state';
import { BUILTIN_PRESETS } from '../../src/core/presets';

describe('source de motif (T42)', () => {
  it('normalise un pattern absent ou inconnu en carreaux', () => {
    expect(normalizePatternSource(undefined)).toEqual({ kind: 'carreaux' });
    expect(normalizePatternSource(null)).toEqual({ kind: 'carreaux' });
    expect(normalizePatternSource({ kind: 'carreaux' })).toEqual({ kind: 'carreaux' });
    expect(
      normalizePatternSource({ kind: 'composition', composition: EMPTY_COMPOSITION }),
    ).toEqual({ kind: 'composition', composition: EMPTY_COMPOSITION });
  });

  it('charge un ancien projet (sans champ pattern) en mode carreaux', async () => {
    const design = defaultDesign();
    design.name = 'Ancien';
    const json = await serializeProject(design, []);
    const doc = JSON.parse(json) as { design: Record<string, unknown> };
    delete doc.design.pattern;
    expect(doc.design.pattern).toBeUndefined();
    const back = await parseProject(JSON.stringify(doc));
    expect(back.design.pattern).toEqual({ kind: 'carreaux' });
  });

  it('computePatternRgb en mode carreaux sans carreaux renvoie null', () => {
    const design = defaultDesign();
    expect(computePatternRgb({ design, tiles: [], calepPresets: BUILTIN_PRESETS })).toBeNull();
  });

  it('computePatternRgb en mode composition renvoie au moins le fond', () => {
    const design = defaultDesign();
    design.pattern = {
      kind: 'composition',
      composition: { background: '#112233', layers: [] },
    };
    const rgb = computePatternRgb({ design, tiles: [], calepPresets: BUILTIN_PRESETS });
    expect(rgb).not.toBeNull();
    expect(rgb![0]).toBe(0x11);
    expect(rgb![1]).toBe(0x22);
    expect(rgb![2]).toBe(0x33);
  });
});
