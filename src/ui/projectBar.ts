/** Barre projet minimale (T53) — actions complètes branchées ensuite. */

import { getState, redo, subscribe, undo } from '../state';

export function mountProjectBar(
  host: HTMLElement,
  actions: {
    copyShareLink: () => void | Promise<void>;
    openLibrary?: () => void;
    onFavori?: () => void | Promise<void>;
    onToggleView?: (which: '2d' | '3d') => void;
    getViewVisibility?: () => { view2d: boolean; view3d: boolean };
  },
): { sync: () => void } {
  host.replaceChildren();
  const body = document.createElement('div');
  body.className = 'project-bar-body';

  const title = document.createElement('strong');
  title.dataset.testid = 'project-name';
  title.textContent = 'Sans titre';

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.dataset.testid = 'project-undo';
  undoBtn.textContent = 'Annuler';
  undoBtn.addEventListener('click', () => undo());

  const redoBtn = document.createElement('button');
  redoBtn.type = 'button';
  redoBtn.dataset.testid = 'project-redo';
  redoBtn.textContent = 'Rétablir';
  redoBtn.addEventListener('click', () => redo());

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.testid = 'project-copy-link';
  copy.textContent = 'Copier le lien';
  copy.addEventListener('click', () => {
    void actions.copyShareLink();
  });

  const favoriBtn = document.createElement('button');
  favoriBtn.type = 'button';
  favoriBtn.dataset.testid = 'project-favori';
  favoriBtn.textContent = '★ Favori';
  if (actions.onFavori) {
    favoriBtn.addEventListener('click', () => {
      void actions.onFavori?.();
    });
  } else {
    favoriBtn.disabled = true;
  }

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.dataset.testid = 'bar-project-open';
  openBtn.textContent = 'Ouvrir';
  openBtn.disabled = true;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.dataset.testid = 'bar-project-save';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.disabled = true;

  const libBtn = document.createElement('button');
  libBtn.type = 'button';
  libBtn.dataset.testid = 'project-library';
  libBtn.textContent = 'Bibliothèque';
  if (actions.openLibrary) {
    libBtn.addEventListener('click', () => actions.openLibrary?.());
  } else {
    libBtn.disabled = true;
  }

  body.append(title, undoBtn, redoBtn, copy, favoriBtn, openBtn, saveBtn, libBtn);
  host.appendChild(body);

  // T64 — bascules 2D / 3D (mode ?dev seulement ; la barre est déjà hidden hors dev).
  if (actions.onToggleView) {
    const toggle2d = document.createElement('button');
    toggle2d.type = 'button';
    toggle2d.dataset.testid = 'ctl-view-2d';
    toggle2d.textContent = '2D';
    const toggle3d = document.createElement('button');
    toggle3d.type = 'button';
    toggle3d.dataset.testid = 'ctl-view-3d';
    toggle3d.textContent = '3D';
    const syncToggles = (): void => {
      const v = actions.getViewVisibility?.() ?? { view2d: true, view3d: true };
      toggle2d.setAttribute('aria-pressed', v.view2d ? 'true' : 'false');
      toggle3d.setAttribute('aria-pressed', v.view3d ? 'true' : 'false');
      toggle2d.classList.toggle('active', v.view2d);
      toggle3d.classList.toggle('active', v.view3d);
    };
    toggle2d.addEventListener('click', () => {
      actions.onToggleView?.('2d');
      syncToggles();
    });
    toggle3d.addEventListener('click', () => {
      actions.onToggleView?.('3d');
      syncToggles();
    });
    body.append(toggle2d, toggle3d);
    syncToggles();
  }

  function sync(): void {
    const { design } = getState();
    const motif = design.layers.find((l) => l.kind === 'motif');
    title.textContent = motif?.name ?? 'Sans titre';
  }
  sync();
  subscribe(sync);
  return { sync };
}
