/** Barre projet minimale (T53) — actions complètes branchées ensuite. */

import { getState, redo, subscribe, undo } from '../state';

export function mountProjectBar(
  host: HTMLElement,
  actions: { copyShareLink: () => void | Promise<void>; openLibrary?: () => void },
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

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.dataset.testid = 'project-open';
  openBtn.textContent = 'Ouvrir';
  openBtn.disabled = true;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.dataset.testid = 'project-save';
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

  body.append(title, undoBtn, redoBtn, copy, openBtn, saveBtn, libBtn);
  host.appendChild(body);

  function sync(): void {
    const { design } = getState();
    const motif = design.layers.find((l) => l.kind === 'motif');
    title.textContent = motif?.name ?? 'Sans titre';
  }
  sync();
  subscribe(sync);
  return { sync };
}
