/** Client API images partagées (`/api/images`). */

import { FavorisApiError, fetchFavorisJson } from './favorisApi';
import { forgetPassword, readStoredPassword, storePassword } from './favorisClient';

export type SharedImage = {
  id: string;
  nom: string;
  mime: string;
  largeur: number | null;
  hauteur: number | null;
  octets: number;
  cree_le: number;
  supprime_le: number | null;
};

export function sharedImageUrl(id: string): string {
  return `/api/images/${encodeURIComponent(id)}`;
}

export async function listSharedImages(): Promise<SharedImage[]> {
  const body = await fetchFavorisJson<{ images: SharedImage[] }>('/api/images');
  return body.images;
}

export async function uploadSharedImage(
  file: File,
  password: string,
): Promise<{ id: string; nom: string }> {
  let res: Response;
  try {
    res = await fetch('/api/images', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Nom': file.name,
        'X-Mot-De-Passe': password,
      },
      body: file,
    });
  } catch {
    throw new FavorisApiError('Bibliothèque partagée indisponible');
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new FavorisApiError('Bibliothèque partagée indisponible', res.status);
    }
  }
  if (!res.ok) {
    const err =
      body && typeof body === 'object' && body !== null && 'erreur' in body
        ? String((body as { erreur: unknown }).erreur)
        : res.status === 401
          ? 'Mot de passe incorrect'
          : `Erreur API (${res.status})`;
    throw new FavorisApiError(err, res.status);
  }
  const created = body as { id: string; nom: string };
  return { id: created.id, nom: created.nom };
}

export async function renameSharedImage(
  id: string,
  nom: string,
  password: string,
): Promise<void> {
  await fetchFavorisJson<{ ok: boolean }>(`/api/images/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Mot-De-Passe': password,
    },
    body: JSON.stringify({ nom }),
  });
}

export async function deleteSharedImage(id: string, password: string): Promise<void> {
  await fetchFavorisJson<{ ok: boolean }>(`/api/images/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Mot-De-Passe': password },
  });
}

/** Dialogue minimal pour le mot de passe commun. */
export function askSharedPassword(errorMessage?: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'favori-dialog';
    dialog.dataset.testid = 'lib-shared-password-dialog';
    const title = document.createElement('h2');
    title.textContent = 'Mot de passe';
    const err = document.createElement('p');
    err.className = 'favori-dialog-error';
    err.dataset.testid = 'lib-shared-password-error';
    err.hidden = !errorMessage;
    err.textContent = errorMessage ?? '';
    const label = document.createElement('label');
    label.textContent = 'Mot de passe';
    const input = document.createElement('input');
    input.type = 'password';
    input.dataset.testid = 'lib-shared-password';
    const stored = readStoredPassword();
    if (stored) input.value = stored;
    label.appendChild(input);
    const actions = document.createElement('div');
    actions.className = 'favori-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.dataset.testid = 'lib-shared-password-cancel';
    cancel.textContent = 'Annuler';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.dataset.testid = 'lib-shared-password-ok';
    ok.textContent = 'OK';
    const finish = (v: string | null): void => {
      dialog.close();
      dialog.remove();
      resolve(v);
    };
    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', () => {
      const v = input.value;
      if (!v) {
        err.hidden = false;
        err.textContent = 'Mot de passe requis.';
        return;
      }
      storePassword(v);
      finish(v);
    });
    actions.append(cancel, ok);
    dialog.append(title, err, label, actions);
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
  });
}

export { FavorisApiError, forgetPassword, storePassword };
