/**
 * Galerie des favoris en ligne (T83 → T93 finitions).
 */
import { FAVORIS_VITE_MESSAGE, FavorisApiError, fetchFavorisJson } from './io/favorisApi';
import {
  forgetPassword,
  patchFavori,
  readStoredPassword,
  storePassword,
} from './io/favorisClient';
import { icon } from './ui/kit/icons';
import { openMenu, closeOpenMenu, type MenuEntry } from './ui/kit/menu';
import { openDialog } from './ui/kit/dialog';
import { showToast } from './ui/kit/toast';
import { kitButton } from './ui/kit/button';

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
const countEl = document.querySelector('[data-testid="favoris-count"]') as HTMLElement | null;
const sortSelect = document.querySelector('[data-testid="favoris-sort"]') as HTMLSelectElement | null;
const filterIconHost = document.querySelector('.favoris-filter-icon');

if (filterIconHost) filterIconHost.appendChild(icon('search', { size: 16 }));

let showingTrash = false;
let items: FavoriItem[] = [];
let undoTimer: number | undefined;
let lastDeletedId: string | null = null;

function setStatus(message: string | null): void {
  if (!message) {
    statusEl.hidden = true;
    statusEl.replaceChildren();
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
}

function relativeDate(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} jour${d > 1 ? 's' : ''}`;
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString('fr-FR');
  }
}

function askPassword(errorMessage?: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    if (errorMessage) {
      const err = document.createElement('p');
      err.className = 'favori-dialog-error';
      err.dataset.testid = 'favoris-password-error';
      err.textContent = errorMessage;
      body.appendChild(err);
    }
    const label = document.createElement('label');
    label.textContent = 'Mot de passe';
    label.style.display = 'flex';
    label.style.flexDirection = 'column';
    label.style.gap = '6px';
    const input = document.createElement('input');
    input.type = 'password';
    input.dataset.testid = 'favoris-password';
    input.style.font = 'inherit';
    input.style.padding = '8px';
    input.style.border = '1px solid var(--line)';
    input.style.borderRadius = '6px';
    const stored = readStoredPassword();
    if (stored) input.value = stored;
    label.appendChild(input);
    body.appendChild(label);

    let settled = false;
    const finish = (v: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    openDialog({
      title: 'Mot de passe',
      body,
      testId: 'favoris-password-dialog',
      actions: [
        {
          label: 'Annuler',
          variant: 'ghost',
          testId: 'favoris-password-cancel',
          onClick: () => finish(null),
        },
        {
          label: 'OK',
          variant: 'primary',
          testId: 'favoris-password-ok',
          onClick: () => {
            if (!input.value) {
              finish(null);
              return false;
            }
            storePassword(input.value);
            finish(input.value);
            return true;
          },
        },
      ],
      onClose: () => finish(null),
    });
    window.setTimeout(() => input.focus(), 0);
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
    if (countEl) countEl.textContent = '';
    const retry = kitButton({
      variant: 'ghost',
      label: 'Réessayer',
      testId: 'favoris-retry',
      onClick: () => {
        void loadList();
      },
    });
    statusEl.append(' ', retry);
    statusEl.hidden = false;
    return;
  }
  render();
}

function sortedFiltered(): FavoriItem[] {
  const q = filterInput.value.trim().toLowerCase();
  let list = q ? items.filter((f) => f.nom.toLowerCase().includes(q)) : [...items];
  const sort = sortSelect?.value ?? 'recent';
  if (sort === 'nom') {
    list.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  } else {
    list.sort((a, b) => b.modifie_le - a.modifie_le);
  }
  return list;
}

function cardHref(f: FavoriItem): string {
  const hash = f.lien.startsWith('#') ? f.lien : `#${f.lien}`;
  return `./?favori=${encodeURIComponent(f.id)}${hash}`;
}

function updateCount(n: number): void {
  if (!countEl) return;
  if (showingTrash) {
    countEl.textContent = n ? `(${n})` : '';
    trashBtn.textContent = n ? `Corbeille (${n})` : 'Corbeille';
  } else {
    countEl.textContent = n ? `(${n})` : '';
    const trashCount = items.filter((i) => i.supprime_le).length;
    // count of trash unknown from main list — keep label, refresh on toggle
    trashBtn.textContent = 'Corbeille';
    void trashCount;
  }
}

function render(): void {
  grid.replaceChildren();
  closeOpenMenu();
  const list = sortedFiltered();
  updateCount(list.length);
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'favoris-empty';
    empty.dataset.testid = 'favoris-empty';
    empty.appendChild(icon('star', { size: 24 }));
    const p = document.createElement('p');
    p.textContent = showingTrash
      ? 'Corbeille vide.'
      : 'Aucun favori pour l’instant — ouvrez le simulateur et cliquez sur ★ Favori';
    empty.appendChild(p);
    grid.appendChild(empty);
    setStatus(null);
    return;
  }
  setStatus(null);
  for (const f of list) grid.appendChild(makeCard(f));
}

