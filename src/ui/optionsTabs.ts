/**
 * Onglets du panneau d’options (Calque / Chaussette / Décor / Export).
 * T54 : activation seule (le contenu reste le panneau V6). T55 branche le contenu de chaque onglet.
 */

export type OptionsTab = 'calque' | 'chaussette' | 'decor' | 'export';

const TABS: OptionsTab[] = ['calque', 'chaussette', 'decor', 'export'];

export interface OptionsTabsApi {
  open: (tab: OptionsTab) => void;
  current: () => OptionsTab;
}

/** Branche les boutons d’onglets déjà présents dans la page (`data-testid="tab-<nom>"`). */
export function mountOptionsTabs(host: HTMLElement, onChange?: (tab: OptionsTab) => void): OptionsTabsApi {
  let active: OptionsTab = 'calque';

  function buttonFor(tab: OptionsTab): HTMLButtonElement | null {
    const el = host.querySelector(`[data-testid="tab-${tab}"]`);
    return el instanceof HTMLButtonElement ? el : null;
  }

  function open(tab: OptionsTab): void {
    active = tab;
    for (const name of TABS) {
      const button = buttonFor(name);
      if (!button) continue;
      const on = name === tab;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    host.dataset.activeTab = tab;
    onChange?.(tab);
  }

  for (const name of TABS) {
    buttonFor(name)?.addEventListener('click', () => open(name));
  }
  open(active);

  return { open, current: () => active };
}
