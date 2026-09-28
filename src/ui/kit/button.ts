/**
 * Boutons du kit : principal | discret | icône.
 * Hauteur 32 px (28 en compact) ; focus clavier visible.
 */

import { icon, type IconName } from './icons';
import { attachTooltip } from './tooltip';

export type ButtonVariant = 'primary' | 'ghost' | 'icon';

export interface KitButtonOptions {
  variant?: ButtonVariant;
  label?: string;
  icon?: IconName;
  testId?: string;
  compact?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** Infobulle (libellé) ; raccourci affiché à part. */
  tooltip?: string;
  shortcut?: string;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
}

export function kitButton(options: KitButtonOptions = {}): HTMLButtonElement {
  const variant = options.variant ?? 'ghost';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `kit-btn kit-btn--${variant}`;
  if (options.compact) btn.classList.add('kit-btn--compact');
  if (options.danger) btn.classList.add('kit-btn--danger');
  if (options.testId) btn.dataset.testid = options.testId;
  if (options.disabled) btn.disabled = true;

  const aria = options.ariaLabel ?? options.tooltip ?? options.label ?? '';
  if (aria) btn.setAttribute('aria-label', aria);

  if (options.icon) {
    btn.appendChild(icon(options.icon, { size: options.compact ? 16 : 18 }));
  }
  if (options.label && variant !== 'icon') {
    const span = document.createElement('span');
    span.className = 'kit-btn__label';
    span.textContent = options.label;
    btn.appendChild(span);
  }

  if (options.onClick) {
    btn.addEventListener('click', options.onClick);
  }

  if (options.tooltip || (variant === 'icon' && aria)) {
    attachTooltip(btn, {
      label: options.tooltip ?? aria,
      shortcut: options.shortcut,
    });
  }

  return btn;
}
