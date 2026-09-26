/** Dock des calques — version minimale (T53). T54 complète cartes, drag, etc. */

import { getState, subscribe } from '../state';

export function mountLayersDock(host: HTMLElement): { sync: () => void } {
  host.replaceChildren();
  const body = document.createElement('div');
  body.className = 'layers-dock-body';
  body.dataset.testid = 'layers-dock-body';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.testid = 'dock-toggle';
  toggle.textContent = 'Calques ▾';

  const list = document.createElement('div');
  list.className = 'layers-dock-list';
  list.dataset.testid = 'layers-dock-list';

  const addMotif = document.createElement('button');
  addMotif.type = 'button';
  addMotif.dataset.testid = 'dock-add-motif';
  addMotif.textContent = '+ Motif';
  addMotif.disabled = true;
  addMotif.title = 'Bientôt (T54)';

  const addImage = document.createElement('button');
  addImage.type = 'button';
  addImage.dataset.testid = 'dock-add-image';
  addImage.textContent = '+ Image';
  addImage.disabled = true;
  addImage.title = 'Bientôt (T54)';

  body.append(toggle, list, addMotif, addImage);
  host.appendChild(body);

  function sync(): void {
    const { design } = getState();
    // Ordre d'affichage : dessus → dessous = fin → début
    const ordered = [...design.layers].reverse();
    list.replaceChildren();
    for (const layer of ordered) {
      const card = document.createElement('span');
      card.className = 'layer-card-stub';
      card.dataset.testid = `layer-card-${layer.id}`;
      card.dataset.kind = layer.kind;
      card.textContent = layer.name;
      list.appendChild(card);
    }
  }

  toggle.addEventListener('click', () => {
    document.getElementById('app')?.classList.toggle('dock-collapsed');
    const collapsed = document.getElementById('app')?.classList.contains('dock-collapsed') === true;
    toggle.textContent = collapsed ? 'Calques ▸' : 'Calques ▾';
  });

  sync();
  subscribe(sync);
  return { sync };
}
