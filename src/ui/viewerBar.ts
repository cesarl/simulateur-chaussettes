import type { DecorMode } from '../core/types';
import { tileCmFromFormat } from '../render/decorController';
import type { ViewName } from '../render/sock3d/studio';
import { editingCollection, getState, subscribe, update } from '../state';

const VIEWER_VIEWS: Array<{ id: ViewName; label: string; testId: string }> = [
  { id: 'trois-quarts', label: '¾', testId: 'viewer-view-trois-quarts' },
  { id: 'profil-exterieur', label: 'Profil', testId: 'viewer-view-profil' },
  { id: 'dos', label: 'Dos', testId: 'viewer-view-dos' },
  { id: 'face', label: 'Face', testId: 'viewer-view-face' },
];

/** Dernier mode non-« aucun » pour rétablir au cochetage (session). */
let lastActiveDecorMode: DecorMode = 'coin';

export interface ViewerBarHandle {
  setVisible: (visible: boolean) => void;
  root: HTMLElement;
}

export function mountViewerBar(
  viewport: HTMLElement,
  options: {
    onView: (view: ViewName) => void;
    onCopyLink: () => void | Promise<void | boolean>;
    onFlat?: (flat: boolean) => void;
    isFlat?: () => boolean;
  },
): ViewerBarHandle {
  const bar = document.createElement('div');
  bar.className = 'viewer-bar';
  bar.dataset.testid = 'viewer-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Visionneuse');

  const title = document.createElement('p');
  title.className = 'viewer-title';
  title.dataset.testid = 'viewer-title';

  const views = document.createElement('div');
  views.className = 'viewer-views';
  for (const view of VIEWER_VIEWS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.testid = view.testId;
    button.textContent = view.label;
    button.addEventListener('click', () => options.onView(view.id));
    views.appendChild(button);
  }

  const decorLabel = document.createElement('label');
  decorLabel.className = 'viewer-decor';
  decorLabel.dataset.testid = 'viewer-decor';
  const decorCheck = document.createElement('input');
  decorCheck.type = 'checkbox';
  decorCheck.dataset.testid = 'viewer-decor-toggle';
  decorCheck.setAttribute('aria-label', 'Afficher le décor en carreaux de ciment');
  const decorText = document.createElement('span');
  decorText.textContent = 'Décor';
  decorLabel.append(decorCheck, decorText);
  decorCheck.addEventListener('change', () => {
    const { design, catalogue } = getState();
    const activeCollectionId = editingCollection()?.id ?? null;
    const current = design.decor.mode;
    if (decorCheck.checked) {
      const mode = lastActiveDecorMode === 'aucun' ? 'coin' : lastActiveDecorMode;
      const patch: { mode: DecorMode; tileCm?: number } = { mode };
      const coll = catalogue?.collections.find((c) => c.id === activeCollectionId);
      if (coll) patch.tileCm = tileCmFromFormat(coll.format);
      update({ design: { decor: patch } });
    } else {
      if (current !== 'aucun') lastActiveDecorMode = current;
      update({ design: { decor: { mode: 'aucun' } } });
    }
  });

  const flatLabel = document.createElement('label');
  flatLabel.className = 'viewer-decor';
  flatLabel.dataset.testid = 'viewer-flat';
  const flatCheck = document.createElement('input');
  flatCheck.type = 'checkbox';
  flatCheck.dataset.testid = 'viewer-flat-toggle';
  flatCheck.setAttribute('aria-label', 'Afficher la vue à plat');
  const flatText = document.createElement('span');
  flatText.textContent = 'À plat';
  flatLabel.append(flatCheck, flatText);
  flatCheck.addEventListener('change', () => {
    options.onFlat?.(flatCheck.checked);
  });

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.testid = 'viewer-copy-link';
  copy.textContent = 'Copier le lien';
  copy.addEventListener('click', () => {
    void options.onCopyLink();
  });

  const favoris = document.createElement('a');
  favoris.href = './favoris.html';
  favoris.className = 'viewer-favoris-link';
  favoris.dataset.testid = 'viewer-favoris-link';
  favoris.textContent = 'Favoris';

  bar.append(title, views, decorLabel, flatLabel, copy, favoris);
  viewport.appendChild(bar);

  function refresh(): void {
    const { design, catalogue } = getState();
    const activeCollectionId = editingCollection()?.id ?? null;
    const coll = activeCollectionId
      ? catalogue?.collections.find((c) => c.id === activeCollectionId)
      : undefined;
    const parts = [design.name || 'Modèle'];
    if (coll) parts.push(coll.nom);
    title.textContent = parts.join(' · ');

    const on = design.decor.mode !== 'aucun';
    if (on) lastActiveDecorMode = design.decor.mode;
    if (document.activeElement !== decorCheck) decorCheck.checked = on;
    if (document.activeElement !== flatCheck && options.isFlat) {
      flatCheck.checked = options.isFlat();
    }
  }

  refresh();
  subscribe(refresh);

  return {
    root: bar,
    setVisible(visible: boolean) {
      bar.hidden = !visible;
      if (visible) refresh();
    },
  };
}
