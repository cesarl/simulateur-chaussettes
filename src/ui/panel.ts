import type { FabricationReport } from '../core/checks';
import { nearestFittingWidth, tileRowsForWidth } from '../core/layout';
import { clampLegRows, defaultDimensions, SIZE_PRESETS, stitchAspect, totalRows } from '../core/sizes';
import type { ExportRequest, FlatKind } from '../io/exportPng';
import { fixtureUrl, loadTileFromFile, loadTileFromUrl } from '../io/tiles';
import { VIEW_ANGLES, type ViewId } from '../render/views';
import { getState, subscribe, update } from '../state';
import type { Hex, LayoutKind, QuantizeSettings, SizeId, SockDesign, TileAsset } from '../core/types';
import {
  details,
  makeCheckbox,
  makeColor,
  makeSelect,
  makeSliderNumber,
} from './controls';

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

export interface PanelActions {
  exportImages: (request: ExportRequest) => Promise<void>;
  saveProject: () => Promise<void>;
  openProject: (text: string) => Promise<void>;
}

/** Section Carreaux : import, vignettes, ordre, exemple. */
export function mountPanel(panel: HTMLElement, actions: PanelActions): void {
  const body = panel.querySelector('#panel-body');
  const host = body instanceof HTMLElement ? body : panel;

  const section = details('Carreaux', 'section-tiles');

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
  empty.textContent =
    'Bienvenue. Chargez un exemple ou importez un carreau PNG/SVG pour commencer le motif.';
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

  mountSettings(host, actions);
}

const LAYOUT_OPTIONS: { value: LayoutKind; label: string }[] = [
  { value: 'grille', label: 'Grille droite' },
  { value: 'quinconce-h', label: 'Quinconce horizontal' },
  { value: 'quinconce-v', label: 'Quinconce vertical' },
  { value: 'rotation-4', label: 'Rotation ×4' },
  { value: 'miroir-4', label: 'Miroirs ×4' },
  { value: 'damier', label: 'Damier' },
  { value: 'rotation-aleatoire', label: 'Rotation aléatoire' },
];

const MANUAL_SEED: Hex[] = ['#1f3a5f', '#b5462f', '#f4f1ea', '#1d1d1b'];

let legWarned = false;
let computeMs: HTMLElement | null = null;
let seamStatus: HTMLElement | null = null;
let swatches: HTMLElement | null = null;

export function renderStatus(info: {
  ms: number;
  patternPalette: readonly string[];
  patternCounts: readonly number[];
  mismatch: number;
}): void {
  if (computeMs) computeMs.textContent = `Dernier calcul : ${Math.round(info.ms)} ms`;
  if (seamStatus) {
    seamStatus.textContent = info.mismatch === 0
      ? 'Le motif tombe juste.'
      : `Décalage de ${info.mismatch} mailles au dos.`;
  }
  if (!swatches) return;
  swatches.replaceChildren();
  if (info.patternPalette.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Aucune couleur de motif.';
    swatches.appendChild(empty);
    return;
  }
  info.patternPalette.forEach((color, index) => {
    const item = document.createElement('span');
    item.className = 'swatch';
    const chip = document.createElement('i');
    chip.style.background = color;
    const label = document.createElement('span');
    label.textContent = `${color} · ${info.patternCounts[index] ?? 0}`;
    item.append(chip, label);
    swatches?.appendChild(item);
  });
}

function pill(testId: string): HTMLElement {
  const item = document.createElement('p');
  item.className = 'pill';
  item.dataset.testid = testId;
  item.textContent = '…';
  return item;
}

function paintPill(testId: string, ok: boolean, text: string): void {
  const item = document.querySelector(`[data-testid="${testId}"]`);
  if (!(item instanceof HTMLElement)) return;
  item.className = ok ? 'pill ok' : 'pill warn';
  item.textContent = text;
}

