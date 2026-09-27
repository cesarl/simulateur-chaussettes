/**
 * Éditeur de composition (V6) — stub V7.
 * La composition est remplacée par les calques Image ; on conserve l’API
 * pour ne pas casser le montage, mais le mode composition est désactivé.
 */
import type { RasterImage } from '../core/composition';

export interface CompositionEditorApi {
  sync: () => void;
  setImages: (images: Map<string, RasterImage>) => void;
  destroy: () => void;
}

/** Stub : éditeur masqué (pas de pattern composition en V7). */
export function mountCompositionEditor(host: HTMLElement): CompositionEditorApi {
  const root = document.createElement('div');
  root.className = 'comp-editor';
  root.dataset.testid = 'comp-editor';
  root.hidden = true;
  host.appendChild(root);

  const hide = (): void => {
    root.hidden = true;
    host.style.removeProperty('--comp-split');
    document.getElementById('app')?.classList.remove('composition-mode');
  };

  hide();

  return {
    sync: hide,
    setImages: () => {
      hide();
    },
    destroy: () => {
      root.remove();
    },
  };
}

/** Bascule Carreaux / Composition — Composition désactivée (calques Image à venir). */
export function mountPatternModeToggle(host: HTMLElement): { sync: () => void } {
  const bar = document.createElement('div');
  bar.className = 'pattern-mode';
  bar.dataset.testid = 'pattern-mode';
  const carreaux = document.createElement('button');
  carreaux.type = 'button';
  carreaux.dataset.testid = 'mode-carreaux';
  carreaux.textContent = 'Carreaux';
  carreaux.setAttribute('aria-pressed', 'true');
  carreaux.classList.add('selected');
  const composition = document.createElement('button');
  composition.type = 'button';
  composition.dataset.testid = 'mode-composition';
  composition.textContent = 'Composition';
  composition.disabled = true;
  composition.title = 'Remplacé par les calques Image (V7)';
  composition.setAttribute('aria-pressed', 'false');
  bar.append(carreaux, composition);
  host.prepend(bar);

  function sync(): void {
    carreaux.setAttribute('aria-pressed', 'true');
    composition.setAttribute('aria-pressed', 'false');
    carreaux.classList.add('selected');
    composition.classList.remove('selected');
    document.getElementById('app')?.classList.remove('composition-mode');
  }
  sync();
  return { sync };
}
