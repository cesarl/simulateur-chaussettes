/**
 * Galerie des favoris en ligne (T83).
 */
import { FAVORIS_VITE_MESSAGE, FavorisApiError, fetchFavorisJson } from './io/favorisApi';
import {
  forgetPassword,
  patchFavori,
  readStoredPassword,
  storePassword,
} from './io/favorisClient';

type FavoriItem = {
  id: string;
  nom: string;
  lien: string;
  cree_le: number;
  modifie_le: number;
  supprime_le: number | null;
  has_vignette: boolean;
};

const PASSWORD_HEADER = 'X-Mot-De-Passe';

const grid = document.querySelector('[data-testid="favoris-grid"]') as HTMLElement;
const statusEl = document.querySelector('[data-testid="favoris-status"]') as HTMLElement;
const filterInput = document.querySelector('[data-testid="favoris-filter"]') as HTMLInputElement;
const trashBtn = document.querySelector('[data-testid="favoris-corbeille"]') as HTMLButtonElement;

let showingTrash = false;
let items: FavoriItem[] = [];
let undoTimer: number | undefined;
let lastDeletedId: string | null = null;

function setStatus(message: string | null, undo?: { id: string }): void {
  if (!message) {
    statusEl.hidden = true;
    statusEl.replaceChildren();
    return;
  }
  statusEl.hidden = false;
  statusEl.replaceChildren(document.createTextNode(message));
  if (undo) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.testid = 'favoris-undo-delete';
    btn.textContent = 'Annuler';
    btn.addEventListener('click', () => {
      void restoreFavori(undo.id);
    });
    statusEl.append(' ', btn);
  }
}

function formatDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString('fr-FR');
  }
}

function askPassword(errorMessage?: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'favori-dialog';
    dialog.dataset.testid = 'favoris-password-dialog';
    const title = document.createElement('h2');
    title.textContent = 'Mot de passe';
    const err = document.createElement('p');
    err.className = 'favori-dialog-error';
    err.dataset.testid = 'favoris-password-error';
    err.hidden = !errorMessage;
    err.textContent = errorMessage ?? '';
    const label = document.createElement('label');
    label.textContent = 'Mot de passe';
    const input = document.createElement('input');
    input.type = 'password';
    input.dataset.testid = 'favoris-password';
    const stored = readStoredPassword();
    if (stored) input.value = stored;
    label.appendChild(input);
    const actions = document.createElement('div');
    actions.className = 'favori-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.dataset.testid = 'favoris-password-cancel';
    cancel.textContent = 'Annuler';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.dataset.testid = 'favoris-password-ok';
    ok.textContent = 'OK';
    const finish = (v: string | null): void => {
      dialog.close();
      dialog.remove();
      resolve(v);
    };
    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', () => {
      if (!input.value) {
        err.hidden = false;
        err.textContent = 'Mot de passe requis.';
        return;
      }
      storePassword(input.value);
      finish(input.value);
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

async function withPassword(run: (password: string) => Promise<void>): Promise<void> {
  let password = readStoredPassword() ?? (await askPassword());
  if (!password) return;
  try {
    await run(password);
  } catch (e) {
    if (e instanceof FavorisApiError && e.status === 401) {
      forgetPassword();
      password = await askPassword('Mot de passe incorrect');
      if (!password) return;
      await run(password);
      return;
    }
    setStatus(e instanceof Error ? e.message : 'Action impossible.');
  }
}

async function apiWrite(path: string, init: RequestInit, password: string): Promise<void> {
  await fetchFavorisJson(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      'Content-Type': 'application/json',
      [PASSWORD_HEADER]: password,
    },
  });
}

async function loadList(): Promise<void> {
  grid.replaceChildren();
  setStatus(null);
  for (let i = 0; i < 4; i++) {
    const sk = document.createElement('div');
    sk.className = 'favoris-card favoris-card-skeleton';
    sk.dataset.testid = `favoris-skeleton-${i}`;
    grid.appendChild(sk);
  }
  try {
    const q = showingTrash ? '?corbeille=1' : '';
    const data = await fetchFavorisJson<{ favoris: FavoriItem[] }>(`/api/favoris${q}`);
    items = data.favoris;
  } catch (e) {
    grid.replaceChildren();
    const msg = e instanceof FavorisApiError ? e.message : FAVORIS_VITE_MESSAGE;
    setStatus(
      /vite|indisponibles/i.test(msg) ? FAVORIS_VITE_MESSAGE : `API indisponible : ${msg}`,
    );
    return;
  }
  render();
}

function filtered(): FavoriItem[] {
  const q = filterInput.value.trim().toLowerCase();
  if (!q) return items;
  return items.filter((f) => f.nom.toLowerCase().includes(q));
}

function cardHref(f: FavoriItem): string {
  const hash = f.lien.startsWith('#') ? f.lien : `#${f.lien}`;
  return `./?favori=${encodeURIComponent(f.id)}${hash}`;
}