export function renderChecks(report: FabricationReport): void {
  paintPill(
    'check-colors',
    report.totalOk,
    `Couleurs : ${report.totalColors} / ${report.maxColorsTotal}`,
  );
  paintPill(
    'check-rows',
    report.rowsOk,
    report.rowsOk
      ? `Rangs : au plus ${report.maxColorsPerRow} couleurs`
      : `Rangs : ${report.rowsOver} au-dessus de ${report.maxColorsPerRow}`,
  );
  paintPill(
    'check-floats',
    report.floatsOk,
    report.floatsOk ? `Flottés : aucun au-dessus de ${report.maxFloat}` : `Flottés : ${report.floatCount}`,
  );
  paintPill(
    'check-seam',
    report.seamOk,
    report.seamOk ? 'Raccord : le motif tombe juste' : `Raccord : décalage de ${report.seamMismatch} mailles`,
  );
}

function isViewId(value: string): value is ViewId {
  return VIEW_ANGLES.some((view) => view.id === value);
}

function isExportSize(value: string): value is '1024' | '2048' | '4096' {
  return value === '1024' || value === '2048' || value === '4096';
}

function mountExportControls(section: HTMLElement, actions: PanelActions): void {
  const selected = new Map<ViewId, HTMLInputElement>();
  for (const view of VIEW_ANGLES) {
    const box = makeCheckbox(view.label, view.testId, view.id === 'face', () => {});
    selected.set(view.id, box.input);
    section.appendChild(box.root);
  }
  const exact = makeCheckbox('Plat exact', 'export-plat-exact', false, () => {});
  const readable = makeCheckbox('Plat lisible', 'export-plat-lisible', false, () => {});
  const bmp = makeCheckbox('BMP indexé (1 px = 1 maille)', 'export-bmp', false, () => {});
  const board = makeCheckbox('Planche (4 vues + grille)', 'export-board', false, () => {});
  const pair = makeCheckbox('Paire (droite + gauche)', 'export-paire', false, () => {});
  const size = makeSelect(
    'Taille des vues 3D',
    'export-size',
    [
      { value: '1024', label: '1024 px' },
      { value: '2048', label: '2048 px' },
      { value: '4096', label: '4096 px' },
    ],
    '2048',
    () => {},
  );
  const background = makeColor('Fond', 'export-bg', '#ecebe8', () => {});
  const transparent = makeCheckbox('Fond transparent', 'export-transparent', false, () => {});
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'export-run';
  button.textContent = 'Exporter';
  const status = document.createElement('p');
  status.className = 'hint';
  status.dataset.testid = 'export-status';
  button.addEventListener('click', () => {
    const views: ViewId[] = [];
    for (const [id, input] of selected) {
      if (input.checked && isViewId(id)) views.push(id);
    }
    const flats: FlatKind[] = [];
    if (exact.input.checked) flats.push('exact');
    if (readable.input.checked) flats.push('lisible');
    const pixelSize = isExportSize(size.input.value) ? size.input.value : '2048';
    const sizes = { '1024': 1024, '2048': 2048, '4096': 4096 } as const;
    status.textContent = 'Export en cours…';
    void actions
      .exportImages({
        views,
        flats,
        size: sizes[pixelSize],
        background: background.input.value,
        transparent: transparent.input.checked,
        bmp: bmp.input.checked,
        board: board.input.checked,
        pair: pair.input.checked,
      })
      .then(() => {
        status.textContent = 'Export terminé.';
      })
      .catch((error: unknown) => {
        status.textContent = error instanceof Error ? error.message : 'Export impossible.';
      });
  });
  const save = document.createElement('button');
  save.type = 'button';
  save.dataset.testid = 'project-save';
  save.textContent = 'Enregistrer le projet';
  const open = document.createElement('button');
  open.type = 'button';
  open.dataset.testid = 'project-open';
  open.textContent = 'Ouvrir un projet';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.className = 'file-input';
  file.dataset.testid = 'project-file';
  const projectError = document.createElement('p');
  projectError.className = 'tile-error';
  projectError.dataset.testid = 'project-error';
  projectError.hidden = true;
  save.addEventListener('click', () => {
    projectError.hidden = true;
    void actions.saveProject().catch((error: unknown) => {
      projectError.hidden = false;
      projectError.textContent = error instanceof Error ? error.message : 'Enregistrement impossible.';
    });
  });
  open.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    void chosen.text().then((text) => actions.openProject(text)).then(() => {
      projectError.hidden = true;
    }).catch((error: unknown) => {
      projectError.hidden = false;
      projectError.textContent = error instanceof Error ? error.message : 'Ouverture impossible.';
    });
  });
  section.append(
    exact.root,
    readable.root,
    bmp.root,
    board.root,
    pair.root,
    size.root,
    background.root,
    transparent.root,
    button,
    status,
    save,
    open,
    file,
    projectError,
  );
}