function openRenameDialog(f: FavoriItem): void {
  const body = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.value = f.nom;
  input.dataset.testid = `favoris-rename-input-${f.id}`;
  input.className = 'favoris-rename-input';
  input.style.width = '100%';
  input.style.font = 'inherit';
  input.style.padding = '8px';
  input.style.border = '1px solid var(--line)';
  input.style.borderRadius = '6px';
  body.appendChild(input);

  openDialog({
    title: 'Renommer',
    body,
    testId: `favoris-rename-dialog-${f.id}`,
    actions: [
      { label: 'Annuler', variant: 'ghost', testId: `favoris-rename-cancel-${f.id}` },
      {
        label: 'Enregistrer',
        variant: 'primary',
        testId: `favoris-rename-ok-${f.id}`,
        onClick: () => {
          const nom = input.value.trim();
          if (!nom || nom === f.nom) return;
          void withPassword(async (password) => {
            await patchFavori(f.id, { nom }, password);
            await loadList();
          });
        },
      },
    ],
  });
  window.setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function makeCard(f: FavoriItem): HTMLElement {
  const card = document.createElement('article');
  card.className = 'favoris-card';
  if (showingTrash) card.classList.add('favoris-card--trash');
  card.dataset.testid = `favoris-card-${f.id}`;

  const media = document.createElement('div');
  media.className = 'favoris-card-media';

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
  media.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'favoris-card-meta';
  const name = document.createElement('h2');
  name.dataset.testid = `favoris-name-${f.id}`;
  name.textContent = f.nom;
  const date = document.createElement('p');
  date.className = 'favoris-card-date';
  date.textContent = relativeDate(f.modifie_le);
  meta.append(name, date);
  link.append(media, meta);

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'favoris-card-more kit-btn kit-btn--icon';
  menuBtn.dataset.testid = `favoris-menu-${f.id}`;
  menuBtn.setAttribute('aria-label', 'Actions');
  menuBtn.setAttribute('aria-haspopup', 'menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.appendChild(icon('more', { size: 16 }));

  menuBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const items: MenuEntry[] = showingTrash
      ? [
          {
            id: 'restore',
            label: 'Restaurer',
            icon: 'rotateCcw',
            testId: `favoris-restore-${f.id}`,
            onSelect: () => {
              void restoreFavori(f.id);
            },
          },
        ]
      : [
          {
            id: 'open',
            label: 'Ouvrir',
            icon: 'folderOpen',
            testId: `favoris-menu-open-${f.id}`,
            onSelect: () => {
              window.location.href = cardHref(f);
            },
          },
          {
            id: 'viewer',
            label: 'Ouvrir en visionneuse',
            icon: 'eye',
            testId: `favoris-menu-viewer-${f.id}`,
            onSelect: () => {
              try {
                localStorage.removeItem('simulateur-chaussettes:dev');
              } catch {
                /* ignore */
              }
              window.location.href = cardHref(f);
            },
          },
          {
            id: 'copy',
            label: 'Copier le lien',
            icon: 'link',
            testId: `favoris-copy-${f.id}`,
            onSelect: () => {
              void (async () => {
                const url = new URL(cardHref(f), window.location.href).href;
                try {
                  await navigator.clipboard.writeText(url);
                  showToast({ message: 'Lien copié' });
                } catch {
                  setStatus(url);
                }
              })();
            },
          },
          {
            id: 'rename',
            label: 'Renommer',
            icon: 'pencil',
            testId: `favoris-rename-${f.id}`,
            onSelect: () => openRenameDialog(f),
          },
          { separator: true },
          {
            id: 'delete',
            label: 'Supprimer',
            icon: 'trash',
            danger: true,
            testId: `favoris-delete-${f.id}`,
            onSelect: () => {
              void withPassword(async (password) => {
                await apiWrite(
                  `/api/favoris/${encodeURIComponent(f.id)}`,
                  { method: 'DELETE' },
                  password,
                );
                lastDeletedId = f.id;
                window.clearTimeout(undoTimer);
                await loadList();
                showToast({
                  message: `« ${f.nom} » mis à la corbeille`,
                  durationMs: 5000,
                  testId: 'favoris-delete-toast',
                  action: {
                    label: 'Annuler',
                    testId: 'favoris-undo-delete',
                    onClick: () => {
                      void restoreFavori(f.id);
                    },
                  },
                });
                undoTimer = window.setTimeout(() => {
                  if (lastDeletedId === f.id) {
                    lastDeletedId = null;
                  }
                }, 5000);
              });
            },
          },
        ];
    openMenu({
      anchor: menuBtn,
      trigger: menuBtn,
      items,
      testId: `favoris-menu-popup-${f.id}`,
    });
  });

  card.append(link, menuBtn);
  return card;
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
    showToast({ message: 'Favori restauré' });
  });
}

filterInput.addEventListener('input', () => render());
sortSelect?.addEventListener('change', () => render());

trashBtn.addEventListener('click', () => {
  showingTrash = !showingTrash;
  trashBtn.textContent = showingTrash ? '← Favoris' : 'Corbeille';
  void loadList();
});

void loadList();
