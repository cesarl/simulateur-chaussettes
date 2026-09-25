import { fixtureUrl, loadTileFromFile, loadTileFromUrl } from '../io/tiles';
import { getState, subscribe, update } from '../state';
import type { TileAsset } from '../core/types';

const thumbs = new Map<string, string>();

function thumbUrl(tile: TileAsset): string {
  const cached = thumbs.get(tile.id);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = tile.width;
  canvas.height = tile.height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const copy = new Uint8ClampedArray(tile.rgba);
  context.putImageData(new ImageData(copy, tile.width, tile.height), 0, 0);
  const url = canvas.toDataURL('image/png');
  thumbs.set(tile.id, url);
  return url;
}

async function importFiles(files: readonly File[]): Promise<void> {
  const loaded: TileAsset[] = [];
  const messages: string[] = [];
  for (const file of files) {
    try {
      loaded.push(await loadTileFromFile(file));
    } catch (error) {
      messages.push(error instanceof Error ? error.message : 'Import impossible.');
    }
  }
  if (loaded.length > 0) {
    update({ tiles: [...getState().tiles, ...loaded], error: messages[0] ?? null });
    return;
  }
  if (messages[0]) update({ error: messages[0] });
}

function moveTile(id: string, delta: number): void {
  const tiles = [...getState().tiles];
  const index = tiles.findIndex((tile) => tile.id === id);
  const target = index + delta;
  const current = tiles[index];
  const other = tiles[target];
  if (!current || !other || target < 0 || target >= tiles.length) return;
  tiles[index] = other;
  tiles[target] = current;
  update({ tiles, error: null });
}

function renderTiles(list: HTMLElement, empty: HTMLElement): void {
  const { tiles } = getState();
  list.replaceChildren();
  empty.hidden = tiles.length > 0;
  for (const tile of tiles) {
    const item = document.createElement('li');
    item.className = 'tile';

    const image = document.createElement('img');
    image.src = thumbUrl(tile);
    image.alt = tile.name;
    image.dataset.testid = 'tile-thumb';
    item.appendChild(image);

    const body = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'tile-name';
    name.dataset.testid = 'tile-name';
    name.textContent = tile.name;
    body.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'tile-actions';
    actions.append(
      actionButton('Monter', 'tile-up', () => moveTile(tile.id, -1)),
      actionButton('Descendre', 'tile-down', () => moveTile(tile.id, 1)),
      actionButton('Supprimer', 'tile-remove', () => {
        update({ tiles: getState().tiles.filter((entry) => entry.id !== tile.id), error: null });
      }),
    );
    body.appendChild(actions);
    item.appendChild(body);
    list.appendChild(item);
  }
}

function actionButton(label: string, testId: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.testid = testId;
  button.addEventListener('click', onClick);
  return button;
}

/** Section Carreaux : import, vignettes, ordre, exemple. */
export function mountPanel(panel: HTMLElement): void {
  const body = panel.querySelector('#panel-body');
  const host = body instanceof HTMLElement ? body : panel;

  const section = document.createElement('section');
  section.className = 'section';
  section.dataset.testid = 'section-tiles';

  const title = document.createElement('h2');
  title.textContent = 'Carreaux';
  section.appendChild(title);

  const drop = document.createElement('div');
  drop.className = 'drop';
  drop.dataset.testid = 'tile-drop';

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'PNG ou SVG. Glissez les fichiers sur le panneau, ou importez-les.';
  drop.appendChild(hint);

  const controls = document.createElement('div');
  controls.className = 'row';

  const file = document.createElement('input');
  file.type = 'file';
  file.className = 'file-input';
  file.accept = '.png,.svg,image/png,image/svg+xml';
  file.multiple = true;
  file.dataset.testid = 'tile-file';
  file.addEventListener('change', () => {
    const files = [...(file.files ?? [])];
    file.value = '';
    if (files.length > 0) void importFiles(files);
  });

  const importButton = actionButton('Importer', 'tile-import', () => file.click());
  const exampleButton = actionButton('Charger un exemple', 'tile-fixture', () => {
    void loadTileFromUrl(fixtureUrl('carreau-test-etoile'))
      .then((tile) => update({ tiles: [...getState().tiles, tile], error: null }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Impossible de charger l’exemple.';
        update({ error: message });
      });
  });

  controls.append(importButton, exampleButton, file);
  drop.appendChild(controls);
  section.appendChild(drop);

  const error = document.createElement('p');
  error.className = 'tile-error';
  error.dataset.testid = 'tile-error';
  error.hidden = true;
  section.appendChild(error);

  const empty = document.createElement('p');
  empty.className = 'hint';
  empty.dataset.testid = 'tile-empty';
  empty.textContent = 'Aucun carreau pour l’instant.';
  section.appendChild(empty);

  const list = document.createElement('ul');
  list.className = 'tile-list';
  list.dataset.testid = 'tile-list';
  section.appendChild(list);
  host.appendChild(section);

  const render = (): void => {
    const message = getState().error;
    error.hidden = !message;
    error.textContent = message ?? '';
    renderTiles(list, empty);
  };
  subscribe(render);
  render();

  panel.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('over');
  });
  panel.addEventListener('dragleave', () => drop.classList.remove('over'));
  panel.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('over');
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) void importFiles(files);
  });
}
