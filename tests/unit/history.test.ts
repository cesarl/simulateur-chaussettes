import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  canRedo,
  canUndo,
  defaultDesign,
  getState,
  isSectionDirty,
  redo,
  resetAllDesign,
  resetSection,
  resetState,
  undo,
  update,
} from '../../src/state';

describe('réinitialiser / annuler / rétablir', () => {
  beforeEach(() => {
    resetState();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('réinitialiser une section ne touche pas les autres', () => {
    update({ design: { layout: { tileStitches: 40 }, zones: { heelHeightMm: 90 } } });
    expect(isSectionDirty('layout')).toBe(true);
    expect(isSectionDirty('zones')).toBe(true);
    resetSection('layout');
    expect(getState().design.layout.tileStitches).toBe(defaultDesign().layout.tileStitches);
    expect(getState().design.zones.heelHeightMm).toBe(90);
    expect(isSectionDirty('layout')).toBe(false);
    expect(isSectionDirty('zones')).toBe(true);
  });

  it('annuler et rétablir restaurent l’état', () => {
    update({ design: { quantize: { maxColors: 3 } } });
    expect(getState().design.quantize.maxColors).toBe(3);
    expect(canUndo()).toBe(true);
    undo();
    expect(getState().design.quantize.maxColors).toBe(4);
    expect(canRedo()).toBe(true);
    redo();
    expect(getState().design.quantize.maxColors).toBe(3);
  });

  it('un glissement de curseur (coalesce) compte pour un seul pas', () => {
    update({ design: { zones: { heelHeightMm: 40 } }, }, { coalesce: true });
    update({ design: { zones: { heelHeightMm: 55 } }, }, { coalesce: true });
    update({ design: { zones: { heelHeightMm: 95 } }, }, { coalesce: true });
    expect(getState().design.zones.heelHeightMm).toBe(95);
    undo();
    expect(getState().design.zones.heelHeightMm).toBe(55); // défaut avant le geste
    expect(canUndo()).toBe(false);
  });

  it('tout réinitialiser garde les carreaux', () => {
    update({
      tiles: [
        {
          id: 'a',
          name: 'a',
          source: 'png',
          width: 1,
          height: 1,
          rgba: new Uint8ClampedArray([0, 0, 0, 255]),
        },
      ],
      design: { zones: { heelHeightMm: 99 }, layout: { tileStitches: 50 } },
    });
    expect(getState().tiles).toHaveLength(1);
    resetAllDesign();
    expect(getState().tiles).toHaveLength(1);
    expect(getState().design.layout.tileIds).toEqual(['a']);
    expect(getState().design.zones.heelHeightMm).toBe(55);
    expect(getState().design.layout.tileStitches).toBe(defaultDesign().layout.tileStitches);
  });
});
