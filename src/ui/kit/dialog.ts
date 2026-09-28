/**
 * Fenêtre modale commune : titre, contenu, boutons à droite.
 * Échap ferme ; Entrée valide l'action principale si un seul champ.
 */

import { kitButton } from './button';

export interface DialogAction {
  label: string;
  variant?: 'primary' | 'ghost';
  danger?: boolean;
  testId?: string;
  onClick?: () => void | boolean | Promise<void | boolean>;
}

export interface DialogOptions {
  title: string;
  body: HTMLElement | string;
  actions?: DialogAction[];
  testId?: string;
  /** Fermeture sur fond / Échap (défaut true). */
  dismissible?: boolean;
  onClose?: () => void;
}

type DialogHost = HTMLElement & { __onClose?: () => void };

let dialogHost: DialogHost | null = null;

function closeDialog(): void {
  if (!dialogHost) return;
  const el = dialogHost;
  dialogHost = null;
  el.remove();
  document.removeEventListener('keydown', onKey, true);
}

function onKey(event: KeyboardEvent): void {
  if (!dialogHost) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    const dismissible = dialogHost.dataset.dismissible !== 'false';
    if (dismissible) {
      const onClose = dialogHost.__onClose;
      closeDialog();
      onClose?.();
    }
  } else if (event.key === 'Enter') {
    const primary = dialogHost.querySelector<HTMLButtonElement>(
      '.kit-dialog__actions .kit-btn--primary:not([disabled])',
    );
    if (primary && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      primary.click();
    }
  }
}

/** Ouvre une fenêtre modale (ferme l'éventuelle précédente). */
export function openDialog(options: DialogOptions): HTMLElement {
  closeDialog();

  const backdrop = document.createElement('div') as DialogHost;
  backdrop.className = 'kit-dialog-backdrop';
  backdrop.dataset.testid = options.testId ?? 'kit-dialog';
  backdrop.dataset.dismissible = options.dismissible === false ? 'false' : 'true';
  backdrop.__onClose = options.onClose;

  const dialog = document.createElement('div');
  dialog.className = 'kit-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', options.title);

  const head = document.createElement('div');
  head.className = 'kit-dialog__head';
  const title = document.createElement('h2');
  title.className = 'kit-dialog__title';
  title.textContent = options.title;
  const closeBtn = kitButton({
    variant: 'icon',
    icon: 'close',
    ariaLabel: 'Fermer',
    testId: `${options.testId ?? 'kit-dialog'}-close`,
    onClick: () => {
      closeDialog();
      options.onClose?.();
    },
  });
  head.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'kit-dialog__body';
  if (typeof options.body === 'string') {
    const p = document.createElement('p');
    p.textContent = options.body;
    body.appendChild(p);
  } else {
    body.appendChild(options.body);
  }

  const actions = document.createElement('div');
  actions.className = 'kit-dialog__actions';
  const list = options.actions ?? [{ label: 'Fermer', variant: 'ghost' as const }];
  list.forEach((action, index) => {
    const isLast = index === list.length - 1;
    const btn = kitButton({
      variant: action.variant ?? (isLast ? 'primary' : 'ghost'),
      label: action.label,
      danger: action.danger,
      testId: action.testId,
      onClick: () => {
        void (async () => {
          const result = await action.onClick?.();
          if (result === false) return;
          closeDialog();
          options.onClose?.();
        })();
      },
    });
    actions.appendChild(btn);
  });

  dialog.append(head, body, actions);
  backdrop.appendChild(dialog);

  if (options.dismissible !== false) {
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) {
        closeDialog();
        options.onClose?.();
      }
    });
  }

  document.body.appendChild(backdrop);
  dialogHost = backdrop;
  document.addEventListener('keydown', onKey, true);

  const focusable = dialog.querySelector<HTMLElement>(
    'input, textarea, select, button.kit-btn--primary',
  );
  window.setTimeout(() => focusable?.focus(), 0);
  return backdrop;
}

export function closeOpenDialog(): void {
  closeDialog();
}

/** Raccourci : confirmation oui/non. */
export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  testId?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openDialog({
      title: opts.title,
      body: opts.message,
      testId: opts.testId ?? 'kit-confirm',
      actions: [
        {
          label: 'Annuler',
          variant: 'ghost',
          testId: `${opts.testId ?? 'kit-confirm'}-cancel`,
          onClick: () => {
            finish(false);
          },
        },
        {
          label: opts.confirmLabel ?? 'Confirmer',
          variant: 'primary',
          danger: opts.danger,
          testId: `${opts.testId ?? 'kit-confirm'}-ok`,
          onClick: () => {
            finish(true);
          },
        },
      ],
      onClose: () => finish(false),
    });
  });
}
