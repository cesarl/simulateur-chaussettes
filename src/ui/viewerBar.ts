import type { ViewName } from '../render/sock3d/studio';
import { getState, subscribe } from '../state';

const VIEWER_VIEWS: Array<{ id: ViewName; label: string; testId: string }> = [
  { id: 'trois-quarts', label: '¾', testId: 'viewer-view-trois-quarts' },
  { id: 'profil-exterieur', label: 'Profil', testId: 'viewer-view-profil' },
  { id: 'dos', label: 'Dos', testId: 'viewer-view-dos' },
  { id: 'face', label: 'Face', testId: 'viewer-view-face' },
];

export interface ViewerBarHandle {
  setVisible: (visible: boolean) => void;
  root: HTMLElement;
}

export function mountViewerBar(
  viewport: HTMLElement,
  options: {
    onView: (view: ViewName) => void;
    onCopyLink: () => void | Promise<void>;
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

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.testid = 'viewer-copy-link';
  copy.textContent = 'Copier le lien';
  copy.addEventListener('click', () => {
    void options.onCopyLink();
  });

  bar.append(title, views, copy);
  viewport.appendChild(bar);

  function refreshTitle(): void {
    const { design, catalogue, activeCollectionId } = getState();
    const coll = activeCollectionId
      ? catalogue?.collections.find((c) => c.id === activeCollectionId)
      : undefined;
    const parts = [design.name || 'Modèle'];
    if (coll) parts.push(coll.nom);
    title.textContent = parts.join(' · ');
  }

  refreshTitle();
  subscribe(refreshTitle);

  return {
    root: bar,
    setVisible(visible: boolean) {
      bar.hidden = !visible;
    },
  };
}
