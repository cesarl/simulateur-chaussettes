/**
 * Ligne de couleur unifiée (T67) : pastille, libellé, œil, éventuel « Remplacer… ».
 */
import type { Hex } from '../core/types';

const EYE_ON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2.1 3.5 3.5 2.1l18.4 18.4-1.4 1.4-3.1-3.1A12.6 12.6 0 0 1 12 19c-5 0-9.3-3.1-11-7a13.4 13.4 0 0 1 4.6-5.3L2.1 3.5zM12 7a5 5 0 0 1 5 5c0 .7-.1 1.3-.4 1.9l-6.5-6.5c.6-.3 1.2-.4 1.9-.4zm-7.5 5c.7 1.6 2 3 3.7 4l2.2-2.2A5 5 0 0 1 7 12c0-.5.1-1 .2-1.4L4.5 12z"/></svg>`;

export interface ColorRowOptions {
  hex: Hex;
  /** Texte à droite de la pastille (code · nom, ou « origine → fil »). */
  label: string;
  /** Couleur actuellement transparente. */
  transparent: boolean;
  /** Infobulle de l’œil (zones partageant le même fil, etc.). */
  eyeTitle?: string;
  testId?: string;
  onToggleEye: () => void;
  /** Affiché seulement pour les Images. */
  recolorLabel?: string | null;
  onRecolor?: () => void;
}

export function createColorRow(opts: ColorRowOptions): HTMLElement {
  const row = document.createElement('div');
  row.className = opts.transparent ? 'color-row is-transparent' : 'color-row';
  row.dataset.testid = opts.testId ?? `color-row-${opts.hex.slice(1)}`;
  row.dataset.color = opts.hex.toLowerCase();

  const swatch = document.createElement('i');
  swatch.className = 'color-row-swatch';
  swatch.style.background = opts.hex;

  const text = document.createElement('span');
  text.className = 'color-row-label';
  text.textContent = opts.label;

  const eye = document.createElement('button');
  eye.type = 'button';
  eye.className = 'color-row-eye';
  eye.dataset.testid = `layer-color-${opts.hex.slice(1).toLowerCase()}`;
  eye.setAttribute('aria-pressed', opts.transparent ? 'true' : 'false');
  const eyeTitle =
    opts.eyeTitle ??
    (opts.transparent
      ? `${opts.hex} — transparente (cliquer pour rétablir)`
      : `${opts.hex} — cliquer pour rendre transparente`);
  eye.title = eyeTitle;
  eye.setAttribute('aria-label', eyeTitle);
  eye.innerHTML = opts.transparent ? EYE_OFF : EYE_ON;
  eye.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    opts.onToggleEye();
  });

  row.append(swatch, text, eye);

  if (opts.onRecolor) {
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.className = 'color-row-recolor';
    replace.dataset.testid = `layer-recolor-${opts.hex.slice(1).toLowerCase()}`;
    replace.textContent = opts.recolorLabel ? 'Changer…' : 'Remplacer…';
    replace.title = opts.recolorLabel
      ? `Remplacement : ${opts.recolorLabel}`
      : 'Remplacer cette couleur par un fil';
    replace.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      opts.onRecolor?.();
    });
    row.appendChild(replace);
  }

  return row;
}
