/**
 * Petite flèche (chevron) qui déplie / replie un bloc.
 * Animation courte + aria-expanded.
 */

import { icon } from './icons';

export interface DisclosureOptions {
  label: string;
  content: HTMLElement;
  open?: boolean;
  testId?: string;
  onToggle?: (open: boolean) => void;
}

export function disclosure(options: DisclosureOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'kit-disclosure';
  if (options.testId) root.dataset.testid = options.testId;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'kit-disclosure__trigger';
  trigger.dataset.testid = options.testId
    ? `${options.testId}-trigger`
    : 'kit-disclosure-trigger';
  const chevron = icon('chevronRight', { size: 16, className: 'kit-disclosure__chevron' });
  const label = document.createElement('span');
  label.textContent = options.label;
  trigger.append(chevron, label);

  const panel = document.createElement('div');
  panel.className = 'kit-disclosure__panel';
  panel.dataset.testid = options.testId ? `${options.testId}-panel` : 'kit-disclosure-panel';
  panel.appendChild(options.content);

  let open = Boolean(options.open);
  const apply = (): void => {
    root.classList.toggle('kit-disclosure--open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
  };
  apply();

  trigger.addEventListener('click', () => {
    open = !open;
    apply();
    options.onToggle?.(open);
  });

  root.append(trigger, panel);
  return root;
}
