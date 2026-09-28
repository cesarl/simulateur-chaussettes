/**
 * Infobulle au survol / focus, délai 400 ms.
 * Affiche le raccourci en petit si fourni (« Annuler · Ctrl+Z »).
 */

const SHOW_DELAY_MS = 400;
const HIDE_DELAY_MS = 80;

let activeTip: HTMLElement | null = null;
let showTimer = 0;
let hideTimer = 0;

export interface TooltipOptions {
  label: string;
  shortcut?: string;
}

function ensureTip(): HTMLElement {
  if (activeTip && document.body.contains(activeTip)) return activeTip;
  const tip = document.createElement('div');
  tip.className = 'kit-tooltip';
  tip.dataset.testid = 'kit-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  activeTip = tip;
  return tip;
}

function placeTip(tip: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  tip.hidden = false;
  tip.style.visibility = 'hidden';
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = rect.left + rect.width / 2 - tw / 2;
  let top = rect.top - th - 8;
  if (top < 8) top = rect.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.style.visibility = 'visible';
}

function showTip(anchor: HTMLElement, options: TooltipOptions): void {
  const tip = ensureTip();
  tip.replaceChildren();
  const label = document.createElement('span');
  label.className = 'kit-tooltip__label';
  label.textContent = options.label;
  tip.appendChild(label);
  if (options.shortcut) {
    const sep = document.createElement('span');
    sep.className = 'kit-tooltip__sep';
    sep.textContent = ' · ';
    const sc = document.createElement('kbd');
    sc.className = 'kit-tooltip__shortcut';
    sc.textContent = options.shortcut;
    tip.append(sep, sc);
  }
  placeTip(tip, anchor);
}

function hideTip(): void {
  if (activeTip) activeTip.hidden = true;
}

/** Attache une infobulle au survol et au focus clavier. */
export function attachTooltip(el: HTMLElement, options: TooltipOptions): void {
  const scheduleShow = (): void => {
    window.clearTimeout(hideTimer);
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => showTip(el, options), SHOW_DELAY_MS);
  };
  const scheduleHide = (): void => {
    window.clearTimeout(showTimer);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideTip, HIDE_DELAY_MS);
  };

  el.addEventListener('pointerenter', scheduleShow);
  el.addEventListener('pointerleave', scheduleHide);
  el.addEventListener('focus', scheduleShow);
  el.addEventListener('blur', scheduleHide);
  el.addEventListener('click', () => {
    window.clearTimeout(showTimer);
    hideTip();
  });
}

/** Force la fermeture (ex. ouverture d'un menu). */
export function dismissTooltip(): void {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  hideTip();
}
