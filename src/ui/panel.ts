import type { FabricationReport } from '../core/checks';
import type { StackPaletteGuardResult } from '../core/stackPaletteGuard';
import type { Rot } from '../core/calepinage';
import { tileRowsFor } from '../core/calepinage';
import { clampLegRows, defaultDimensions, SIZE_PRESETS, totalRows } from '../core/sizes';
import { CATALOGUE_MISSING_MESSAGE } from '../io/catalogue';
import type { ExportRequest, FlatKind } from '../io/exportPng';
import { fixtureUrl, loadTileFromFile, loadTileFromUrl } from '../io/tiles';
import { VIEW_ANGLES, type ViewId } from '../render/views';
import { confirmDialog } from './kit/dialog';
import {
  canRedo,
  canUndo,
  editingCollection,
  editingLayoutSettings,
  getState,
  isMotifLayoutDirty,
  isSectionDirty,
  layoutFromTilesAround,
  redo,
  resetAllDesign,
  resetSection,
  resetSelectedLayer,
  setMotifImportes,
  subscribe,
  undo,
  update as updateState,
  type SockDesignV2,
  type StatePatch,
  type UpdateOptions,
} from '../state';
import type { Hex, LayoutSettings, QuantizeSettings, SizeId, TileAsset } from '../core/types';
import { visibleCollections } from '../core/collections';
import { tileCmFromFormat } from '../render/decorController';
import { mountCalepGallery } from './calepGallery';
import { mountCollectionPicker } from './collectionPicker';
import { mountLayerOptions, type LayerOptionsDeps } from './layerOptions';
import { mountPalettePanel } from './palettePanel';
import { OPTIONS_TABS, type OptionsTab, type OptionsTabsApi } from './optionsTabs';
import {
  details,
  makeCheckbox,
  makeColor,
  makeSelect,
  makeSliderNumber,
} from './controls';

function update(patch: StatePatch, options?: UpdateOptions): void {
  updateState(patch, options);
}

/** Curseurs : un seul pas d’historique pour un glissement. */
function slide(patch: StatePatch): void {
  updateState(patch, { coalesce: true });
}

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
    const tiles = [...getState().tiles, ...loaded];
    update({
      tiles,
      error: messages[0] ?? null,
    });
    setMotifImportes(tiles.map((t) => t.id));
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
  tiles.forEach((tile, index) => {
    const item = document.createElement('li');
    item.className = 'tile';

    const num = document.createElement('span');
    num.className = 'tile-num';
    num.dataset.testid = `tile-num-${index + 1}`;
    num.textContent = String(index + 1);
    item.appendChild(num);

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
  });
}

function actionButton(label: string, testId: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.testid = testId;
  button.addEventListener('click', onClick);
  return button;
}

export interface PanelActions extends LayerOptionsDeps {
  exportImages: (request: ExportRequest) => Promise<void>;
  saveProject: () => Promise<void>;
  openProject: (text: string) => Promise<void>;
  leaveDev: () => void;
  forgetFavoriPassword?: () => void;
  copyShareLink: () => void | Promise<void | boolean>;
  /** Onglets du panneau : le volet affiché suit l’onglet actif. */
  tabs: OptionsTabsApi;
}

/** Un volet par onglet ; `motif` regroupe les réglages du calque Motif sélectionné. */
interface Panes extends Record<OptionsTab, HTMLElement> {
  /** Bandeau commun en haut du panneau (annuler / rétablir, lien). */
  top: HTMLElement;
  motif: HTMLElement;
}

function makePane(host: HTMLElement, tab: OptionsTab): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'options-pane';
  pane.dataset.testid = `pane-${tab}`;
  host.appendChild(pane);
  return pane;
}

export interface PanelApi {
  /** Rafraîchit le volet « Calque » (pastilles de couleurs, aperçu d’image). */
  sync: () => void;
}

