/**
 * Dock des calques (T54) : une carte par calque, du dessus (gauche) au dessous (droite),
 * le Fond fixé à droite. Vignette = rendu réel du calque seul.
 * Sélection, renommage, œil, cadenas, menu « ⋯ », glisser pour réordonner, clavier, repli.
 * Sans ascenseur : les cartes rétrécissent (140 → 96 → icône seule) jusqu’à 16 calques.
 */

import {
  addDessinLayer,
  duplicateLayer,
  getState,
  MAX_LAYERS,
  MAX_LAYERS_MESSAGE,
  moveLayer,
  removeLayer,
  renameLayer,
  selectLayer,
  setLayerHidden,
  setLayerLocked,
  subscribe,
} from '../state';
import type { StackLayer } from '../core/layers';
import { icon } from './kit/icons';
import { openMenu, closeOpenMenu, type MenuEntry } from './kit/menu';
import { kitButton } from './kit/button';

export type LibraryTab = 'collections' | 'images';

export interface LayersDockActions {
  /** Dessine le rendu réel du calque seul dans le canvas de la vignette. */
  drawLayerThumb: (layerId: string, canvas: HTMLCanvasElement) => void;
  /** Ouvre l’onglet « Calque » du panneau d’options. */
  openLayerTab: () => void;
  /** Ouvre la Bibliothèque sur l’onglet demandé. */
  openLibrary: (tab: LibraryTab) => void;
  /** Transforme un Motif/Image en calque Dessin (T71). */
  convertToDessin?: (layerId: string) => void;
}

export interface LayersDockApi {
  sync: () => void;
}

const COLLAPSE_KEY = 'sim-dock-collapsed';
const GAP = 6;

const ICONS = {
  eyeOn:
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 3.2c-3.2 0-5.6 2.7-6.6 4.3-.2.3-.2.7 0 1C2.4 10.1 4.8 12.8 8 12.8s5.6-2.7 6.6-4.3c.2-.3.2-.7 0-1C13.6 5.9 11.2 3.2 8 3.2zm0 7.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/></svg>',
  eyeOff:
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 3.2c-3.2 0-5.6 2.7-6.6 4.3-.2.3-.2.7 0 1C2.4 10.1 4.8 12.8 8 12.8s5.6-2.7 6.6-4.3c.2-.3.2-.7 0-1C13.6 5.9 11.2 3.2 8 3.2zm0 7.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z" opacity=".35"/><path d="M2.6 2l11.4 11.4-1 1L1.6 3z"/></svg>',
  lockOpen:
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M5 7V5.5a3 3 0 0 1 5.9-.7l-1.5.4A1.5 1.5 0 0 0 6.5 5.5V7H11a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H5z" opacity=".5"/></svg>',
  lockClosed:
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7h.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h.5zm1.5 0h4V5.5a2 2 0 0 0-4 0V7z"/></svg>',
} as const;

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch {
    /* stockage indisponible : le repli n’est pas mémorisé */
  }
}

function kindLabel(layer: StackLayer): string {
  if (layer.kind === 'fond') return 'Fond';
  if (layer.kind === 'motif') return 'Motif';
  if (layer.kind === 'dessin') return 'Dessin';
  return 'Image';
}

interface Card {
  root: HTMLDivElement;
  thumb: HTMLCanvasElement;
  name: HTMLSpanElement;
  kind: HTMLSpanElement;
  eye: HTMLButtonElement;
  lock: HTMLButtonElement;
  menu: HTMLButtonElement;
}

interface DragState {
  id: string;
  startX: number;
  active: boolean;
  gap: number;
}

