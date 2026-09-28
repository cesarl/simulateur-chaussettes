/**
 * Barre projet V11 (T91) — un rang 44 px, icônes + un bouton principal ★ Favori.
 * « Enregistrer » retiré ; ouvrir / exporter / aide dans le menu ⋯.
 */

import { canRedo, canUndo, getState, redo, subscribe, undo, update } from '../state';
import { kitButton } from './kit/button';
import { icon } from './kit/icons';
import { moreButton, type MenuEntry } from './kit/menu';
import { openDialog } from './kit/dialog';
import { showToast } from './kit/toast';
import { attachTooltip } from './kit/tooltip';

export interface ProjectBarActions {
  copyShareLink: () => void | Promise<void | boolean>;
  openLibrary?: () => void;
  onFavori?: () => void | Promise<void>;
  onToggleView?: (which: '2d' | '3d') => void;
  getViewVisibility?: () => { view2d: boolean; view3d: boolean };
  saveProject?: () => Promise<void>;
  openProjectFile?: (text: string) => Promise<void>;
  /** Favori ouvert (`?favori=`) → libellé « Mettre à jour ». */
  getFavoriContext?: () => { id: string | null; name: string | null };
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
}

function undoShortcut(): string {
  return isMac() ? '⌘Z' : 'Ctrl+Z';
}

function redoShortcut(): string {
  return isMac() ? '⌘⇧Z' : 'Ctrl+Y';
}

function separator(): HTMLElement {
  const sep = document.createElement('span');
  sep.className = 'project-bar-sep';
  sep.setAttribute('aria-hidden', 'true');
  return sep;
}

function showHelpDialog(): void {
  const list = document.createElement('ul');
  list.className = 'kit-help-list';
  const rows: Array<[string, string]> = [
    ['Annuler', undoShortcut()],
    ['Rétablir', isMac() ? '⌘⇧Z / Ctrl+Y' : 'Ctrl+Y / Ctrl+Maj+Z'],
    ['Vues 3D', 'R F T E D I'],
    ['Mode dev', 'Maj+D'],
    ['Outils dessin', 'dans le panneau Calque · Dessin'],
  ];
  for (const [label, keys] of rows) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = label;
    const kbd = document.createElement('kbd');
    kbd.textContent = keys;
    li.append(name, kbd);
    list.appendChild(li);
  }
  openDialog({
    title: 'Aide / raccourcis',
    body: list,
    testId: 'help-dialog',
    actions: [{ label: 'Fermer', variant: 'primary', testId: 'help-dialog-close' }],
  });
}

