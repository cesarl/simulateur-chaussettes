/**
 * Onglets du panneau d’options (Calque / Chaussette / Décor / Export).
 * Les boutons existent déjà dans la page ; ce module gère l’onglet actif et prévient
 * les abonnés (le panneau affiche le volet correspondant).
 */

export type OptionsTab = 'calque' | 'chaussette' | 'decor' | 'export';

export const OPTIONS_TABS: readonly OptionsTab[] = ['calque', 'chaussette', 'decor', 'export'];

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

  function open(tab: OptionsTab): void {
    active = tab;
    for (const name of OPTIONS_TABS) {
      const button = buttonFor(name);
      if (!button) continue;
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