function render(): void {
  grid.replaceChildren();
  const list = filtered();
  if (list.length === 0) {
    setStatus(
      showingTrash
        ? 'Corbeille vide.'
        : 'Aucun favori pour l’instant — ouvrez le simulateur et cliquez sur ★ Favori',
    );
    return;
  }
  setStatus(null);
  for (const f of list) grid.appendChild(makeCard(f));
}

function makeCard(f: FavoriItem): HTMLElement {
  const card = document.createElement('article');
  card.className = 'favoris-card';
  card.dataset.testid = `favoris-card-${f.id}`;

  const link = document.createElement('a');
  link.className = 'favoris-card-main';
  link.href = cardHref(f);
  link.dataset.testid = `favoris-open-${f.id}`;

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = f.nom;
  img.width = 480;
  img.height = 600;
  if (f.has_vignette) {
    img.src = `/api/favoris/${encodeURIComponent(f.id)}/vignette?v=${f.modifie_le}`;
  } else {
    img.classList.add('favoris-card-placeholder');
  }

  const name = document.createElement('h2');
  name.dataset.testid = `favoris-name-${f.id}`;
  name.textContent = f.nom;
  const date = document.createElement('p');
  date.className = 'favoris-card-date';
  date.textContent = `modifié le ${formatDate(f.modifie_le)}`;
  link.append(img, name, date);

  const menu = document.createElement('div');
  menu.className = 'favoris-card-menu';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.testid = `favoris-menu-${f.id}`;
  toggle.textContent = '⋯';
  toggle.setAttribute('aria-label', 'Actions');
  const actions = document.createElement('div');
  actions.className = 'favoris-card-actions';
  actions.hidden = true;

  if (showingTrash) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.dataset.testid = `favoris-restore-${f.id}`;
    restore.textContent = 'Restaurer';
    restore.addEventListener('click', () => {
      void restoreFavori(f.id);
    });
    actions.append(restore);
  } else {
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.dataset.testid = `favoris-rename-${f.id}`;
    rename.textContent = 'Renommer';
    rename.addEventListener('click', () => startInlineRename(f, name, link));
    const del = document.createElement('button');
    del.type = 'button';
    del.dataset.testid = `favoris-delete-${f.id}`;
    del.textContent = 'Supprimer';
    del.addEventListener('click', () => {
      void withPassword(async (password) => {
        await apiWrite(`/api/favoris/${encodeURIComponent(f.id)}`, { method: 'DELETE' }, password);
        lastDeletedId = f.id;
        window.clearTimeout(undoTimer);
        await loadList();
        setStatus('Favori mis à la corbeille.', { id: f.id });
        undoTimer = window.setTimeout(() => {
          if (lastDeletedId === f.id) setStatus(null);
        }, 5000);
      });
    });
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.dataset.testid = `favoris-copy-${f.id}`;
    copy.textContent = 'Copier le lien';
    copy.addEventListener('click', async () => {
      const url = new URL(cardHref(f), window.location.href).href;
      try {
        await navigator.clipboard.writeText(url);
        setStatus('Lien copié.');
      } catch {
        setStatus(url);
      }
    });
    actions.append(rename, del, copy);
  }

  toggle.addEventListener('click', () => {
    actions.hidden = !actions.hidden;
  });
  menu.append(toggle, actions);
  card.append(link, menu);
  return card;
}

function startInlineRename(f: FavoriItem, nameEl: HTMLElement, link: HTMLAnchorElement): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.value = f.nom;
  input.dataset.testid = `favoris-rename-input-${f.id}`;
  input.className = 'favoris-rename-input';
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (): void => {
    if (done) return;
    done = true;
    const nom = input.value.trim();
    if (!nom || nom === f.nom) {
      input.replaceWith(nameEl);
      return;
    }
    void withPassword(async (password) => {
      await patchFavori(f.id, { nom }, password);
      await loadList();
    });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      done = true;
      input.replaceWith(nameEl);
    }
  });
  input.addEventListener('blur', () => commit());
  link.addEventListener('click', (e) => e.preventDefault(), { once: true });
}

async function restoreFavori(id: string): Promise<void> {
  await withPassword(async (password) => {
    await apiWrite(
      `/api/favoris/${encodeURIComponent(id)}/restaurer`,
      { method: 'POST', body: '{}' },
      password,
    );
    lastDeletedId = null;
    window.clearTimeout(undoTimer);
    showingTrash = false;
    trashBtn.textContent = 'Corbeille';
    await loadList();
    setStatus('Favori restauré.');
  });
}

filterInput.addEventListener('input', () => render());
trashBtn.addEventListener('click', () => {
  showingTrash = !showingTrash;
  trashBtn.textContent = showingTrash ? 'Favoris' : 'Corbeille';
  trashBtn.setAttribute('aria-pressed', showingTrash ? 'true' : 'false');
  void loadList();
});

void loadList();
