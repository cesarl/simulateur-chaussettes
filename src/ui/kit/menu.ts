/**
 * Menu contextuel unique : un seul ouvert à la fois.
 * Ouverture au clic « ⋯ » ou clic droit ; fermeture Échap / dehors / choix.
 */

import { icon, type IconName } from './icons';
import { dismissTooltip } from './tooltip';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: false;
  onSelect?: () => void;
}

export interface MenuSeparator {
  separator: true;
  id?: string;
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface OpenMenuOptions {
  anchor: HTMLElement | { clientX: number; clientY: number };
  items: MenuEntry[];
  testId?: string;
  /** Élément qui a déclenché (pour aria-expanded). */
  trigger?: HTMLElement;
}

let openMenuEl: HTMLElement | null = null;
let openTrigger: HTMLElement | null = null;
let activeIndex = -1;

function closeMenu(): void {
  if (openMenuEl) {
    openMenuEl.remove();
    openMenuEl = null;
  }
  if (openTrigger) {
    openTrigger.setAttribute('aria-expanded', 'false');
    openTrigger = null;
  }
  activeIndex = -1;
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('keydown', onKey, true);
}

function onDocPointer(event: PointerEvent): void {
  if (!openMenuEl) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (openMenuEl.contains(target)) return;
  if (openTrigger && openTrigger.contains(target)) return;
  closeMenu();
}

function selectableItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('.kit-menu__item:not([disabled])'));
}

function highlight(menu: HTMLElement, index: number): void {
  const items = selectableItems(menu);
  items.forEach((btn, i) => btn.classList.toggle('kit-menu__item--active', i === index));
  if (index >= 0 && index < items.length) items[index]?.focus();
  activeIndex = index;
}

function onKey(event: KeyboardEvent): void {
  if (!openMenuEl) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    const trigger = openTrigger;
    closeMenu();
    trigger?.focus();
    return;
  }
  const items = selectableItems(openMenuEl);
  if (items.length === 0) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlight(openMenuEl, (activeIndex + 1) % items.length);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlight(openMenuEl, (activeIndex - 1 + items.length) % items.length);
  } else if (event.key === 'Enter' || event.key === ' ') {
    if (activeIndex >= 0 && activeIndex < items.length) {
      event.preventDefault();
      items[activeIndex]?.click();
    }
  }
}

function placeMenu(menu: HTMLElement, anchor: OpenMenuOptions['anchor']): void {
  const pad = 8;
  let x: number;
  let y: number;
  if (anchor instanceof HTMLElement) {
    const r = anchor.getBoundingClientRect();
    x = r.left;
    y = r.bottom + 4;
  } else {
    x = anchor.clientX;
    y = anchor.clientY;
  }
  menu.style.visibility = 'hidden';
  menu.hidden = false;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  if (x + mw > window.innerWidth - pad) x = window.innerWidth - mw - pad;
  if (y + mh > window.innerHeight - pad) {
    if (anchor instanceof HTMLElement) {
      const r = anchor.getBoundingClientRect();
      y = r.top - mh - 4;
    } else {
      y = window.innerHeight - mh - pad;
    }
  }
  x = Math.max(pad, x);
  y = Math.max(pad, y);
  menu.style.left = `${Math.round(x)}px`;
  menu.style.top = `${Math.round(y)}px`;
  menu.style.visibility = 'visible';
}

/** Ferme le menu ouvert s'il y en a un. */
export function closeOpenMenu(): void {
  closeMenu();
}

/** Ouvre un menu (ferme l'éventuel précédent). */
export function openMenu(options: OpenMenuOptions): HTMLElement {
  dismissTooltip();
  closeMenu();

  const menu = document.createElement('div');
  menu.className = 'kit-menu';
  menu.dataset.testid = options.testId ?? 'kit-menu';
  menu.setAttribute('role', 'menu');
  menu.tabIndex = -1;

  for (const entry of options.items) {
    if ('separator' in entry && entry.separator) {
      const sep = document.createElement('div');
      sep.className = 'kit-menu__sep';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      continue;
    }
    const item = entry as MenuItem;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kit-menu__item';
    if (item.danger) btn.classList.add('kit-menu__item--danger');
    btn.setAttribute('role', 'menuitem');
    btn.dataset.menuId = item.id;
    btn.dataset.testid = `kit-menu-item-${item.id}`;
    if (item.disabled) btn.disabled = true;

    if (item.icon) btn.appendChild(icon(item.icon, { size: 16 }));
    const label = document.createElement('span');
    label.className = 'kit-menu__label';
    label.textContent = item.label;
    btn.appendChild(label);
    if (item.shortcut) {
      const sc = document.createElement('kbd');
      sc.className = 'kit-menu__shortcut';
      sc.textContent = item.shortcut;
      btn.appendChild(sc);
    }
    btn.addEventListener('click', () => {
      if (item.disabled) return;
      closeMenu();
      item.onSelect?.();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  openMenuEl = menu;
  openTrigger = options.trigger ?? (options.anchor instanceof HTMLElement ? options.anchor : null);
  if (openTrigger) openTrigger.setAttribute('aria-expanded', 'true');

  placeMenu(menu, options.anchor);
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onKey, true);
  highlight(menu, 0);
  return menu;
}

/** Bouton « ⋯ » qui ouvre le menu. */
export function moreButton(opts: {
  items: MenuEntry[] | (() => MenuEntry[]);
  testId?: string;
  ariaLabel?: string;
  menuTestId?: string;
}): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kit-btn kit-btn--icon';
  btn.dataset.testid = opts.testId ?? 'kit-more';
  btn.setAttribute('aria-label', opts.ariaLabel ?? 'Plus d’actions');
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.appendChild(icon('more', { size: 16 }));
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (openTrigger === btn && openMenuEl) {
      closeMenu();
      return;
    }
    const items = typeof opts.items === 'function' ? opts.items() : opts.items;
    openMenu({
      anchor: btn,
      trigger: btn,
      items,
      testId: opts.menuTestId ?? 'kit-menu',
    });
  });
  return btn;
}