export function mountProjectBar(
  host: HTMLElement,
  actions: ProjectBarActions,
): { sync: () => void } {
  host.replaceChildren();
  const body = document.createElement('div');
  body.className = 'project-bar-body';

  /* —— Nom du modèle (éditable) —— */
  const nameWrap = document.createElement('div');
  nameWrap.className = 'project-bar-name';
  nameWrap.dataset.testid = 'project-name-wrap';

  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'project-bar-name__label';
  title.dataset.testid = 'project-name';
  title.textContent = 'modele';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'project-bar-name__input';
  nameInput.dataset.testid = 'project-name-input';
  nameInput.hidden = true;
  nameInput.maxLength = 80;

  const editBtn = kitButton({
    variant: 'icon',
    icon: 'pencil',
    compact: true,
    ariaLabel: 'Renommer le modèle',
    tooltip: 'Renommer',
    testId: 'project-name-edit',
  });

  const startRename = (): void => {
    nameInput.value = getState().design.name || 'modele';
    title.hidden = true;
    editBtn.hidden = true;
    nameInput.hidden = false;
    nameInput.focus();
    nameInput.select();
  };
  const commitRename = (): void => {
    const next = nameInput.value.trim() || 'modele';
    update({ design: { name: next } });
    nameInput.hidden = true;
    title.hidden = false;
    editBtn.hidden = false;
  };
  title.addEventListener('click', startRename);
  editBtn.addEventListener('click', startRename);
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      nameInput.hidden = true;
      title.hidden = false;
      editBtn.hidden = false;
    }
  });
  nameInput.addEventListener('blur', () => {
    if (!nameInput.hidden) commitRename();
  });
  nameWrap.append(title, nameInput, editBtn);

  /* —— Annuler / Rétablir —— */
  const undoBtn = kitButton({
    variant: 'icon',
    icon: 'undo',
    ariaLabel: 'Annuler',
    tooltip: 'Annuler',
    shortcut: undoShortcut(),
    testId: 'project-undo',
    onClick: () => {
      undo();
    },
  });
  const redoBtn = kitButton({
    variant: 'icon',
    icon: 'redo',
    ariaLabel: 'Rétablir',
    tooltip: 'Rétablir',
    shortcut: redoShortcut(),
    testId: 'project-redo',
    onClick: () => {
      redo();
    },
  });
  const historyGroup = document.createElement('div');
  historyGroup.className = 'project-bar-group';
  historyGroup.append(undoBtn, redoBtn);

  /* —— 2D / 3D —— */
  const viewGroup = document.createElement('div');
  viewGroup.className = 'project-bar-segment';
  viewGroup.dataset.testid = 'project-view-toggle';

  const toggle2d = document.createElement('button');
  toggle2d.type = 'button';
  toggle2d.className = 'project-bar-segment__btn';
  toggle2d.dataset.testid = 'ctl-view-2d';
  toggle2d.append(icon('square', { size: 16 }), document.createElement('span'));
  (toggle2d.lastElementChild as HTMLElement).className = 'project-bar-label';
  (toggle2d.lastElementChild as HTMLElement).textContent = '2D';
  toggle2d.setAttribute('aria-label', 'Afficher ou masquer la vue 2D');

  const toggle3d = document.createElement('button');
  toggle3d.type = 'button';
  toggle3d.className = 'project-bar-segment__btn';
  toggle3d.dataset.testid = 'ctl-view-3d';
  toggle3d.append(icon('box', { size: 16 }), document.createElement('span'));
  (toggle3d.lastElementChild as HTMLElement).className = 'project-bar-label';
  (toggle3d.lastElementChild as HTMLElement).textContent = '3D';
  toggle3d.setAttribute('aria-label', 'Afficher ou masquer la vue 3D');

  const syncToggles = (): void => {
    const v = actions.getViewVisibility?.() ?? { view2d: true, view3d: true };
    toggle2d.setAttribute('aria-pressed', v.view2d ? 'true' : 'false');
    toggle3d.setAttribute('aria-pressed', v.view3d ? 'true' : 'false');
    toggle2d.classList.toggle('active', v.view2d);
    toggle3d.classList.toggle('active', v.view3d);
  };
  if (actions.onToggleView) {
    toggle2d.addEventListener('click', () => {
      actions.onToggleView?.('2d');
      syncToggles();
    });
    toggle3d.addEventListener('click', () => {
      actions.onToggleView?.('3d');
      syncToggles();
    });
  } else {
    toggle2d.disabled = true;
    toggle3d.disabled = true;
  }
  viewGroup.append(toggle2d, toggle3d);
  syncToggles();

  /* —— Droite : Bibliothèque, Favoris, lien, ★, ⋯ —— */
  const right = document.createElement('div');
  right.className = 'project-bar-right';

  const libBtn = kitButton({
    variant: 'ghost',
    icon: 'library',
    label: 'Bibliothèque',
    compact: true,
    testId: 'project-library',
    ariaLabel: 'Bibliothèque',
    tooltip: 'Bibliothèque',
    onClick: () => actions.openLibrary?.(),
  });
  if (!actions.openLibrary) libBtn.disabled = true;
  libBtn.querySelector('.kit-btn__label')?.classList.add('project-bar-label');

  const favorisLink = document.createElement('a');
  favorisLink.href = './favoris.html';
  favorisLink.className = 'kit-btn kit-btn--ghost kit-btn--compact project-bar-link';
  favorisLink.dataset.testid = 'project-favoris-link';
  favorisLink.setAttribute('aria-label', 'Galerie des favoris');
  favorisLink.append(icon('gallery', { size: 16 }));
  const favorisLabel = document.createElement('span');
  favorisLabel.className = 'kit-btn__label project-bar-label';
  favorisLabel.textContent = 'Favoris';
  favorisLink.appendChild(favorisLabel);
  attachTooltip(favorisLink, { label: 'Galerie des favoris' });

  const copyBtn = kitButton({
    variant: 'icon',
    icon: 'link',
    ariaLabel: 'Copier le lien',
    tooltip: 'Copier le lien',
    testId: 'project-copy-link',
    onClick: () => {
      void (async () => {
        const ok = await actions.copyShareLink();
        if (ok !== false) showToast({ message: 'Lien copié', testId: 'toast-link-copied' });
      })();
    },
  });

  const favoriBtn = kitButton({
    variant: 'primary',
    icon: 'star',
    label: 'Favori',
    compact: true,
    testId: 'project-favori',
    ariaLabel: 'Enregistrer en favori',
    tooltip: 'Enregistrer en favori',
    onClick: () => {
      void actions.onFavori?.();
    },
  });
  if (!actions.onFavori) favoriBtn.disabled = true;
  favoriBtn.querySelector('.kit-btn__label')?.classList.add('project-bar-label');

  /* Fichier caché pour ouvrir .json */
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileInput.dataset.testid = 'bar-project-file';
  fileInput.addEventListener('change', () => {
    const chosen = fileInput.files?.[0];
    fileInput.value = '';
    if (!chosen || !actions.openProjectFile) return;
    void chosen
      .text()
      .then((text) => actions.openProjectFile?.(text))
      .catch((error: unknown) => {
        showToast({
          message: error instanceof Error ? error.message : 'Ouverture impossible.',
        });
      });
  });

  const menuItems = (): MenuEntry[] => [
    {
      id: 'open',
      label: 'Ouvrir un fichier .json…',
      icon: 'folderOpen',
      onSelect: () => fileInput.click(),
    },
    {
      id: 'export',
      label: 'Exporter le projet (.json)',
      icon: 'download',
      onSelect: () => {
        void actions.saveProject?.().catch((error: unknown) => {
          showToast({
            message: error instanceof Error ? error.message : 'Export impossible.',
          });
        });
      },
    },
    { separator: true },
    {
      id: 'new-motif',
      label: 'Créer un motif',
      icon: 'layers',
      onSelect: () => {
        window.location.href = './motif.html';
      },
    },
    {
      id: 'gallery',
      label: 'Galerie des favoris',
      icon: 'gallery',
      onSelect: () => {
        window.location.href = './favoris.html';
      },
    },
    {
      id: 'help',
      label: 'Aide / raccourcis',
      icon: 'info',
      onSelect: () => showHelpDialog(),
    },
  ];

  const more = moreButton({
    items: menuItems,
    testId: 'project-more',
    menuTestId: 'project-more-menu',
    ariaLabel: 'Plus d’actions',
  });

  right.append(libBtn, favorisLink, copyBtn, favoriBtn, more, fileInput);

  body.append(
    nameWrap,
    separator(),
    historyGroup,
    separator(),
    viewGroup,
    right,
  );
  host.appendChild(body);

  function syncFavoriLabel(): void {
    const ctx = actions.getFavoriContext?.();
    const label = favoriBtn.querySelector('.kit-btn__label');
    if (ctx?.id) {
      favoriBtn.setAttribute('aria-label', 'Mettre à jour le favori');
      if (label) label.textContent = 'Mettre à jour';
      favoriBtn.title = ctx.name ? `Mettre à jour « ${ctx.name} »` : 'Mettre à jour le favori';
    } else {
      favoriBtn.setAttribute('aria-label', 'Enregistrer en favori');
      if (label) label.textContent = 'Favori';
      favoriBtn.removeAttribute('title');
    }
  }

  function sync(): void {
    const { design } = getState();
    title.textContent = design.name || 'modele';
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
    syncToggles();
    syncFavoriLabel();
  }
  sync();
  subscribe(sync);
  return { sync };
}