/** Panneau d’options : volets Calque / Chaussette / Décor / Export. */
export function mountPanel(panel: HTMLElement, actions: PanelActions): PanelApi {
  const body = panel.querySelector('#panel-body');
  const host = body instanceof HTMLElement ? body : panel;

  const catalogueHint = document.createElement('p');
  catalogueHint.className = 'hint catalogue-missing';
  catalogueHint.dataset.testid = 'catalogue-missing';
  catalogueHint.hidden = !getState().catalogueMissing;
  catalogueHint.textContent = CATALOGUE_MISSING_MESSAGE;
  host.appendChild(catalogueHint);

  const shareRow = document.createElement('div');
  shareRow.className = 'row share-row';
  const copyLink = document.createElement('button');
  copyLink.type = 'button';
  copyLink.dataset.testid = 'panel-copy-link';
  copyLink.textContent = 'Copier le lien';
  copyLink.addEventListener('click', () => {
    void actions.copyShareLink();
  });
  const shareDisabledHint = document.createElement('p');
  shareDisabledHint.className = 'hint';
  shareDisabledHint.dataset.testid = 'share-disabled-hint';
  shareDisabledHint.hidden = true;
  shareDisabledHint.textContent =
    'Cette composition contient des images importées : envoyez le fichier projet (.json)';
  const top = document.createElement('div');
  top.className = 'options-top';
  shareRow.append(copyLink, shareDisabledHint);
  top.appendChild(shareRow);
  host.appendChild(top);

  const panes: Panes = {
    top,
    calque: makePane(host, 'calque'),
    chaussette: makePane(host, 'chaussette'),
    decor: makePane(host, 'decor'),
    export: makePane(host, 'export'),
    global: makePane(host, 'global'),
    motif: document.createElement('div'),
  };
  panes.motif.dataset.testid = 'motif-options';
  actions.tabs.onChange((tab) => {
    for (const name of OPTIONS_TABS) panes[name].hidden = name !== tab;
  });

  const layerOptions = mountLayerOptions(actions);
  panes.calque.append(layerOptions.header, layerOptions.source, layerOptions.fond, panes.motif);

  const collectionPicker = mountCollectionPicker(panes.motif);
  const palettePanel = mountPalettePanel(panes.motif);

  const section = details('Mes carreaux', 'section-tiles');

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
      .then((tile) =>
        (() => {
          const tiles = [...getState().tiles, tile];
          update({ tiles, error: null });
          setMotifImportes(tiles.map((t) => t.id));
        })(),
      )
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
  panes.motif.appendChild(section);

  const render = (): void => {
    const message = getState().error;
    error.hidden = !message;
    error.textContent = message ?? '';
    catalogueHint.hidden = !getState().catalogueMissing;
    renderTiles(list, empty);
  };
  subscribe(render);
  render();

  /** Le volet « Calque » ne montre que les réglages du type de calque sélectionné. */
  const syncLayerPane = (): void => {
    const { design, selectedLayerId } = getState();
    const layer = design.layers.find((l) => l.id === selectedLayerId) ?? null;
    panes.motif.hidden = layer?.kind !== 'motif';
    layerOptions.sync();
  };

  subscribe(() => {
    collectionPicker.sync();
    palettePanel.sync();
    syncLayerPane();
    copyLink.disabled = false;
    shareDisabledHint.hidden = true;
  });
  collectionPicker.sync();
  palettePanel.sync();
  copyLink.disabled = false;
  shareDisabledHint.hidden = true;

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

  mountSettings(panes, actions);
  // Étendue du Motif après le calepinage ; transparence et image en fin de volet.
  panes.motif.appendChild(layerOptions.extent);
  panes.calque.append(layerOptions.image, layerOptions.dessin, layerOptions.transparency);
  syncLayerPane();

  return { sync: syncLayerPane };
}

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
  raccordMessage?: string;
  seamLabel?: string;
  showFit?: boolean;
}): void {
  if (computeMs) computeMs.textContent = `Dernier calcul : ${Math.round(info.ms)} ms`;
  if (seamStatus) {
    const seam = info.seamLabel ?? 'dos';
    if (info.mismatch === 0) {
      seamStatus.textContent = info.raccordMessage ?? 'Le motif tombe juste.';
    } else {
      seamStatus.textContent =
        info.raccordMessage ??
        `Carreau coupé au raccord (${seam}) · décalage de ${info.mismatch} mailles.`;
    }
  }
  const fitBtn = document.querySelector<HTMLButtonElement>('[data-testid="ctl-fit-width"]');
  if (fitBtn) {
    const free = editingLayoutSettings().tileSizeMode === 'free';
    fitBtn.hidden = !(free && info.mismatch > 0);
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

function pill(testId: string, options?: { action?: boolean }): HTMLElement {
  const item = document.createElement(options?.action ? 'button' : 'p');
  if (options?.action && item instanceof HTMLButtonElement) {
    item.type = 'button';
  }
  item.className = options?.action ? 'pill pill-action' : 'pill';
  item.dataset.testid = testId;
  item.textContent = '…';
  return item;
}

function paintPill(testId: string, ok: boolean, text: string): void {
  const item = document.querySelector(`[data-testid="${testId}"]`);
  if (!(item instanceof HTMLElement)) return;
  const action = item.classList.contains('pill-action');
  item.className = ok ? 'pill ok' : 'pill warn';
  if (action) item.classList.add('pill-action');
  item.textContent = text;
}

let checksAlertsActivator: (() => void) | null = null;

/** Pastilles Flottés / Mailles isolées → activent les alertes 2D (T70). */
export function setChecksAlertsActivator(fn: (() => void) | null): void {
  checksAlertsActivator = fn;
}

export function renderChecks(
  report: FabricationReport,
  detail?: { tooFine: boolean; isolatedCount: number; layerHint?: string | null } | null,
  hints?: { floatLayerHint?: string | null },
): void {
  const layerSuffix = (name: string | null | undefined): string => (name ? ` · calque ${name}` : '');
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
    report.floatsOk
      ? `Flottés : aucun au-dessus de ${report.maxFloat}`
      : `Flottés : ${report.floatCount}${layerSuffix(hints?.floatLayerHint)}`,
  );
  paintPill(
    'check-seam',
    report.seamOk,
    report.seamOk ? 'Raccord : le motif tombe juste' : `Raccord : décalage de ${report.seamMismatch} mailles`,
  );
  const detailPill = document.querySelector('[data-testid="check-detail"]');
  if (detailPill instanceof HTMLElement) {
    if (!detail) {
      detailPill.hidden = true;
    } else {
      detailPill.hidden = false;
      paintPill(
        'check-detail',
        !detail.tooFine,
        detail.tooFine
          ? `Détails : ${detail.isolatedCount} mailles isolées (trop fins pour le jacquard)${layerSuffix(detail.layerHint)}`
          : 'Détails : pas de mailles isolées problématiques',
      );
    }
  }
}

let stackPaletteReduceHandler: (() => void) | null = null;

export function renderStackPaletteGuard(
  guard: StackPaletteGuardResult | null,
  onReduce: () => void,
): void {
  stackPaletteReduceHandler = onReduce;
  const root = document.querySelector('[data-testid="stack-palette-banner"]');
  if (!(root instanceof HTMLElement)) return;
  const list = root.querySelector('[data-testid="stack-palette-list"]');
  const btn = root.querySelector('[data-testid="stack-palette-reduce"]');
  if (!(list instanceof HTMLElement) || !(btn instanceof HTMLButtonElement)) return;
  if (!guard?.showBanner) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const intro = root.querySelector('[data-testid="stack-palette-intro"]');
  if (intro instanceof HTMLElement) {
    intro.textContent = `${guard.entries.length} couleurs de fil dépassent la limite machine (${guard.machineMax}).`;
  }
  list.replaceChildren();
  for (const entry of guard.entries) {
    const row = document.createElement('p');
    row.className = 'stack-palette-row';
    const chip = document.createElement('i');
    chip.className = 'stack-palette-chip';
    chip.style.background = entry.hex;
    chip.title = entry.hex;
    const label = document.createElement('span');
    label.textContent = `${entry.hex} · ${entry.layerName}`;
    row.append(chip, label);
    list.appendChild(row);
  }
  btn.textContent = `Réduire à ${guard.machineMax} couleurs`;
  btn.disabled = false;
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
      { value: '1024', label: '819 × 1024 px (4:5)' },
      { value: '2048', label: '1638 × 2048 px (4:5)' },
      { value: '4096', label: '3277 × 4096 px (4:5)' },
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

function isSize(value: string): value is SizeId {
  return value === 'homme' || value === 'femme';
}

function showLegMessage(size: SizeId, message: HTMLElement): void {
  const max = SIZE_PRESETS[size].legRowsMax;
  message.hidden = !legWarned;
  message.textContent = legWarned ? `La tige ne peut pas dépasser ${max} rangs.` : '';
}

/** Affiche ou masque la pastille « modifié » d’une section. */
function paintDirty(section: HTMLElement, testId: string, dirty: boolean): void {
  const badge = section.querySelector(`[data-testid="${testId}"]`);
  if (badge instanceof HTMLElement) badge.hidden = !dirty;
}

function mountSettings(panes: Panes, actions: PanelActions): void {
  const design = getState().design;
  const initialLayout = editingLayoutSettings();
  let keepRatio = true;
  let paletteKey = '';

  const history = document.createElement('div');
  history.className = 'row history-bar';
  const undoBtn = actionButton('Annuler', 'undo', () => {
    undo();
  });
  const redoBtn = actionButton('Rétablir', 'redo', () => {
    redo();
  });
  history.append(undoBtn, redoBtn);
  panes.top.prepend(history);

  const layout = details('Calepinage du motif', 'section-layout', {
    resetId: 'reset-calepinage',
    dirtyId: 'dirty-calepinage',
    onReset: () => resetSelectedLayer(),
  });
  const gallery = mountCalepGallery(layout);

  const tilesAround = makeSliderNumber({
    label: 'Carreaux sur le tour de la jambe',
    testId: 'ctl-tiles-around',
    min: 2,
    max: 12,
    step: 1,
    value: initialLayout.tilesAround,
    unit: 'carreaux',
    help: 'Nombre de motifs qui font le tour de la jambe. Le motif tombe toujours juste au raccord.',
    onChange: (value) => {
      const current = getState().design;
      const sized = layoutFromTilesAround(
        current.dimensions.needles,
        value,
        editingLayoutSettings().gapStitches,
        current.dimensions.stitchesPerCm,
        current.dimensions.rowsPerCm,
        keepRatio,
        editingLayoutSettings().tileRows,
      );
      update({ design: { layout: sized } });
    },
  });

  const freeSizeBox = makeCheckbox(
    'Taille libre en mailles',
    'ctl-free-tile-size',
    initialLayout.tileSizeMode === 'free',
    (checked) => {
      const current = getState().design;
      if (checked) {
        update({ design: { layout: { tileSizeMode: 'free' } } });
        tileWidth.root.hidden = false;
        tileRows.root.hidden = false;
        return;
      }
      const sized = layoutFromTilesAround(
        current.dimensions.needles,
        editingLayoutSettings().tilesAround,
        editingLayoutSettings().gapStitches,
        current.dimensions.stitchesPerCm,
        current.dimensions.rowsPerCm,
        keepRatio,
        editingLayoutSettings().tileRows,
      );
      update({ design: { layout: sized } });
      tileWidth.root.hidden = true;
      tileRows.root.hidden = true;
    },
    'Affiche les curseurs largeur/hauteur en mailles (le motif peut être coupé au raccord).',
  );

  const tileWidth = makeSliderNumber({
    label: 'Largeur du carreau',
    testId: 'ctl-tile-width',
    min: 4,
    max: 200,
    step: 0.1,
    value: initialLayout.tileStitches,
    unit: 'mailles',
    help: 'Nombre de mailles (aiguilles) que fait un motif sur le tour de jambe.',
    onChange: (value) => {
      const tileStitches = Math.max(1, value);
      const next: { tileStitches: number; tileRows?: number; tileSizeMode: 'free' } = {
        tileStitches,
        tileSizeMode: 'free',
      };
      if (keepRatio) {
        const d = getState().design.dimensions;
        next.tileRows = Math.max(1, Math.round(tileRowsFor(tileStitches, d.stitchesPerCm, d.rowsPerCm)));
      }
      update({ design: { layout: next } });
    },
  });
  const tileRows = makeSliderNumber({
    label: 'Hauteur du carreau',
    testId: 'ctl-tile-rows',
    min: 4,
    max: 300,
    step: 0.1,
    value: initialLayout.tileRows,
    unit: 'rangs',
    help: 'Nombre de rangs (lignes tricotées) d’un motif. Un rang = un tour de cylindre.',
    onChange: (value) => {
      keepRatio = false;
      keepBox.input.checked = false;
      update({ design: { layout: { tileRows: Math.max(1, value), tileSizeMode: 'free' } } });
    },
  });
  tileWidth.root.hidden = initialLayout.tileSizeMode !== 'free';
  tileRows.root.hidden = initialLayout.tileSizeMode !== 'free';

  const keepBox = makeCheckbox(
    'Garder les proportions',
    'ctl-keep-ratio',
    true,
    (checked) => {
      keepRatio = checked;
      if (!checked) return;
      const current = getState().design;
      if (editingLayoutSettings().tileSizeMode === 'around') {
        const sized = layoutFromTilesAround(
          current.dimensions.needles,
          editingLayoutSettings().tilesAround,
          editingLayoutSettings().gapStitches,
          current.dimensions.stitchesPerCm,
          current.dimensions.rowsPerCm,
          true,
          editingLayoutSettings().tileRows,
        );
        update({ design: { layout: sized } });
        return;
      }
      update({
        design: {
          layout: {
            tileRows: Math.max(
              1,
              Math.round(
                tileRowsFor(
                  editingLayoutSettings().tileStitches,
                  current.dimensions.stitchesPerCm,
                  current.dimensions.rowsPerCm,
                ),
              ),
            ),
          },
        },
      });
    },
    'Recalcule la hauteur pour qu’un carreau carré reste carré à la jauge actuelle.',
  );

  const gaugeReadout = document.createElement('p');
  gaugeReadout.className = 'gauge-readout';
  gaugeReadout.dataset.testid = 'gauge-readout';

  function refreshGaugeReadout(
    current: SockDesignV2 = getState().design,
    L: LayoutSettings = editingLayoutSettings(),
  ): void {
    const D = current.dimensions;
    const wMm = D.stitchesPerCm > 0 ? (L.tileStitches / D.stitchesPerCm) * 10 : 0;
    const hMm = D.rowsPerCm > 0 ? (L.tileRows / D.rowsPerCm) * 10 : 0;
    const wCm = wMm / 10;
    const hCm = hMm / 10;
    const around =
      L.tileSizeMode === 'around'
        ? L.tilesAround
        : L.tileStitches + L.gapStitches > 0
          ? D.needles / (L.tileStitches + L.gapStitches)
          : 0;
    const tourCm = D.stitchesPerCm > 0 ? D.needles / D.stitchesPerCm : 0;
    const legCm = D.rowsPerCm > 0 ? D.legRows / D.rowsPerCm : 0;
    const Ldisp = Number.isInteger(L.tileStitches) ? String(L.tileStitches) : L.tileStitches.toFixed(1);
    const Hdisp = Number.isInteger(L.tileRows) ? String(L.tileRows) : L.tileRows.toFixed(1);
    const aroundDisp = Number.isInteger(around) ? String(around) : around.toFixed(2);
    gaugeReadout.textContent =
      `1 carreau = ${Ldisp} mailles × ${Hdisp} rangs ≈ ${wCm.toFixed(1).replace('.', ',')} × ${hCm.toFixed(1).replace('.', ',')} cm` +
      ` · ${aroundDisp} carreaux sur le tour · tour de jambe au repos ≈ ${tourCm.toFixed(1).replace('.', ',')} cm` +
      ` · tige ${D.legRows} rangs ≈ ${legCm.toFixed(1).replace('.', ',')} cm`;
  }
  refreshGaugeReadout();

  const gapStitches = makeSliderNumber({
    label: 'Joint horizontal',
    testId: 'ctl-gap-stitches',
    min: 0,
    max: 32,
    step: 1,
    value: initialLayout.gapStitches,
    unit: 'mailles',
    help: 'Bande unie entre deux carreaux sur le tour (0 = carreaux collés).',
    onChange: (value) => {
      const gapStitches = Math.max(0, Math.round(value));
      const current = getState().design;
      if (editingLayoutSettings().tileSizeMode === 'around') {
        const sized = layoutFromTilesAround(
          current.dimensions.needles,
          editingLayoutSettings().tilesAround,
          gapStitches,
          current.dimensions.stitchesPerCm,
          current.dimensions.rowsPerCm,
          keepRatio,
          editingLayoutSettings().tileRows,
        );
        slide({ design: { layout: { ...sized, gapStitches } } });
        return;
      }
      slide({ design: { layout: { gapStitches } } });
    },
  });
  const gapRows = makeSliderNumber({
    label: 'Joint vertical',
    testId: 'ctl-gap-rows',
    min: 0,
    max: 32,
    step: 1,
    value: initialLayout.gapRows,
    unit: 'rangs',
    help: 'Bande unie entre deux rangées de carreaux.',
    onChange: (value) => slide({ design: { layout: { gapRows: Math.max(0, Math.round(value)) } } }),
  });
  const gapColor = makeColor(
    'Couleur du joint',
    'ctl-gap-color',
    initialLayout.gapColor,
    (value) => {
      slide({ design: { layout: { gapColor: value } } });
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
    String(initialLayout.calepinage.rotationGlobale),
    (value) => {
      const angle = (value === '90' || value === '180' || value === '270' ? Number(value) : 0) as Rot;
      update({ design: { layout: { calepinage: { rotationGlobale: angle } } } });
    },
  );
  const offsetX = makeSliderNumber({
    label: 'Décalage horizontal',
    testId: 'ctl-offset-stitches',
    min: -200,
    max: 200,
    step: 1,
    value: initialLayout.offsetStitches,
    unit: 'mailles',
    onChange: (value) => slide({ design: { layout: { offsetStitches: Math.round(value) } } }),
  });
  const offsetY = makeSliderNumber({
    label: 'Décalage vertical',
    testId: 'ctl-offset-rows',
    min: -200,
    max: 200,
    step: 1,
    value: initialLayout.offsetRows,
    unit: 'rangs',
    onChange: (value) => slide({ design: { layout: { offsetRows: Math.round(value) } } }),
  });
  const seed = makeSliderNumber({
    label: 'Graine',
    testId: 'ctl-seed',
    min: 1,
    max: 9999,
    step: 1,
    value: initialLayout.calepinage.graine,
    onChange: (value) =>
      update({ design: { layout: { calepinage: { graine: Math.max(1, Math.round(value)) } } } }),
  });

  const seamSelect = makeSelect(
    'Raccord du motif',
    'ctl-seam',
    [
      { value: 'dos', label: 'Dos' },
      { value: 'interieur', label: 'Intérieur' },
      { value: 'exterieur', label: 'Extérieur' },
      { value: 'devant', label: 'Devant' },
    ],
    initialLayout.seam,
    (value) => {
      if (value !== 'dos' && value !== 'interieur' && value !== 'exterieur' && value !== 'devant') return;
      update({ design: { layout: { seam: value } } });
    },
    'Où le tour se referme : au dos (moins visible), à l’intérieur, à l’extérieur ou devant.',
  );

  seamStatus = document.createElement('p');
  seamStatus.className = 'hint';
  seamStatus.dataset.testid = 'seam-status';
  seamStatus.textContent = 'Le motif tombe juste.';
  const fit = document.createElement('button');
  fit.type = 'button';
  fit.dataset.testid = 'ctl-fit-width';
  fit.textContent = 'Faire tomber juste';
  fit.addEventListener('click', () => {
    const current = getState().design;
    // Passe en « carreaux sur le tour » avec le nombre le plus proche.
    const pitch = editingLayoutSettings().tileStitches + editingLayoutSettings().gapStitches;
    const approx = pitch > 0 ? Math.round(current.dimensions.needles / pitch) : editingLayoutSettings().tilesAround;
    const sized = layoutFromTilesAround(
      current.dimensions.needles,
      approx,
      editingLayoutSettings().gapStitches,
      current.dimensions.stitchesPerCm,
      current.dimensions.rowsPerCm,
      keepRatio,
      editingLayoutSettings().tileRows,
    );
    update({ design: { layout: sized } });
    freeSizeBox.input.checked = false;
    tileWidth.root.hidden = true;
    tileRows.root.hidden = true;
  });
  layout.append(
    tilesAround.root,
    freeSizeBox.root,
    tileWidth.root,
    tileRows.root,
    keepBox.root,
    gaugeReadout,
    gapStitches.root,
    gapRows.root,
    gapColor.root,
    rotation.root,
    offsetX.root,
    offsetY.root,
    seed.root,
    seamSelect.root,
    seamStatus,
    fit,
  );

  const dimensions = details('Dimensions', 'section-dimensions', {
    resetId: 'reset-dimensions',
    dirtyId: 'dirty-dimensions',
    onReset: () => resetSection('dimensions'),
  });
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
    help: 'Nombre de mailles sur le tour de la jambe (cylindres de la machine).',
    onChange: (value) => {
      const needlesN = Math.max(1, Math.round(value));
      const current = getState().design;
      if (editingLayoutSettings().tileSizeMode === 'around') {
        const sized = layoutFromTilesAround(
          needlesN,
          editingLayoutSettings().tilesAround,
          editingLayoutSettings().gapStitches,
          current.dimensions.stitchesPerCm,
          current.dimensions.rowsPerCm,
          keepRatio,
          editingLayoutSettings().tileRows,
        );
        slide({ design: { dimensions: { needles: needlesN }, layout: sized } });
        return;
      }
      slide({ design: { dimensions: { needles: needlesN } } });
    },
  });
  const heelRows = makeSliderNumber({
    label: 'Talon',
    testId: 'ctl-heel-rows',
    min: 1,
    max: 200,
    step: 1,
    value: design.dimensions.heelRows,
    unit: 'rangs',
    onChange: (value) => slide({ design: { dimensions: { heelRows: Math.max(1, Math.round(value)) } } }),
  });
  const footRows = makeSliderNumber({
    label: 'Pied',
    testId: 'ctl-foot-rows',
    min: 1,
    max: 400,
    step: 1,
    value: design.dimensions.footRows,
    unit: 'rangs',
    onChange: (value) => slide({ design: { dimensions: { footRows: Math.max(1, Math.round(value)) } } }),
  });
  const toeRows = makeSliderNumber({
    label: 'Pointe',
    testId: 'ctl-toe-rows',
    min: 1,
    max: 200,
    step: 1,
    value: design.dimensions.toeRows,
    unit: 'rangs',
    onChange: (value) => slide({ design: { dimensions: { toeRows: Math.max(1, Math.round(value)) } } }),
  });
  const stitches = makeSliderNumber({
    label: 'Jauge horizontale',
    testId: 'ctl-stitches-per-cm',
    min: 1,
    max: 30,
    step: 0.1,
    value: design.dimensions.stitchesPerCm,
    unit: 'mailles/cm',
    help: 'Combien de mailles tiennent dans 1 cm de large, tricot au repos (fil + machine).',
    onChange: (value) => {
      const stitchesPerCm = Math.max(0.1, value);
      const current = getState().design;
      if (editingLayoutSettings().tileSizeMode === 'around') {
        const sized = layoutFromTilesAround(
          current.dimensions.needles,
          editingLayoutSettings().tilesAround,
          editingLayoutSettings().gapStitches,
          stitchesPerCm,
          current.dimensions.rowsPerCm,
          keepRatio,
          editingLayoutSettings().tileRows,
        );
        // Ne change pas le nombre de carreaux sur le tour.
        update({ design: { dimensions: { stitchesPerCm }, layout: sized } });
        return;
      }
      const layoutPatch = keepRatio
        ? {
            tileRows: Math.max(
              1,
              Math.round(tileRowsFor(editingLayoutSettings().tileStitches, stitchesPerCm, current.dimensions.rowsPerCm)),
            ),
          }
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
    help: 'Combien de rangs tiennent dans 1 cm de haut. Change la hauteur réelle de la tige et d’un carreau carré.',
    onChange: (value) => {
      const nextRows = Math.max(0.1, value);
      const current = getState().design;
      if (editingLayoutSettings().tileSizeMode === 'around') {
        const sized = layoutFromTilesAround(
          current.dimensions.needles,
          editingLayoutSettings().tilesAround,
          editingLayoutSettings().gapStitches,
          current.dimensions.stitchesPerCm,
          nextRows,
          keepRatio,
          editingLayoutSettings().tileRows,
        );
        update({ design: { dimensions: { rowsPerCm: nextRows }, layout: sized } });
        return;
      }
      const layoutPatch = keepRatio
        ? {
            tileRows: Math.max(
              1,
              Math.round(tileRowsFor(editingLayoutSettings().tileStitches, current.dimensions.stitchesPerCm, nextRows)),
            ),
          }
        : {};
      update({ design: { dimensions: { rowsPerCm: nextRows }, layout: layoutPatch } });
    },
  });
  const sizeCm = document.createElement('p');
  sizeCm.className = 'hint';
  sizeCm.dataset.testid = 'size-cm';

  const machine = document.createElement('details');
  machine.className = 'section machine-settings';
  machine.dataset.testid = 'section-machine';
  const machineSummary = document.createElement('summary');
  machineSummary.textContent = 'Réglages machine (fabricant)';
  machine.appendChild(machineSummary);
  const machineHelp = document.createElement('div');
  machineHelp.className = 'machine-help';
  machineHelp.dataset.testid = 'machine-help';
  machineHelp.innerHTML = `
    <p class="hint">Ce sont des données du fabricant, pas des réglages de dessin : une fois connues, on ne les touche plus.</p>
    <ul class="hint">
      <li><strong>Aiguilles</strong> — largeur de la grille (tour de jambe).</li>
      <li><strong>Jauge horizontale</strong> — mailles par cm au repos.</li>
      <li><strong>Jauge verticale</strong> — rangs par cm (change aussi la hauteur réelle de la tige).</li>
    </ul>
    <svg class="machine-diagram" viewBox="0 0 220 120" width="220" height="120" aria-hidden="true">
      <rect x="10" y="10" width="100" height="80" fill="#f4f1ec" stroke="#1d1d1b"/>
      <path d="M10 30 H110 M10 50 H110 M10 70 H110 M30 10 V90 M50 10 V90 M70 10 V90 M90 10 V90" stroke="#cbbfad"/>
      <rect x="130" y="20" width="48" height="36" fill="#fff" stroke="#b5462f" stroke-width="2"/>
      <text x="154" y="42" text-anchor="middle" font-size="10" fill="#1d1d1b">maille</text>
      <text x="154" y="68" text-anchor="middle" font-size="9" fill="#6b6760">≈ 1,3 mm</text>
      <text x="178" y="18" text-anchor="start" font-size="9" fill="#6b6760">larg.</text>
      <text x="120" y="42" text-anchor="end" font-size="9" fill="#6b6760">haut.</text>
    </svg>
  `;
  machine.append(machineHelp, needles.root, stitches.root, rowsPerCm.root);

  dimensions.append(
    size.root,
    leg.root,
    legMessage,
    heelRows.root,
    footRows.root,
    toeRows.root,
    sizeCm,
    machine,
  );

  const pixels = details('Gros pixels', 'section-pixels', {
    resetId: 'reset-pixels',
    dirtyId: 'dirty-pixels',
    onReset: () => resetSection('quantize'),
  });
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
    onChange: (value) => slide({ design: { quantize: { maxColors: Math.round(value) } } }),
  });
  const paletteMode = makeSelect(
    'Palette',
    'ctl-palette-mode',
    [
      { value: 'calques', label: 'Automatique d’après les calques' },
      { value: 'auto', label: 'Automatique (réduction des couleurs)' },
      { value: 'manuelle', label: 'Manuelle' },
    ],
    design.quantize.paletteFromLayers ? 'calques' : design.quantize.paletteMode,
    (value) => {
      if (value === 'calques') {
        update({ design: { quantize: { paletteFromLayers: true } } });
        return;
      }
      if (value !== 'auto' && value !== 'manuelle') return;
      const quantizePatch: Partial<QuantizeSettings> = { paletteMode: value, paletteFromLayers: false };
      if (value === 'manuelle' && getState().design.quantize.palette.length === 0) {
        quantizePatch.palette = [...MANUAL_SEED];
      }
      update({ design: { quantize: quantizePatch } });
    },
    'D’après les calques : les couleurs de fil des calques visibles. Automatique : l’outil réduit les couleurs. Manuelle : vous imposez les fils du fabricant.',
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

  const stackPaletteBanner = document.createElement('div');
  stackPaletteBanner.className = 'stack-palette-banner tile-error';
  stackPaletteBanner.dataset.testid = 'stack-palette-banner';
  stackPaletteBanner.hidden = true;
  const stackIntro = document.createElement('p');
  stackIntro.dataset.testid = 'stack-palette-intro';
  const stackList = document.createElement('div');
  stackList.dataset.testid = 'stack-palette-list';
  const stackReduce = document.createElement('button');
  stackReduce.type = 'button';
  stackReduce.dataset.testid = 'stack-palette-reduce';
  stackReduce.addEventListener('click', () => stackPaletteReduceHandler?.());
  stackPaletteBanner.append(stackIntro, stackList, stackReduce);

  pixels.append(
    sampling.root,
    maxColors.root,
    paletteMode.root,
    despeckle.root,
    stackPaletteBanner,
    manual,
    swatches,
  );

  const zones = details('Zones', 'section-zones', {
    resetId: 'reset-zones',
    dirtyId: 'dirty-zones',
    onReset: () => resetSection('zones'),
  });
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
    onChange: (value) => slide({ design: { dimensions: { cuffRows: Math.max(0, Math.round(value)) } } }),
  });
  const cuffColor = makeColor('Couleur du bord-côte', 'ctl-cuff-color', design.zones.cuffColor, (value) => {
    slide({ design: { zones: { cuffColor: value } } });
  });
  const heelColor = makeColor('Couleur du talon', 'ctl-heel-color', design.zones.heelColor, (value) => {
    slide({ design: { zones: { heelColor: value } } });
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
      slide({ design: { zones: { heelHeightMm: Math.min(110, Math.max(25, Math.round(value))) } } }),
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
      slide({ design: { zones: { heelDepthMm: Math.min(130, Math.max(40, Math.round(value))) } } }),
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
      slide({ design: { zones: { heelSpread: Math.min(100, Math.max(50, Math.round(value))) } } }),
  });
  const toeColor = makeColor('Couleur de la pointe', 'ctl-toe-color', design.zones.toeColor, (value) => {
    slide({ design: { zones: { toeColor: value } } });
  });
  const patternFoot = makeCheckbox(
    'Motif sur le pied',
    'ctl-pattern-foot',
    design.zones.patternOnFoot,
    (checked) => {
      update({ design: { zones: { patternOnFoot: checked } } });
    },
    'Décoché : le pied est uni, de la couleur du Fond.',
  );
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

  const decorSection = details('Décor', 'section-decor', {
    resetId: 'reset-decor',
    dirtyId: 'dirty-decor',
    onReset: () => resetSection('decor'),
  });
  const decorMode = makeSelect(
    'Décor',
    'ctl-decor-mode',
    [
      { value: 'aucun', label: 'Aucun' },
      { value: 'sol', label: 'Sol' },
      { value: 'mur', label: 'Mur' },
      { value: 'coin', label: 'Sol + mur' },
    ],
    design.decor.mode,
    (value) => {
      if (value !== 'aucun' && value !== 'sol' && value !== 'mur' && value !== 'coin') return;
      const patch: { mode: typeof value; tileCm?: number } = { mode: value };
      if (value !== 'aucun') {
        const { catalogue } = getState();
        const activeCollectionId = editingCollection()?.id ?? null;
        const coll = catalogue?.collections.find((c) => c.id === activeCollectionId);
        if (coll) patch.tileCm = tileCmFromFormat(coll.format);
      }
      update({ design: { decor: patch } });
      syncDecorVisibility();
    },
    'Sol et/ou mur en carreaux de ciment derrière la chaussette.',
  );
  const decorTileCm = makeSliderNumber({
    label: 'Format du carreau',
    testId: 'ctl-decor-tile-cm',
    min: 10,
    max: 30,
    step: 1,
    value: design.decor.tileCm,
    unit: 'cm',
    onChange: (value) => slide({ design: { decor: { tileCm: Math.round(value) } } }),
    help: 'Côté d’un carreau au sol / mur (format de la collection : 20 × 20 → 20 cm).',
  });
  const decorGrout = makeSliderNumber({
    label: 'Joint',
    testId: 'ctl-decor-grout',
    min: 0,
    max: 8,
    step: 0.5,
    value: design.decor.groutMm,
    unit: 'mm',
    onChange: (value) => slide({ design: { decor: { groutMm: value } } }),
  });
  const decorGroutColor = makeColor('Couleur du joint', 'ctl-decor-grout-color', design.decor.groutColor, (value) => {
    slide({ design: { decor: { groutColor: value } } });
  });
  const decorGrain = makeSliderNumber({
    label: 'Grain',
    testId: 'ctl-decor-grain',
    min: 0,
    max: 100,
    step: 5,
    value: Math.round(design.decor.grainStrength * 100),
    unit: '%',
    onChange: (value) => slide({ design: { decor: { grainStrength: value / 100 } } }),
    help: 'Texture photo du ciment (matière, piqûres). 0 = lisse.',
  });
  const decorPatina = makeSliderNumber({
    label: 'Patine',
    testId: 'ctl-decor-patina',
    min: 0,
    max: 1,
    step: 0.05,
    value: design.decor.patina,
    onChange: (value) => slide({ design: { decor: { patina: value } } }),
    help: 'Variations d’usure d’un carreau à l’autre.',
  });
  const decorAttenuation = makeSliderNumber({
    label: 'Atténuation',
    testId: 'ctl-decor-attenuation',
    min: 0,
    max: 1,
    step: 0.05,
    value: design.decor.attenuation,
    onChange: (value) => slide({ design: { decor: { attenuation: value } } }),
    help: 'Éclaircit le décor pour laisser la chaussette au premier plan (0 = couleurs franches).',
  });
  const decorSource = makeSelect(
    'Carreaux du décor',
    'ctl-decor-source',
    [
      { value: 'sock', label: 'Comme la chaussette' },
      { value: 'collection-origin', label: 'Couleurs d’origine de la collection' },
      { value: 'other-collection', label: 'Autre collection' },
    ],
    design.decor.tileSource,
    (value) => {
      if (value !== 'sock' && value !== 'collection-origin' && value !== 'other-collection') return;
      update({ design: { decor: { tileSource: value } } });
      syncDecorVisibility();
    },
  );
  const otherOptions = (): { value: string; label: string }[] => {
    const cat = getState().catalogue;
    if (!cat) return [{ value: '', label: '— aucune —' }];
    return [
      { value: '', label: '— choisir —' },
      ...visibleCollections(cat, true).map((c) => ({ value: c.id, label: c.nom })),
    ];
  };
  const decorOther = makeSelect(
    'Collection du décor',
    'ctl-decor-other',
    otherOptions(),
    design.decor.otherCollectionId ?? '',
    (value) => {
      const id = value || null;
      const patch: { otherCollectionId: string | null; tileCm?: number } = { otherCollectionId: id };
      const coll = getState().catalogue?.collections.find((c) => c.id === id);
      if (coll) patch.tileCm = tileCmFromFormat(coll.format);
      update({ design: { decor: patch } });
    },
  );

  function syncDecorVisibility(): void {
    const d = getState().design.decor;
    const on = d.mode !== 'aucun';
    decorTileCm.root.hidden = !on;
    decorGrout.root.hidden = !on;
    decorGroutColor.root.hidden = !on;
    decorGrain.root.hidden = !on;
    decorPatina.root.hidden = !on;
    decorAttenuation.root.hidden = !on;
    decorSource.root.hidden = !on;
    decorOther.root.hidden = !on || d.tileSource !== 'other-collection';
  }
  syncDecorVisibility();

  decorSection.append(
    decorMode.root,
    decorTileCm.root,
    decorGrout.root,
    decorGroutColor.root,
    decorGrain.root,
    decorPatina.root,
    decorAttenuation.root,
    decorSource.root,
    decorOther.root,
  );

  const checks = details('Contrôles', 'section-checks');
  const floatsPill = pill('check-floats', { action: true });
  const detailPill = pill('check-detail', { action: true });
  floatsPill.addEventListener('click', () => checksAlertsActivator?.());
  detailPill.addEventListener('click', () => checksAlertsActivator?.());
  checks.append(
    pill('check-colors'),
    pill('check-rows'),
    floatsPill,
    pill('check-seam'),
    detailPill,
  );
  const fitSeam = document.createElement('button');
  fitSeam.type = 'button';
  fitSeam.dataset.testid = 'ctl-fit-seam';
  fitSeam.textContent = 'Ajuster la largeur pour que le motif tombe juste';
  fitSeam.addEventListener('click', () => {
    const current = getState().design;
    const pitch = editingLayoutSettings().tileStitches + editingLayoutSettings().gapStitches;
    const approx = pitch > 0 ? Math.round(current.dimensions.needles / pitch) : editingLayoutSettings().tilesAround;
    const sized = layoutFromTilesAround(
      current.dimensions.needles,
      approx,
      editingLayoutSettings().gapStitches,
      current.dimensions.stitchesPerCm,
      current.dimensions.rowsPerCm,
      keepRatio,
      editingLayoutSettings().tileRows,
    );
    update({ design: { layout: sized } });
  });
  checks.appendChild(fitSeam);

  const exportsSection = details('Exports', 'section-exports');
  mountExportControls(exportsSection, actions);

  computeMs = document.createElement('p');
  computeMs.className = 'hint compute-ms';
  computeMs.dataset.testid = 'compute-ms';
  computeMs.textContent = 'Dernier calcul : —';

  const resetAll = document.createElement('button');
  resetAll.type = 'button';
  resetAll.className = 'kit-btn kit-btn--ghost kit-btn--danger';
  resetAll.dataset.testid = 'reset-all';
  resetAll.textContent = 'Tout réinitialiser';
  resetAll.addEventListener('click', () => {
    void confirmDialog({
      title: 'Tout réinitialiser ?',
      message: 'Les réglages du modèle et l’historique d’annulation seront effacés.',
      confirmLabel: 'Tout réinitialiser',
      danger: true,
      testId: 'reset-all-confirm',
    }).then((ok) => {
      if (ok) resetAllDesign();
    });
  });

  panes.motif.appendChild(layout);
  panes.chaussette.append(dimensions, zones, pixels, checks);
  panes.decor.appendChild(decorSection);
  panes.export.appendChild(exportsSection);
  panes.global.append(resetAll, computeMs);

  const syncManual = (current: SockDesignV2): void => {
    const isManual = current.quantize.paletteMode === 'manuelle' && !current.quantize.paletteFromLayers;
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

  const sync = (current: SockDesignV2): void => {
    const layout = editingLayoutSettings();
    gallery.sync(getState().tiles, layout.calepinage, getState().calepPresets);
    tilesAround.setValue(layout.tilesAround);
    freeSizeBox.input.checked = layout.tileSizeMode === 'free';
    tileWidth.root.hidden = layout.tileSizeMode !== 'free';
    tileRows.root.hidden = layout.tileSizeMode !== 'free';
    tileWidth.setValue(layout.tileStitches);
    tileRows.setValue(layout.tileRows);
    keepBox.input.checked = keepRatio;
    refreshGaugeReadout(current, layout);
    gapStitches.setValue(layout.gapStitches);
    gapRows.setValue(layout.gapRows);
    if (document.activeElement !== gapColor.input) gapColor.input.value = layout.gapColor;
    rotation.input.value = String(layout.calepinage.rotationGlobale);
    offsetX.setValue(layout.offsetStitches);
    offsetY.setValue(layout.offsetRows);
    seed.setValue(layout.calepinage.graine);
    if (document.activeElement !== seamSelect.input) seamSelect.input.value = layout.seam;
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
    const showMaxColors =
      !current.quantize.paletteFromLayers &&
      (current.quantize.paletteMode === 'auto' || current.quantize.paletteMode === 'manuelle');
    maxColors.root.hidden = !showMaxColors;
    if (document.activeElement !== paletteMode.input) {
      paletteMode.input.value = current.quantize.paletteFromLayers ? 'calques' : current.quantize.paletteMode;
    }
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
    if (document.activeElement !== decorMode.input) decorMode.input.value = current.decor.mode;
    decorTileCm.setValue(current.decor.tileCm);
    decorGrout.setValue(current.decor.groutMm);
    if (document.activeElement !== decorGroutColor.input) decorGroutColor.input.value = current.decor.groutColor;
    decorGrain.setValue(Math.round(current.decor.grainStrength * 100));
    decorPatina.setValue(current.decor.patina);
    decorAttenuation.setValue(current.decor.attenuation);
    if (document.activeElement !== decorSource.input) decorSource.input.value = current.decor.tileSource;
    // Rafraîchir la liste des collections (catalogue chargé après le montage)
    const opts = otherOptions();
    const prev = decorOther.input.value;
    decorOther.input.replaceChildren(
      ...opts.map((o) => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        return opt;
      }),
    );
    decorOther.input.value = current.decor.otherCollectionId ?? prev ?? '';
    syncDecorVisibility();
  };
  subscribe((state) => {
    sync(state.design);
    if (document.activeElement !== fidelity.input) fidelity.input.value = state.knitFidelity;
    if (document.activeElement !== footSide.input) footSide.input.value = state.footSide;
    // Chaque pastille « modifié » est cherchée dans sa section : elles sont réparties dans les volets.
    paintDirty(layout, 'dirty-calepinage', isMotifLayoutDirty(state.design));
    paintDirty(dimensions, 'dirty-dimensions', isSectionDirty('dimensions', state.design));
    paintDirty(pixels, 'dirty-pixels', isSectionDirty('quantize', state.design));
    paintDirty(zones, 'dirty-zones', isSectionDirty('zones', state.design));
    paintDirty(decorSection, 'dirty-decor', isSectionDirty('decor', state.design));
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  });
  sync(design);
  fidelity.input.value = getState().knitFidelity;
  footSide.input.value = getState().footSide;
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();

  const leave = document.createElement('button');
  leave.type = 'button';
  leave.dataset.testid = 'leave-dev';
  leave.className = 'leave-dev';
  leave.textContent = 'Quitter le mode dev';
  leave.addEventListener('click', () => actions.leaveDev());

  const forgetMdp = document.createElement('button');
  forgetMdp.type = 'button';
  forgetMdp.dataset.testid = 'forget-favori-password';
  forgetMdp.className = 'leave-dev';
  forgetMdp.textContent = 'Oublier le mot de passe';
  forgetMdp.addEventListener('click', () => actions.forgetFavoriPassword?.());

  const adminLink = document.createElement('a');
  adminLink.href = './admin.html';
  adminLink.dataset.testid = 'admin-collections-link';
  adminLink.className = 'leave-dev';
  adminLink.textContent = 'Gérer mes collections';
  adminLink.style.display = 'block';
  adminLink.style.marginTop = '0.5rem';
  panes.global.append(adminLink, forgetMdp, leave);
}