function isLayoutKind(value: string): value is LayoutKind {
  return LAYOUT_OPTIONS.some((option) => option.value === value);
}

function isSize(value: string): value is SizeId {
  return value === 'homme' || value === 'femme';
}

function showLegMessage(size: SizeId, message: HTMLElement): void {
  const max = SIZE_PRESETS[size].legRowsMax;
  message.hidden = !legWarned;
  message.textContent = legWarned ? `La tige ne peut pas dépasser ${max} rangs.` : '';
}

function mountSettings(host: HTMLElement, actions: PanelActions): void {
  const design = getState().design;
  let keepRatio = true;
  let paletteKey = '';

  const layout = details('Calepinage', 'section-layout');
  const kind = makeSelect(
    'Calepinage',
    'ctl-layout-kind',
    LAYOUT_OPTIONS,
    design.layout.kind,
    (value) => {
      if (!isLayoutKind(value)) return;
      update({ design: { layout: { kind: value } } });
    },
    'Façon d’assembler les carreaux sur la chaussette : grille droite, quinconce (comme des briques), rotations, miroirs…',
  );
  const tileWidth = makeSliderNumber({
    label: 'Largeur du carreau',
    testId: 'ctl-tile-width',
    min: 4,
    max: 200,
    step: 1,
    value: design.layout.tileStitches,
    unit: 'mailles',
    help: 'Nombre de mailles (aiguilles) que fait un motif sur le tour de jambe.',
    onChange: (value) => {
      const tileStitches = Math.max(1, Math.round(value));
      const next: { tileStitches: number; tileRows?: number } = { tileStitches };
      if (keepRatio) next.tileRows = tileRowsForWidth(tileStitches, stitchAspect(getState().design.dimensions));
      update({ design: { layout: next } });
    },
  });
  const tileRows = makeSliderNumber({
    label: 'Hauteur du carreau',
    testId: 'ctl-tile-rows',
    min: 4,
    max: 300,
    step: 1,
    value: design.layout.tileRows,
    unit: 'rangs',
    help: 'Nombre de rangs (lignes tricotées) d’un motif. Un rang = un tour de cylindre.',
    onChange: (value) => {
      keepRatio = false;
      keepBox.input.checked = false;
      update({ design: { layout: { tileRows: Math.max(1, Math.round(value)) } } });
    },
  });
  const keepBox = makeCheckbox(
    'Garder les proportions',
    'ctl-keep-ratio',
    true,
    (checked) => {
      keepRatio = checked;
      if (!checked) return;
      const current = getState().design;
      update({
        design: {
          layout: {
            tileRows: tileRowsForWidth(current.layout.tileStitches, stitchAspect(current.dimensions)),
          },
        },
      });
    },
    'Recalcule la hauteur pour qu’un carreau carré reste carré à la jauge actuelle.',
  );
  const gapStitches = makeSliderNumber({
    label: 'Joint horizontal',
    testId: 'ctl-gap-stitches',
    min: 0,
    max: 32,
    step: 1,
    value: design.layout.gapStitches,
    unit: 'mailles',
    help: 'Bande unie entre deux carreaux sur le tour (0 = carreaux collés).',
    onChange: (value) => update({ design: { layout: { gapStitches: Math.max(0, Math.round(value)) } } }),
  });
  const gapRows = makeSliderNumber({
    label: 'Joint vertical',
    testId: 'ctl-gap-rows',
    min: 0,
    max: 32,
    step: 1,
    value: design.layout.gapRows,
    unit: 'rangs',
    help: 'Bande unie entre deux rangées de carreaux.',
    onChange: (value) => update({ design: { layout: { gapRows: Math.max(0, Math.round(value)) } } }),
  });
  const gapColor = makeColor(
    'Couleur du joint',
    'ctl-gap-color',
    design.layout.gapColor,
    (value) => {
      update({ design: { layout: { gapColor: value } } });
    },
    'Couleur du fil utilisé pour les joints entre carreaux.',
  );
  const rotation = makeSelect(
    'Rotation',
    'ctl-rotation',
    [
      { value: '0', label: '0°' },
      { value: '90', label: '90°' },
      { value: '180', label: '180°' },
      { value: '270', label: '270°' },
    ],
    String(design.layout.rotation),
    (value) => {
      const angle = value === '90' || value === '180' || value === '270' ? Number(value) : 0;
      update({ design: { layout: { rotation: angle as 0 | 90 | 180 | 270 } } });
    },
  );
  const offsetX = makeSliderNumber({
    label: 'Décalage horizontal',
    testId: 'ctl-offset-stitches',
    min: -200,
    max: 200,
    step: 1,
    value: design.layout.offsetStitches,
    unit: 'mailles',
    onChange: (value) => update({ design: { layout: { offsetStitches: Math.round(value) } } }),
  });
  const offsetY = makeSliderNumber({
    label: 'Décalage vertical',
    testId: 'ctl-offset-rows',
    min: -200,
    max: 200,
    step: 1,
    value: design.layout.offsetRows,
    unit: 'rangs',
    onChange: (value) => update({ design: { layout: { offsetRows: Math.round(value) } } }),
  });
  const seed = makeSliderNumber({
    label: 'Graine',
    testId: 'ctl-seed',
    min: 1,
    max: 9999,
    step: 1,
    value: design.layout.seed,
    onChange: (value) => update({ design: { layout: { seed: Math.max(1, Math.round(value)) } } }),
  });
  seamStatus = document.createElement('p');
  seamStatus.className = 'hint';
  seamStatus.dataset.testid = 'seam-status';
  seamStatus.textContent = 'Le motif tombe juste.';
  const fit = document.createElement('button');
  fit.type = 'button';
  fit.dataset.testid = 'ctl-fit-width';
  fit.textContent = 'Ajuster la largeur';
  fit.addEventListener('click', () => {
    const current = getState().design;
    const tileStitches = nearestFittingWidth(current.layout, current.dimensions.needles);
    const next: { tileStitches: number; tileRows?: number } = { tileStitches };
    if (keepRatio) next.tileRows = tileRowsForWidth(tileStitches, stitchAspect(current.dimensions));
    update({ design: { layout: next } });
  });
  layout.append(
    kind.root,
    tileWidth.root,
    tileRows.root,
    keepBox.root,
    gapStitches.root,
    gapRows.root,
    gapColor.root,
    rotation.root,
    offsetX.root,
    offsetY.root,
    seed.root,
    seamStatus,
    fit,
  );

  const dimensions = details('Dimensions', 'section-dimensions');
  const size = makeSelect(
    'Taille',
    'ctl-size',
    [
      { value: 'homme', label: 'Homme' },
      { value: 'femme', label: 'Femme' },
    ],
    design.dimensions.size,
    (value) => {
      if (!isSize(value)) return;
      legWarned = false;
      update({ design: { dimensions: defaultDimensions(value) } });
    },
    'Préréglage d’aiguilles et de rangs (valeurs fabricant). Change toute la chaussette.',
  );
  const legMessage = document.createElement('p');
  legMessage.className = 'leg-message';
  legMessage.dataset.testid = 'ctl-leg-message';
  legMessage.hidden = true;
  const leg = makeSliderNumber({
    label: 'Tige',
    testId: 'ctl-leg-rows',
    min: 1,
    max: SIZE_PRESETS[design.dimensions.size].legRowsMax,
    step: 1,
    value: design.dimensions.legRows,
    unit: 'rangs',
    help: 'Hauteur de la jambe (zone motif). On peut raccourcir, pas allonger au-delà du max.',
    onChange: (value) => {
      const currentSize = getState().design.dimensions.size;
      const max = SIZE_PRESETS[currentSize].legRowsMax;
      legWarned = value > max;
      const clamped = clampLegRows(currentSize, value);
      leg.setValue(clamped, true);
      showLegMessage(currentSize, legMessage);
      update({ design: { dimensions: { legRows: clamped } } });
    },
  });
  leg.input.removeAttribute('max');
  const needles = makeSliderNumber({
    label: 'Aiguilles',
    testId: 'ctl-needles',
    min: 8,
    max: 480,
    step: 1,
    value: design.dimensions.needles,
    unit: 'mailles',
    onChange: (value) => update({ design: { dimensions: { needles: Math.max(1, Math.round(value)) } } }),
  });
  const heelRows = makeSliderNumber({
    label: 'Talon',
    testId: 'ctl-heel-rows',
    min: 1,
    max: 200,
    step: 1,
    value: design.dimensions.heelRows,
    unit: 'rangs',
    onChange: (value) => update({ design: { dimensions: { heelRows: Math.max(1, Math.round(value)) } } }),
  });
  const footRows = makeSliderNumber({
    label: 'Pied',
    testId: 'ctl-foot-rows',
    min: 1,
    max: 400,
    step: 1,
    value: design.dimensions.footRows,
    unit: 'rangs',
    onChange: (value) => update({ design: { dimensions: { footRows: Math.max(1, Math.round(value)) } } }),
  });
  const toeRows = makeSliderNumber({
    label: 'Pointe',
    testId: 'ctl-toe-rows',
    min: 1,
    max: 200,
    step: 1,
    value: design.dimensions.toeRows,
    unit: 'rangs',
    onChange: (value) => update({ design: { dimensions: { toeRows: Math.max(1, Math.round(value)) } } }),
  });
  const stitches = makeSliderNumber({
    label: 'Jauge',
    testId: 'ctl-stitches-per-cm',
    min: 1,
    max: 30,
    step: 0.1,
    value: design.dimensions.stitchesPerCm,
    unit: 'mailles/cm',
    onChange: (value) => {
      const stitchesPerCm = Math.max(0.1, value);
      const current = getState().design;
      const next = { ...current.dimensions, stitchesPerCm };
      const layoutPatch = keepRatio
        ? { tileRows: tileRowsForWidth(current.layout.tileStitches, stitchAspect(next)) }
        : {};
      update({ design: { dimensions: { stitchesPerCm }, layout: layoutPatch } });
    },
  });
  const rowsPerCm = makeSliderNumber({
    label: 'Jauge verticale',
    testId: 'ctl-rows-per-cm',
    min: 1,
    max: 40,
    step: 0.1,
    value: design.dimensions.rowsPerCm,
    unit: 'rangs/cm',
    onChange: (value) => {
      const nextRows = Math.max(0.1, value);
      const current = getState().design;
      const next = { ...current.dimensions, rowsPerCm: nextRows };
      const layoutPatch = keepRatio
        ? { tileRows: tileRowsForWidth(current.layout.tileStitches, stitchAspect(next)) }
        : {};
      update({ design: { dimensions: { rowsPerCm: nextRows }, layout: layoutPatch } });
    },
  });
  const sizeCm = document.createElement('p');
  sizeCm.className = 'hint';
  sizeCm.dataset.testid = 'size-cm';
  dimensions.append(
    size.root,
    leg.root,
    legMessage,
    heelRows.root,
    footRows.root,
    toeRows.root,
    needles.root,
    stitches.root,
    rowsPerCm.root,
    sizeCm,
  );

  const pixels = details('Gros pixels', 'section-pixels');
  const sampling = makeSelect(
    'Échantillonnage',
    'ctl-sampling',
    [
      { value: 'majoritaire', label: 'Couleur majoritaire' },
      { value: 'moyenne', label: 'Couleur moyenne' },
    ],
    design.quantize.sampling,
    (value) => {
      if (value !== 'majoritaire' && value !== 'moyenne') return;
      update({ design: { quantize: { sampling: value } } });
    },
    'Comment choisir la couleur d’une maille à partir du carreau : la plus fréquente (net) ou la moyenne (plus doux).',
  );
  const maxColors = makeSliderNumber({
    label: 'Couleurs du motif',
    testId: 'ctl-max-colors',
    min: 2,
    max: 8,
    step: 1,
    value: design.quantize.maxColors,
    help: 'Nombre max de fils pour le motif (hors bord-côte, talon, pointe). La machine a une limite.',
    onChange: (value) => update({ design: { quantize: { maxColors: Math.round(value) } } }),
  });
  const paletteMode = makeSelect(
    'Palette',
    'ctl-palette-mode',
    [
      { value: 'auto', label: 'Automatique' },
      { value: 'manuelle', label: 'Manuelle' },
    ],
    design.quantize.paletteMode,
    (value) => {
      if (value !== 'auto' && value !== 'manuelle') return;
      const quantizePatch: Partial<QuantizeSettings> = { paletteMode: value };
      if (value === 'manuelle' && getState().design.quantize.palette.length === 0) {
        quantizePatch.palette = [...MANUAL_SEED];
      }
      update({ design: { quantize: quantizePatch } });
    },
    'Automatique : l’outil choisit les fils. Manuelle : vous imposez les couleurs du fabricant.',
  );
  const despeckle = makeCheckbox(
    'Nettoyer les mailles isolées',
    'ctl-despeckle',
    design.quantize.despeckle,
    (checked) => {
      update({ design: { quantize: { despeckle: checked } } });
    },
    'Remplace une maille seule entourée d’une autre couleur — évite les points parasites.',
  );
  const manual = document.createElement('div');
  manual.dataset.testid = 'ctl-palette-manual';
  swatches = document.createElement('div');
  swatches.className = 'swatches';
  swatches.dataset.testid = 'pattern-palette';
  pixels.append(sampling.root, maxColors.root, paletteMode.root, despeckle.root, manual, swatches);

  const zones = details('Zones', 'section-zones');
  const cuff = makeCheckbox(
    'Bord-côte',
    'ctl-cuff-enabled',
    design.zones.cuffEnabled,
    (checked) => {
      update({ design: { zones: { cuffEnabled: checked } } });
    },
    'Bande élastique en haut de la chaussette, sans motif jacquard.',
  );
  const cuffRows = makeSliderNumber({
    label: 'Hauteur du bord-côte',
    testId: 'ctl-cuff-rows',
    min: 0,
    max: 80,
    step: 1,
    value: design.dimensions.cuffRows,
    unit: 'rangs',
    onChange: (value) => update({ design: { dimensions: { cuffRows: Math.max(0, Math.round(value)) } } }),
  });
  const cuffColor = makeColor('Couleur du bord-côte', 'ctl-cuff-color', design.zones.cuffColor, (value) => {
    update({ design: { zones: { cuffColor: value } } });
  });
  const heelColor = makeColor('Couleur du talon', 'ctl-heel-color', design.zones.heelColor, (value) => {
    update({ design: { zones: { heelColor: value } } });
  });
  const heelHelp =
    'Aperçu seulement : la taille réelle du talon dépend du tricotage (rangs de talon), à valider avec le fabricant.';
  const heelHeight = makeSliderNumber({
    label: 'Hauteur du talon',
    testId: 'ctl-heel-height',
    min: 25,
    max: 110,
    step: 1,
    value: design.zones.heelHeightMm,
    unit: 'mm',
    help: heelHelp,
    onChange: (value) =>
      update({ design: { zones: { heelHeightMm: Math.min(110, Math.max(25, Math.round(value))) } } }),
  });
  const heelDepth = makeSliderNumber({
    label: 'Profondeur sous le pied',
    testId: 'ctl-heel-depth',
    min: 40,
    max: 130,
    step: 1,
    value: design.zones.heelDepthMm,
    unit: 'mm',
    help: heelHelp,
    onChange: (value) =>
      update({ design: { zones: { heelDepthMm: Math.min(130, Math.max(40, Math.round(value))) } } }),
  });
  const heelSpread = makeSliderNumber({
    label: 'Largeur du talon',
    testId: 'ctl-heel-spread',
    min: 50,
    max: 100,
    step: 1,
    value: design.zones.heelSpread,
    unit: '%',
    help: heelHelp,
    onChange: (value) =>
      update({ design: { zones: { heelSpread: Math.min(100, Math.max(50, Math.round(value))) } } }),
  });
  const toeColor = makeColor('Couleur de la pointe', 'ctl-toe-color', design.zones.toeColor, (value) => {
    update({ design: { zones: { toeColor: value } } });
  });
  const patternFoot = makeCheckbox('Motif sur le pied', 'ctl-pattern-foot', design.zones.patternOnFoot, (checked) => {
    update({ design: { zones: { patternOnFoot: checked } } });
  });
  const footColor = makeColor('Couleur du pied', 'ctl-foot-color', design.zones.footColor, (value) => {
    update({ design: { zones: { footColor: value } } });
  });
  zones.append(
    cuff.root,
    cuffRows.root,
    cuffColor.root,
    heelColor.root,
    heelHeight.root,
    heelDepth.root,
    heelSpread.root,
    toeColor.root,
    patternFoot.root,
    footColor.root,
  );

  const fidelity = makeSelect(
    'Rendu des mailles',
    'ctl-knit-fidelity',
    [
      { value: 'simple', label: 'Rendu simple' },
      { value: 'fidele', label: 'Rendu fidèle' },
    ],
    getState().knitFidelity,
    (value) => {
      if (value === 'simple' || value === 'fidele') update({ knitFidelity: value });
    },
    'Fidèle : les frontières de couleur suivent le V du jersey. Simple : pixels droits (plus net pour contrôler le motif).',
  );
  const footSide = makeSelect(
    'Pied',
    'ctl-foot-side',
    [
      { value: 'droite', label: 'Droit' },
      { value: 'gauche', label: 'Gauche' },
    ],
    getState().footSide,
    (value) => {
      if (value === 'droite' || value === 'gauche') update({ footSide: value });
    },
    'Chaussette droite ou gauche (miroir de la forme 3D).',
  );
  zones.appendChild(fidelity.root);
  zones.appendChild(footSide.root);

  const checks = details('Contrôles', 'section-checks');
  checks.append(
    pill('check-colors'),
    pill('check-rows'),
    pill('check-floats'),
    pill('check-seam'),
  );
  const fitSeam = document.createElement('button');
  fitSeam.type = 'button';
  fitSeam.dataset.testid = 'ctl-fit-seam';
  fitSeam.textContent = 'Ajuster la largeur pour que le motif tombe juste';
  fitSeam.addEventListener('click', () => {
    const current = getState().design;
    const tileStitches = nearestFittingWidth(current.layout, current.dimensions.needles);
    const next: { tileStitches: number; tileRows?: number } = { tileStitches };
    if (keepRatio) next.tileRows = tileRowsForWidth(tileStitches, stitchAspect(current.dimensions));
    update({ design: { layout: next } });
  });
  checks.appendChild(fitSeam);

  const exportsSection = details('Exports', 'section-exports');
  mountExportControls(exportsSection, actions);

  computeMs = document.createElement('p');
  computeMs.className = 'hint compute-ms';
  computeMs.dataset.testid = 'compute-ms';
  computeMs.textContent = 'Dernier calcul : —';

  host.append(layout, dimensions, pixels, zones, checks, exportsSection, computeMs);

  const syncManual = (current: SockDesign): void => {
    const isManual = current.quantize.paletteMode === 'manuelle';
    manual.hidden = !isManual;
    const key = current.quantize.palette.join(',');
    if (!isManual || key === paletteKey || manual.contains(document.activeElement)) return;
    paletteKey = key;
    manual.replaceChildren();
    current.quantize.palette.forEach((color, index) => {
      const picker = makeColor(`Fil ${index + 1}`, `ctl-palette-${index}`, color, (value) => {
        const next = [...getState().design.quantize.palette];
        next[index] = value.toLowerCase();
        paletteKey = '';
        update({ design: { quantize: { palette: next } } });
      });
      manual.appendChild(picker.root);
    });
  };

  const sync = (current: SockDesign): void => {
    kind.input.value = current.layout.kind;
    tileWidth.setValue(current.layout.tileStitches);
    tileRows.setValue(current.layout.tileRows);
    keepBox.input.checked = keepRatio;
    gapStitches.setValue(current.layout.gapStitches);
    gapRows.setValue(current.layout.gapRows);
    if (document.activeElement !== gapColor.input) gapColor.input.value = current.layout.gapColor;
    rotation.input.value = String(current.layout.rotation);
    offsetX.setValue(current.layout.offsetStitches);
    offsetY.setValue(current.layout.offsetRows);
    seed.setValue(current.layout.seed);
    size.input.value = current.dimensions.size;
    leg.setRange(1, SIZE_PRESETS[current.dimensions.size].legRowsMax);
    leg.input.removeAttribute('max');
    leg.setValue(current.dimensions.legRows);
    showLegMessage(current.dimensions.size, legMessage);
    needles.setValue(current.dimensions.needles);
    heelRows.setValue(current.dimensions.heelRows);
    footRows.setValue(current.dimensions.footRows);
    toeRows.setValue(current.dimensions.toeRows);
    stitches.setValue(current.dimensions.stitchesPerCm);
    rowsPerCm.setValue(current.dimensions.rowsPerCm);
    const tour = current.dimensions.needles / current.dimensions.stitchesPerCm;
    const height = totalRows(current.dimensions, current.zones.cuffEnabled) / current.dimensions.rowsPerCm;
    sizeCm.textContent = `Tour ${tour.toFixed(1)} cm · hauteur ${height.toFixed(1)} cm`;
    sampling.input.value = current.quantize.sampling;
    maxColors.setValue(current.quantize.maxColors);
    paletteMode.input.value = current.quantize.paletteMode;
    despeckle.input.checked = current.quantize.despeckle;
    syncManual(current);
    cuff.input.checked = current.zones.cuffEnabled;
    cuffRows.setValue(current.dimensions.cuffRows);
    if (document.activeElement !== cuffColor.input) cuffColor.input.value = current.zones.cuffColor;
    if (document.activeElement !== heelColor.input) heelColor.input.value = current.zones.heelColor;
    heelHeight.setValue(current.zones.heelHeightMm);
    heelDepth.setValue(current.zones.heelDepthMm);
    heelSpread.setValue(current.zones.heelSpread);
    if (document.activeElement !== toeColor.input) toeColor.input.value = current.zones.toeColor;
    patternFoot.input.checked = current.zones.patternOnFoot;
    if (document.activeElement !== footColor.input) footColor.input.value = current.zones.footColor;
  };
  subscribe((state) => {
    sync(state.design);
    if (document.activeElement !== fidelity.input) fidelity.input.value = state.knitFidelity;
    if (document.activeElement !== footSide.input) footSide.input.value = state.footSide;
  });
  sync(design);
  fidelity.input.value = getState().knitFidelity;
  footSide.input.value = getState().footSide;
}
