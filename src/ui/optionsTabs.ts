/**
 * Onglets du panneau d’options (Calque / Chaussette / Décor / Export / Global).
 * Les boutons existent déjà dans la page ; ce module gère l’onglet actif et prévient
 * les abonnés (le panneau affiche le volet correspondant).
 */

import { icon, type IconName } from './kit/icons';

export type OptionsTab = 'calque' | 'chaussette' | 'decor' | 'export' | 'global';

export const OPTIONS_TABS: readonly OptionsTab[] = ['calque', 'chaussette', 'decor', 'export', 'global'];

const TAB_ICONS: Record<OptionsTab, IconName> = {
  calque: 'layers',
  chaussette: 'box',
  decor: 'gallery',
  export: 'download',
  global: 'settings',
};

export interface OptionsTabsApi {
  open: (tab: OptionsTab) => void;
  current: () => OptionsTab;
  /** S’abonner au changement d’onglet ; rappelé tout de suite avec l’onglet actif. */
  onChange: (listener: (tab: OptionsTab) => void) => void;
}

/** Branche les boutons d’onglets déjà présents dans la page (`data-testid="tab-<nom>"`). */
export function mountOptionsTabs(host: HTMLElement, onChange?: (tab: OptionsTab) => void): OptionsTabsApi {
  let active: OptionsTab = 'calque';
  const listeners: Array<(tab: OptionsTab) => void> = [];

  function buttonFor(tab: OptionsTab): HTMLButtonElement | null {
    const el = host.querySelector(`[data-testid="tab-${tab}"]`);
    return el instanceof HTMLButtonElement ? el : null;
  }

  function ensureIcon(tab: OptionsTab, button: HTMLButtonElement): void {
    if (button.querySelector('.kit-icon')) return;
    const svg = icon(TAB_ICONS[tab], { size: 16, className: 'tab-icon' });
    button.prepend(svg);
  }

  function open(tab: OptionsTab): void {
    active = tab;
    for (const name of OPTIONS_TABS) {
      const button = buttonFor(name);
      if (!button) continue;
      ensureIcon(name, button);
      const on = name === tab;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    host.dataset.activeTab = tab;
    onChange?.(tab);
    for (const listener of listeners) listener(tab);
  }

  for (const name of OPTIONS_TABS) {
    buttonFor(name)?.addEventListener('click', () => open(name));
  }
  open(active);

  return {
    open,
    current: () => active,
    onChange(listener) {
      listeners.push(listener);
      listener(active);
    },
  };
}
