/**
 * Toast discret en bas au centre (3–5 s).
 * Ex. « Lien copié », « Supprimé — Annuler ».
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
  testId?: string;
}

export interface ToastOptions {
  message: string;
  durationMs?: number;
  action?: ToastAction;
  testId?: string;
}

let host: HTMLElement | null = null;
let hideTimer = 0;

function ensureHost(): HTMLElement {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'kit-toast-host';
  host.dataset.testid = 'kit-toast-host';
  document.body.appendChild(host);
  return host;
}

/** Affiche un toast (remplace le précédent). */
export function showToast(options: ToastOptions): HTMLElement {
  const root = ensureHost();
  window.clearTimeout(hideTimer);
  root.replaceChildren();

  const toast = document.createElement('div');
  toast.className = 'kit-toast';
  toast.dataset.testid = options.testId ?? 'kit-toast';
  toast.setAttribute('role', 'status');

  const msg = document.createElement('span');
  msg.className = 'kit-toast__message';
  msg.textContent = options.message;
  toast.appendChild(msg);

  if (options.action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kit-toast__action';
    btn.textContent = options.action.label;
    if (options.action.testId) btn.dataset.testid = options.action.testId;
    btn.addEventListener('click', () => {
      options.action?.onClick();
      dismissToast();
    });
    toast.appendChild(btn);
  }

  root.appendChild(toast);
  const duration = options.durationMs ?? 4000;
  hideTimer = window.setTimeout(() => dismissToast(), duration);
  return toast;
}

export function dismissToast(): void {
  window.clearTimeout(hideTimer);
  if (host) host.replaceChildren();
}