export function mountLayersDock(host: HTMLElement, actions: LayersDockActions): LayersDockApi {
  host.replaceChildren();

  const body = document.createElement('div');
  body.className = 'layers-dock-body';
  body.dataset.testid = 'layers-dock-body';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.testid = 'dock-toggle';
  toggle.className = 'dock-toggle';

  const selectedName = document.createElement('span');
  selectedName.className = 'dock-selected-name';
  selectedName.dataset.testid = 'dock-selected-name';

  const edgeTop = document.createElement('span');
  edgeTop.className = 'dock-edge';
  edgeTop.dataset.testid = 'dock-edge-top';
  edgeTop.textContent = 'dessus';

  const list = document.createElement('div');
  list.className = 'layers-dock-list';
  list.dataset.testid = 'layers-dock-list';
  list.tabIndex = 0;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Calques, du dessus au dessous');

  const marker = document.createElement('div');
  marker.className = 'dock-insert-marker';
  marker.dataset.testid = 'dock-insert-marker';
  marker.hidden = true;

  const edgeBottom = document.createElement('span');
  edgeBottom.className = 'dock-edge';
  edgeBottom.dataset.testid = 'dock-edge-bottom';
  edgeBottom.textContent = 'dessous';

  const addCalque = kitButton({
    variant: 'ghost',
    icon: 'plus',
    label: 'Calque',
    compact: true,
    testId: 'dock-add-calque',
    ariaLabel: 'Ajouter un calque',
    tooltip: 'Ajouter un calque',
  });
  addCalque.appendChild(icon('chevronDown', { size: 14 }));

  const message = document.createElement('p');
  message.className = 'dock-message';
  message.dataset.testid = 'dock-message';

  // « dessous » est dans la liste, juste après la carte du Fond (elle-même fixée à droite).
  body.append(toggle, selectedName, edgeTop, list, addCalque, message);
  host.appendChild(body);

  const cards = new Map<string, Card>();
  let order: string[] = [];
  let renamingId: string | null = null;
  let drag: DragState | null = null;
  let draggedAt = 0;
  let collapsed = readCollapsed();
  let menuLayerId: string | null = null;

  // ------------------------------------------------------------------ helpers
  function appEl(): HTMLElement | null {
    return document.getElementById('app');
  }

  function showMessage(text: string): void {
    message.textContent = text;
  }

  function displayOrder(layers: readonly StackLayer[]): string[] {
    const stack = [...layers];
    const fond = stack.shift();
    const ids = stack.reverse().map((l) => l.id);
    if (fond) ids.push(fond.id);
    return ids;
  }

  function nonFondCount(): number {
    return Math.max(0, getState().design.layers.length - 1);
  }

  function closeMenu(): void {
    menuLayerId = null;
    closeOpenMenu();
  }

  function openLayerMenu(layer: StackLayer, anchor: HTMLElement): void {
    const existing = document.querySelector('[data-testid="dock-menu"]');
    if (existing && menuLayerId === layer.id) {
      closeMenu();
      return;
    }
    closeOpenMenu();
    const items: MenuEntry[] = [
      {
        id: 'duplicate',
        label: 'Dupliquer',
        icon: 'copy',
        testId: `layer-menu-duplicate-${layer.id}`,
        onSelect: () => duplicateLayer(layer.id),
      },
      {
        id: 'up',
        label: 'Monter',
        icon: 'chevronRight',
        testId: `layer-menu-up-${layer.id}`,
        onSelect: () => moveLayer(layer.id, 'monter'),
      },
      {
        id: 'down',
        label: 'Descendre',
        icon: 'chevronDown',
        testId: `layer-menu-down-${layer.id}`,
        onSelect: () => moveLayer(layer.id, 'descendre'),
      },
    ];
    if ((layer.kind === 'motif' || layer.kind === 'image') && actions.convertToDessin) {
      items.push({
        id: 'to-dessin',
        label: 'Transformer en dessin',
        icon: 'brush',
        testId: `layer-menu-to-dessin-${layer.id}`,
        onSelect: () => actions.convertToDessin?.(layer.id),
      });
    }
    items.push({ separator: true });
    items.push({
      id: 'delete',
      label: 'Supprimer',
      icon: 'trash',
      danger: true,
      testId: `layer-menu-delete-${layer.id}`,
      onSelect: () => {
        showMessage('');
        removeLayer(layer.id);
      },
    });
    menuLayerId = layer.id;
    openMenu({
      anchor,
      trigger: anchor,
      items,
      testId: 'dock-menu',
    });
  }

  function runAddMotif(): void {
    if (getState().design.layers.length >= MAX_LAYERS) {
      showMessage(MAX_LAYERS_MESSAGE);
      return;
    }
    showMessage('');
    actions.openLibrary('collections');
  }

  function runAddImage(): void {
    if (getState().design.layers.length >= MAX_LAYERS) {
      showMessage(MAX_LAYERS_MESSAGE);
      return;
    }
    showMessage('');
    actions.openLibrary('images');
  }

  function runAddDessin(): void {
    if (getState().design.layers.length >= MAX_LAYERS) {
      showMessage(MAX_LAYERS_MESSAGE);
      return;
    }
    showMessage('');
    const id = addDessinLayer();
    if (!id) showMessage(MAX_LAYERS_MESSAGE);
    else actions.openLayerTab();
  }

  function openAddMenu(): void {
    menuLayerId = null;
    openMenu({
      anchor: addCalque,
      trigger: addCalque,
      testId: 'dock-add-menu',
      items: [
        {
          id: 'motif',
          label: 'Motif',
          icon: 'layers',
          testId: 'dock-add-motif',
          onSelect: () => runAddMotif(),
        },
        {
          id: 'image',
          label: 'Image',
          icon: 'gallery',
          testId: 'dock-add-image',
          onSelect: () => runAddImage(),
        },
        {
          id: 'dessin',
          label: 'Dessin',
          icon: 'brush',
          testId: 'dock-add-dessin',
          onSelect: () => runAddDessin(),
        },
      ],
    });
  }

  function startRename(layer: StackLayer, card: Card): void {
    if (renamingId) return;
    renamingId = layer.id;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'layer-rename';
    input.dataset.testid = `layer-rename-${layer.id}`;
    input.value = layer.name;
    card.name.replaceChildren(input);

    const finish = (commit: boolean): void => {
      if (renamingId !== layer.id) return;
      const next = input.value.trim();
      renamingId = null;
      if (commit && next && next !== layer.name) renameLayer(layer.id, next);
      else render();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    input.focus();
    input.select();
  }

  function isActionTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest('button, input') !== null;
  }

  // ------------------------------------------------------------------ cartes
  function createCard(layer: StackLayer): Card {
    const root = document.createElement('div');
    root.className = 'layer-card';
    root.dataset.testid = `layer-card-${layer.id}`;
    root.tabIndex = -1;
    root.setAttribute('role', 'option');

    const thumb = document.createElement('canvas');
    thumb.className = 'layer-thumb';
    thumb.dataset.testid = `layer-thumb-${layer.id}`;
    thumb.width = 34;
    thumb.height = 44;

    const texts = document.createElement('div');
    texts.className = 'layer-card-texts';

    const name = document.createElement('span');
    name.className = 'layer-card-name';
    name.dataset.testid = `layer-name-${layer.id}`;

    const kind = document.createElement('span');
    kind.className = 'layer-card-kind';
    kind.dataset.testid = `layer-kind-${layer.id}`;

    const tools = document.createElement('div');
    tools.className = 'layer-card-tools';

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'layer-icon-button';
    eye.dataset.testid = `layer-eye-${layer.id}`;

    const lock = document.createElement('button');
    lock.type = 'button';
    lock.className = 'layer-icon-button';
    lock.dataset.testid = `layer-lock-${layer.id}`;

    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'layer-icon-button';
    menu.dataset.testid = `layer-menu-${layer.id}`;
    menu.appendChild(icon('more', { size: 14 }));
    menu.title = 'Dupliquer, monter, descendre, supprimer';
    menu.setAttribute('aria-label', 'Actions du calque');
    menu.setAttribute('aria-haspopup', 'menu');
    menu.setAttribute('aria-expanded', 'false');

    tools.append(eye, lock, menu);
    texts.append(name, kind, tools);
    root.append(thumb, texts);

    const card: Card = { root, thumb, name, kind, eye, lock, menu };

    root.addEventListener('click', (event) => {
      if (isActionTarget(event.target)) return;
      if (Date.now() - draggedAt < 300) return;
      root.focus();
      selectLayer(layer.id);
      actions.openLayerTab();
    });
    name.addEventListener('dblclick', (event) => {
      event.preventDefault();
      const current = getState().design.layers.find((l) => l.id === layer.id);
      if (current) startRename(current, card);
    });
    eye.addEventListener('click', () => {
      const current = getState().design.layers.find((l) => l.id === layer.id);
      if (!current || current.kind === 'fond') return;
      setLayerHidden(layer.id, !current.hidden);
    });
    lock.addEventListener('click', () => {
      const current = getState().design.layers.find((l) => l.id === layer.id);
      if (!current) return;
      setLayerLocked(layer.id, !current.locked);
    });
    menu.addEventListener('click', () => {
      const current = getState().design.layers.find((l) => l.id === layer.id);
      if (!current || current.kind === 'fond') return;
      openLayerMenu(current, menu);
    });
    root.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || layer.id === 'fond') return;
      if (isActionTarget(event.target)) return;
      drag = { id: layer.id, startX: event.clientX, active: false, gap: 0 };
    });

    return card;
  }

  function updateCard(card: Card, layer: StackLayer, selectedId: string | null): void {
    const { root, name, eye, lock, menu } = card;
    root.dataset.kind = layer.kind;
    root.dataset.hidden = layer.hidden ? 'true' : 'false';
    root.dataset.locked = layer.locked ? 'true' : 'false';
    root.dataset.selected = layer.id === selectedId ? 'true' : 'false';
    root.setAttribute('aria-selected', layer.id === selectedId ? 'true' : 'false');
    root.classList.toggle('selected', layer.id === selectedId);
    root.title = layer.name;
    if (renamingId !== layer.id) name.textContent = layer.name;
    card.kind.textContent = kindLabel(layer);

    const isFond = layer.kind === 'fond';
    const eyeState = layer.hidden ? 'off' : 'on';
    eye.hidden = isFond;
    if (eye.dataset.state !== eyeState) {
      eye.dataset.state = eyeState;
      eye.innerHTML = layer.hidden ? ICONS.eyeOff : ICONS.eyeOn;
    }
    eye.setAttribute('aria-pressed', layer.hidden ? 'true' : 'false');
    eye.title = layer.hidden ? 'Afficher ce calque' : 'Masquer ce calque';
    eye.setAttribute('aria-label', eye.title);

    const lockState = layer.locked ? 'closed' : 'open';
    if (lock.dataset.state !== lockState) {
      lock.dataset.state = lockState;
      lock.innerHTML = layer.locked ? ICONS.lockClosed : ICONS.lockOpen;
    }
    lock.setAttribute('aria-pressed', layer.locked ? 'true' : 'false');
    lock.title = layer.locked ? 'Déverrouiller ce calque' : 'Verrouiller ce calque';
    lock.setAttribute('aria-label', lock.title);

    menu.hidden = isFond;

    // Résolution de la vignette = celle de sa boîte (×2), pour un rendu net et non déformé.
    const width = Math.max(8, Math.round(card.thumb.clientWidth)) * 2;
    const height = Math.max(8, Math.round(card.thumb.clientHeight)) * 2;
    if (card.thumb.width !== width || card.thumb.height !== height) {
      card.thumb.width = width;
      card.thumb.height = height;
      delete card.thumb.dataset.thumbKey;
    }
    actions.drawLayerThumb(layer.id, card.thumb);
  }

  /** Largeur des cartes : 140, puis 96, puis icône seule, pour tenir sur une ligne. */
  function applySizes(count: number): void {
    // Réserve : libellé « dessous » + place du repère d’insertion pendant un glisser.
    const available = list.clientWidth - edgeBottom.offsetWidth - GAP - 14;
    if (available <= 0 || count <= 0) return;
    const per = Math.floor((available - GAP * Math.max(0, count - 1)) / count);
    let mode = 'icon';
    let width = Math.max(30, Math.min(88, per));
    if (per >= 140) {
      mode = 'large';
      width = 140;
    } else if (per >= 96) {
      mode = 'medium';
      width = 96;
    }
    list.dataset.size = mode;
    list.style.setProperty('--card-w', `${width}px`);
  }

  // ------------------------------------------------------------------ glisser
  function draggableCards(): Array<{ id: string; box: DOMRect }> {
    const out: Array<{ id: string; box: DOMRect }> = [];
    for (const id of order) {
      const card = id === 'fond' ? undefined : cards.get(id);
      if (card) out.push({ id, box: card.root.getBoundingClientRect() });
    }
    return out;
  }

  function gapAt(clientX: number, draggedId: string): number {
    const others = draggableCards().filter((c) => c.id !== draggedId);
    let gap = 0;
    for (const other of others) {
      if (clientX > other.box.left + other.box.width / 2) gap += 1;
    }
    return Math.min(others.length, Math.max(0, gap));
  }

  function placeMarker(gap: number, draggedId: string): void {
    const others = order.filter((id) => id !== 'fond' && id !== draggedId);
    const nextId = others[gap] ?? 'fond';
    const nextCard = cards.get(nextId)?.root ?? null;
    marker.hidden = false;
    list.insertBefore(marker, nextCard ?? edgeBottom);
  }

  window.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.startX) < 4) return;
      drag.active = true;
      cards.get(drag.id)?.root.classList.add('dragging');
      list.classList.add('dragging');
    }
    drag.gap = gapAt(event.clientX, drag.id);
    placeMarker(drag.gap, drag.id);
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    marker.hidden = true;
    marker.remove();
    list.classList.remove('dragging');
    cards.get(current.id)?.root.classList.remove('dragging');
    if (!current.active) return;
    draggedAt = Date.now();
    // Index de pile visé : 1 = juste au-dessus du Fond, n = tout en haut.
    const target = nonFondCount() - current.gap;
    moveLayer(current.id, target);
  });

  // ------------------------------------------------------------------ clavier
  host.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const { design, selectedLayerId } = getState();
    const ids = displayOrder(design.layers);
    const index = selectedLayerId ? ids.indexOf(selectedLayerId) : -1;
    const key = event.key;

    if (key === 'ArrowUp' || key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      selectLayer(ids[Math.max(0, index - 1)] ?? ids[0] ?? null);
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      selectLayer(ids[Math.min(ids.length - 1, index + 1)] ?? ids[0] ?? null);
      return;
    }
    if (key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedLayerId || selectedLayerId === 'fond') {
        showMessage('Le Fond ne se supprime pas.');
        return;
      }
      showMessage('');
      removeLayer(selectedLayerId);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'd') {
      event.preventDefault();
      event.stopPropagation();
      if (selectedLayerId && selectedLayerId !== 'fond') {
        if (design.layers.length >= MAX_LAYERS) showMessage(MAX_LAYERS_MESSAGE);
        else duplicateLayer(selectedLayerId);
      }
      return;
    }
    if (key.toLowerCase() === 'h') {
      event.preventDefault();
      event.stopPropagation();
      const layer = design.layers.find((l) => l.id === selectedLayerId);
      if (layer && layer.kind !== 'fond') setLayerHidden(layer.id, !layer.hidden);
    }
  });

  // ------------------------------------------------------------------ repli
  function applyCollapsed(): void {
    appEl()?.classList.toggle('dock-collapsed', collapsed);
    toggle.textContent = collapsed ? 'Calques ▸' : 'Calques ▾';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    writeCollapsed(collapsed);
    applyCollapsed();
    render();
  });

  addCalque.addEventListener('click', (event) => {
    event.stopPropagation();
    openAddMenu();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
    if (drag) {
      cards.get(drag.id)?.root.classList.remove('dragging');
      drag = null;
      marker.hidden = true;
      marker.remove();
      list.classList.remove('dragging');
    }
  });

  // ------------------------------------------------------------------ rendu
  function render(): void {
    const { design, selectedLayerId } = getState();
    const hadFocus = host.contains(document.activeElement);
    const ids = displayOrder(design.layers);

    for (const [id, card] of cards) {
      if (!ids.includes(id)) {
        card.root.remove();
        cards.delete(id);
      }
    }
    for (const layer of design.layers) {
      if (!cards.has(layer.id)) cards.set(layer.id, createCard(layer));
    }
    const sameOrder = ids.length === order.length && ids.every((id, i) => id === order[i]);
    if (!sameOrder || list.children.length !== ids.length + 1) {
      list.replaceChildren(...ids.map((id) => cards.get(id)!.root), edgeBottom);
      order = ids;
    }

    // Largeur des cartes d’abord : les vignettes se dimensionnent d’après leur boîte.
    applySizes(ids.length);
    for (const layer of design.layers) {
      updateCard(cards.get(layer.id)!, layer, selectedLayerId);
    }

    const selected = design.layers.find((l) => l.id === selectedLayerId);
    selectedName.textContent = selected ? `${kindLabel(selected)} · ${selected.name}` : 'Aucun calque';
    const full = design.layers.length >= MAX_LAYERS;
    addCalque.title = full ? MAX_LAYERS_MESSAGE : 'Ajouter un calque';
    addCalque.setAttribute('aria-label', full ? MAX_LAYERS_MESSAGE : 'Ajouter un calque');

    if (hadFocus && !renamingId) {
      const card = selectedLayerId ? cards.get(selectedLayerId) : undefined;
      if (card && document.activeElement !== card.root && !collapsed) card.root.focus();
    }
  }

  const observer = new ResizeObserver(() => applySizes(order.length));
  observer.observe(list);

  applyCollapsed();
  render();
  subscribe(render);
  return { sync: render };
}
