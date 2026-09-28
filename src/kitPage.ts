/** Page de démonstration du kit UI (T90) — mode dev. */

import {
  ICON_NAMES,
  icon,
  kitButton,
  moreButton,
  openMenu,
  disclosure,
  showToast,
  openDialog,
  type MenuEntry,
} from './ui/kit';

const root = document.getElementById('app');
if (!root) throw new Error('#app manquant');

const title = document.createElement('h1');
title.textContent = 'Kit UI — César Bazaar';
const lead = document.createElement('p');
lead.className = 'lead';
lead.textContent =
  'Composants réutilisables (T90). Icônes Lucide (ISC). Un seul menu ouvert à la fois.';
root.append(title, lead);

function section(label: string, testId: string): HTMLElement {
  const s = document.createElement('section');
  s.dataset.testid = testId;
  const h = document.createElement('h2');
  h.textContent = label;
  s.appendChild(h);
  root!.appendChild(s);
  return s;
}

/* Tokens */
{
  const s = section('Couleurs', 'kit-section-colors');
  const row = document.createElement('div');
  row.className = 'kit-demo-swatches';
  const tokens: Array<{ name: string; varName: string; dark?: boolean }> = [
    { name: 'bg', varName: '--bg' },
    { name: 'surface', varName: '--surface' },
    { name: 'surface-2', varName: '--surface-2' },
    { name: 'ink', varName: '--ink', dark: true },
    { name: 'muted', varName: '--muted', dark: true },
    { name: 'accent', varName: '--accent', dark: true },
    { name: 'accent-soft', varName: '--accent-soft' },
    { name: 'danger', varName: '--danger', dark: true },
    { name: 'focus', varName: '--focus', dark: true },
  ];
  for (const t of tokens) {
    const sw = document.createElement('div');
    sw.className = `kit-demo-swatch${t.dark ? ' dark' : ''}`;
    sw.style.background = `var(${t.varName})`;
    sw.textContent = t.name;
    row.appendChild(sw);
  }
  s.appendChild(row);
}

/* Icônes */
{
  const s = section('Icônes', 'kit-section-icons');
  const grid = document.createElement('div');
  grid.className = 'kit-demo-icons';
  for (const name of ICON_NAMES) {
    const cell = document.createElement('div');
    cell.className = 'kit-demo-icon';
    cell.append(icon(name, { size: 18 }), document.createTextNode(name));
    grid.appendChild(cell);
  }
  s.appendChild(grid);
}

/* Boutons */
{
  const s = section('Boutons', 'kit-section-buttons');
  const row = document.createElement('div');
  row.className = 'kit-demo-row';
  row.append(
    kitButton({
      variant: 'primary',
      label: 'Favori',
      icon: 'star',
      testId: 'kit-btn-primary',
    }),
    kitButton({
      variant: 'ghost',
      label: 'Bibliothèque',
      icon: 'library',
      testId: 'kit-btn-ghost',
    }),
    kitButton({
      variant: 'icon',
      icon: 'undo',
      tooltip: 'Annuler',
      shortcut: 'Ctrl+Z',
      testId: 'kit-btn-undo',
      ariaLabel: 'Annuler',
    }),
    kitButton({
      variant: 'icon',
      icon: 'redo',
      tooltip: 'Rétablir',
      shortcut: 'Ctrl+Y',
      testId: 'kit-btn-redo',
      ariaLabel: 'Rétablir',
    }),
    kitButton({
      variant: 'ghost',
      label: 'Désactivé',
      disabled: true,
      testId: 'kit-btn-disabled',
    }),
    kitButton({
      variant: 'ghost',
      label: 'Supprimer',
      danger: true,
      icon: 'trash',
      testId: 'kit-btn-danger',
    }),
  );
  s.appendChild(row);
}

/* Menu */
{
  const s = section('Menu contextuel', 'kit-section-menu');
  const row = document.createElement('div');
  row.className = 'kit-demo-row';

  const itemsA = (): MenuEntry[] => [
    { id: 'open', label: 'Ouvrir', icon: 'folderOpen', onSelect: () => showToast({ message: 'Ouvrir' }) },
    { id: 'rename', label: 'Renommer', icon: 'pencil', shortcut: 'F2' },
    { separator: true },
    {
      id: 'delete',
      label: 'Supprimer',
      icon: 'trash',
      danger: true,
      onSelect: () => showToast({ message: '« Exemple » mis à la corbeille — Annuler', action: { label: 'Annuler', onClick: () => undefined, testId: 'kit-toast-undo' } }),
    },
  ];
  const itemsB = (): MenuEntry[] => [
    { id: 'copy', label: 'Copier le lien', icon: 'link', onSelect: () => showToast({ message: 'Lien copié' }) },
    { id: 'export', label: 'Exporter', icon: 'download' },
  ];

  const moreA = moreButton({ items: itemsA, testId: 'kit-more-a', menuTestId: 'kit-menu' });
  const moreB = moreButton({ items: itemsB, testId: 'kit-more-b', menuTestId: 'kit-menu' });
  const ctx = kitButton({
    variant: 'ghost',
    label: 'Clic droit ici',
    testId: 'kit-menu-context-target',
  });
  ctx.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openMenu({
      anchor: { clientX: event.clientX, clientY: event.clientY },
      items: itemsA(),
      testId: 'kit-menu',
    });
  });

  row.append(moreA, moreB, ctx);
  const hint = document.createElement('p');
  hint.className = 'lead';
  hint.style.margin = '12px 0 0';
  hint.textContent = 'Un seul menu ouvert. Échap ou clic dehors pour fermer.';
  s.append(row, hint);
}

/* Disclosure */
{
  const s = section('Disclosure', 'kit-section-disclosure');
  const content = document.createElement('div');
  content.textContent = 'Format 20 × 20 · 4 variations · pastilles du nuancier.';
  s.appendChild(
    disclosure({
      label: 'Infos collection',
      content,
      testId: 'kit-disclosure',
    }),
  );
}

/* Toast + dialog */
{
  const s = section('Toast et fenêtre', 'kit-section-overlays');
  const row = document.createElement('div');
  row.className = 'kit-demo-row';
  row.append(
    kitButton({
      variant: 'ghost',
      label: 'Toast « Lien copié »',
      testId: 'kit-toast-trigger',
      onClick: () => showToast({ message: 'Lien copié', testId: 'kit-toast' }),
    }),
    kitButton({
      variant: 'primary',
      label: 'Ouvrir une fenêtre',
      testId: 'kit-dialog-trigger',
      onClick: () => {
        const body = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = 'Mon modèle';
        input.dataset.testid = 'kit-dialog-input';
        input.style.width = '100%';
        input.style.font = 'inherit';
        input.style.padding = '8px';
        input.style.border = '1px solid var(--line)';
        input.style.borderRadius = '6px';
        body.appendChild(input);
        openDialog({
          title: 'Renommer',
          body,
          testId: 'kit-dialog',
          actions: [
            { label: 'Annuler', variant: 'ghost', testId: 'kit-dialog-cancel' },
            {
              label: 'Enregistrer',
              variant: 'primary',
              testId: 'kit-dialog-ok',
              onClick: () => {
                showToast({ message: `Renommé : ${input.value}` });
              },
            },
          ],
        });
        window.setTimeout(() => {
          input.focus();
          input.select();
        }, 0);
      },
    }),
  );
  s.appendChild(row);
}
