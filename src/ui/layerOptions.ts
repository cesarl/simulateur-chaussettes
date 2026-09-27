/**
 * Options du calque sélectionné (T55).
 *
 * Ce module porte ce qui est propre à un calque et n’existait pas en V6 :
 *  - **Fond** : couleur (nuancier des fils ou sélecteur libre) ;
 *  - **Motif** : étendue « toute la chaussette » ou « bande de rangs » ;
 *  - **Image** : aperçu, remplacement, miroirs, frise, valeurs numériques repliées ;
 *  - **Couleurs transparentes** (Motif et Image) : une pastille par couleur principale.
 *
 * Les réglages de carreaux (collection, couleurs de zones, calepinage, taille, raccord)
 * restent ceux de `panel.ts` / `collectionPicker.ts` / `palettePanel.ts` / `calepGallery.ts`,
 * branchés sur le calque Motif sélectionné via `editingMotif()`.
 */
import { motifRows } from '../core/layout';
import { setMotifBand, type StackLayer } from '../core/layers';
import type { Hex } from '../core/types';
import { loadTileFromFile } from '../io/tiles';
import {
  getState,
  patchImageLayer,
  replaceImageAsset,
  resetSelectedLayer,
  setFondColor,
  setMotifBounds,
  setMotifImportes,
  toggleLayerTransparentColor,
  update,
} from '../state';
import { details, makeCheckbox, makeColor, makeSliderNumber } from './controls';
import { embeddedAssetFromTile } from './library';

export interface LayerOptionsDeps {
  /** Couleurs principales du calque (une pastille par couleur). */
  layerKeyColors: (layerId: string) => string[];
  /** Dessine l’image du calque (aperçu) dans le canvas fourni. */
  drawAssetPreview: (layerId: string, canvas: HTMLCanvasElement) => void;
}

export interface LayerOptionsApi {
  /** Nom du calque sélectionné et bouton « Réinitialiser ce calque ». */
  header: HTMLElement;
  /** Source du calque (collection, carreaux importés, image). */
  source: HTMLElement;
  fond: HTMLElement;
  /** Étendue d’un Motif : à placer avec les autres réglages Motif. */
  extent: HTMLElement;
  image: HTMLElement;
  transparency: HTMLElement;
  sync: () => void;
}

function kindLabel(layer: StackLayer): string {
  if (layer.kind === 'fond') return 'Fond';
  return layer.kind === 'motif' ? 'Motif' : 'Image';
}

function cm(rows: number, rowsPerCm: number): string {
  const value = rowsPerCm > 0 ? rows / rowsPerCm : 0;
  return `${value.toFixed(1).replace('.', ',')} cm`;
}

export function mountLayerOptions(deps: LayerOptionsDeps): LayerOptionsApi {
  /** Calque affiché par le panneau (null = aucun). */
  function selected(): StackLayer | null {
    const { design, selectedLayerId } = getState();
    return design.layers.find((l) => l.id === selectedLayerId) ?? null;
  }

  function motifRowCount(): number {
    const { design } = getState();
    return Math.max(1, motifRows(design.dimensions, design.zones));
  }

  // ------------------------------------------------------------------ en-tête
  const header = document.createElement('div');
  header.className = 'layer-head';
  const title = document.createElement('p');
  title.className = 'layer-head-title';
  title.dataset.testid = 'layer-options-title';
  const resetLayer = document.createElement('button');
  resetLayer.type = 'button';
  resetLayer.dataset.testid = 'reset-layer';
  resetLayer.textContent = 'Réinitialiser ce calque';
  resetLayer.addEventListener('click', () => resetSelectedLayer());
  const jacquardGuide = document.createElement('p');
  jacquardGuide.className = 'hint layer-jacquard-guide';
  const guideBtn = document.createElement('button');
  guideBtn.type = 'button';
  guideBtn.className = 'help';
  guideBtn.textContent = '?';
  guideBtn.dataset.testid = 'help-layer-jacquard';
  const guideText =
    'Préférez des dessins en aplats (SVG) ; les photos passent mal en 4 à 6 couleurs de fil.';
  guideBtn.title = guideText;
  guideBtn.setAttribute('aria-label', guideText);
  guideBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.alert(guideText);
  });
  jacquardGuide.append('Conseil jacquard ', guideBtn);
  header.append(title, resetLayer, jacquardGuide);

  const source = document.createElement('div');
  source.className = 'layer-source';
  const sourceText = document.createElement('p');
  sourceText.className = 'hint';
  sourceText.dataset.testid = 'layer-source';
  const useImported = document.createElement('button');
  useImported.type = 'button';
  useImported.dataset.testid = 'motif-use-imported';
  useImported.textContent = 'Utiliser mes carreaux importés';
  useImported.addEventListener('click', () => {
    const layer = selected();
    if (layer?.kind === 'motif') setMotifImportes(undefined, layer.id);
  });
  source.append(sourceText, useImported);

  // ------------------------------------------------------------------ Fond
  const fond = details('Couleur du fond', 'section-fond');
  const fondHint = document.createElement('p');
  fondHint.className = 'hint';
  fondHint.textContent =
    'Le Fond est toujours en bas de la pile : c’est la couleur visible partout où aucun calque ne couvre.';
  const fondColor = makeColor('Couleur libre', 'ctl-fond-color', '#f1e9dc', (value) => {
    setFondColor(value.toLowerCase() as Hex, true);
  });
  const yarnSearch = document.createElement('input');
  yarnSearch.type = 'search';
  yarnSearch.placeholder = 'Rechercher un fil (nom ou code)…';
  yarnSearch.className = 'coll-search';
  yarnSearch.dataset.testid = 'fond-yarn-search';
  const yarnGrid = document.createElement('div');
  yarnGrid.className = 'yarn-grid';
  yarnGrid.dataset.testid = 'fond-yarns';
  fond.append(fondHint, fondColor.root, yarnSearch, yarnGrid);

  let yarnQuery = '';
  let yarnKey = '';
  yarnSearch.addEventListener('input', () => {
    yarnQuery = yarnSearch.value.trim().toLowerCase();
    yarnKey = '';
    renderYarns();
  });

  function renderYarns(): void {
    const { catalogue } = getState();
    const layer = selected();
    const current = layer?.kind === 'fond' ? layer.color.toLowerCase() : '';
    const colors = (catalogue?.nuancier ?? []).filter(
      (c) =>
        c.public &&
        (!yarnQuery ||
          c.id.toLowerCase().includes(yarnQuery) ||
          c.nom.toLowerCase().includes(yarnQuery)),
    );
    const key = `${colors.map((c) => c.id).join(',')}|${current}`;
    if (key === yarnKey) return;
    yarnKey = key;
    yarnGrid.replaceChildren();
    if (colors.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = catalogue
        ? 'Aucun fil ne correspond.'
        : 'Nuancier non synchronisé : utilisez le sélecteur libre.';
      yarnGrid.appendChild(empty);
      return;
    }
    for (const c of colors) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = c.hex.toLowerCase() === current ? 'yarn-chip selected' : 'yarn-chip';
      chip.dataset.testid = `fond-yarn-${c.id}`;
      chip.title = `${c.id} · ${c.nom}`;
      chip.setAttribute('aria-label', chip.title);
      chip.style.background = c.hex;
      chip.addEventListener('click', () => setFondColor(c.hex.toLowerCase() as Hex));
      yarnGrid.appendChild(chip);
    }
  }

  // ------------------------------------------------------------------ Motif : étendue
  const extent = details('Étendue du motif', 'section-etendue');
  const extentGroup = document.createElement('div');
  extentGroup.className = 'radio-row';
  const boundsName = 'motif-bounds';

  function makeRadio(label: string, testId: string): { root: HTMLElement; input: HTMLInputElement } {
    const root = document.createElement('label');
    root.className = 'radio';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = boundsName;
    input.dataset.testid = testId;
    root.append(input, document.createTextNode(` ${label}`));
    return { root, input };
  }

  const boundsAll = makeRadio('Toute la chaussette', 'ctl-bounds-tout');
  const boundsBand = makeRadio('Bande de rangs', 'ctl-bounds-bande');
  extentGroup.append(boundsAll.root, boundsBand.root);

  const bandFrom = makeSliderNumber({
    label: 'Du rang',
    testId: 'ctl-band-from',
    min: 0,
    max: 100,
    step: 1,
    value: 0,
    unit: 'rangs',
    help: 'Premier rang de motif couvert par ce calque (0 = haut de la tige).',
    onChange: () => applyBand(true),
  });
  const bandTo = makeSliderNumber({
    label: 'Au rang',
    testId: 'ctl-band-to',
    min: 1,
    max: 100,
    step: 1,
    value: 100,
    unit: 'rangs',
    help: 'Dernier rang de motif couvert (exclu). Au-delà, on voit le calque du dessous.',
    onChange: () => applyBand(true),
  });
  const bandReadout = document.createElement('p');
  bandReadout.className = 'hint';
  bandReadout.dataset.testid = 'band-readout';
  extent.append(extentGroup, bandFrom.root, bandTo.root, bandReadout);

  function applyBand(coalesce: boolean): void {
    const layer = selected();
    if (layer?.kind !== 'motif') return;
    const rows = motifRowCount();
    const from = Number(bandFrom.input.value);
    const to = Number(bandTo.input.value);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    setMotifBounds(layer.id, setMotifBand(rows, { from, to }), coalesce);
  }

  boundsAll.input.addEventListener('change', () => {
    const layer = selected();
    if (layer?.kind !== 'motif') return;
    setMotifBounds(layer.id, { kind: 'tout' });
  });
  boundsBand.input.addEventListener('change', () => {
    const layer = selected();
    if (layer?.kind !== 'motif') return;
    const rows = motifRowCount();
    const band =
      layer.bounds.kind === 'bande'
        ? { from: layer.bounds.fromRow, to: layer.bounds.toRow }
        : { from: 0, to: Math.max(1, Math.round(rows / 3)) };
    setMotifBounds(layer.id, setMotifBand(rows, band));
  });

  // ------------------------------------------------------------------ Image
  const image = details('Image', 'section-image');
  const preview = document.createElement('canvas');
  preview.className = 'image-preview';
  preview.dataset.testid = 'image-preview';
  preview.width = 160;
  preview.height = 160;
  const replaceRow = document.createElement('div');
  replaceRow.className = 'row';
  const replaceBtn = document.createElement('button');
  replaceBtn.type = 'button';
  replaceBtn.dataset.testid = 'image-replace';
  replaceBtn.textContent = 'Remplacer l’image…';
  const replaceFile = document.createElement('input');
  replaceFile.type = 'file';
  replaceFile.className = 'file-input';
  replaceFile.accept = '.png,.svg,image/png,image/svg+xml';
  replaceFile.dataset.testid = 'image-file';
  replaceBtn.addEventListener('click', () => replaceFile.click());
  replaceFile.addEventListener('change', () => {
    const file = replaceFile.files?.[0];
    replaceFile.value = '';
    const layer = selected();
    if (!file || layer?.kind !== 'image') return;
    void loadTileFromFile(file)
      .then((tile) => embeddedAssetFromTile(file.name, tile))
      .then((asset) => replaceImageAsset(layer.id, asset))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Image illisible.';
        update({ error: message }, { skipHistory: true });
      });
  });
  replaceRow.append(replaceBtn, replaceFile);

  const flipX = makeCheckbox('Miroir horizontal', 'ctl-image-flip-x', false, (checked) => {
    const layer = selected();
    if (layer?.kind === 'image') patchImageLayer(layer.id, { flipX: checked });
  });
  const flipY = makeCheckbox('Miroir vertical', 'ctl-image-flip-y', false, (checked) => {
    const layer = selected();
    if (layer?.kind === 'image') patchImageLayer(layer.id, { flipY: checked });
  });
  const repeat = makeCheckbox(
    'Frise autour de la jambe',
    'ctl-image-repeat',
    false,
    (checked) => {
      const layer = selected();
      if (layer?.kind !== 'image') return;
      patchImageLayer(layer.id, { repeatAroundGap: checked ? Number(repeatGap.input.value) || 0 : null });
    },
    'Répète l’image tout autour de la jambe, avec un écart régulier.',
  );
  const repeatGap = makeSliderNumber({
    label: 'Écart de la frise',
    testId: 'ctl-image-repeat-gap',
    min: 0,
    max: 60,
    step: 1,
    value: 0,
    unit: 'mailles',
    onChange: (value) => {
      const layer = selected();
      if (layer?.kind !== 'image' || layer.repeatAroundGap === null) return;
      patchImageLayer(layer.id, { repeatAroundGap: Math.max(0, Math.round(value)) }, true);
    },
  });

  const numbers = document.createElement('details');
  numbers.className = 'section';
  numbers.dataset.testid = 'section-image-numbers';
  const numbersSummary = document.createElement('summary');
  numbersSummary.className = 'section-summary';
  const numbersTitle = document.createElement('span');
  numbersTitle.className = 'section-title';
  numbersTitle.textContent = 'Valeurs numériques';
  numbersSummary.appendChild(numbersTitle);
  numbers.appendChild(numbersSummary);

  const posX = makeSliderNumber({
    label: 'Position horizontale',
    testId: 'ctl-image-x',
    min: 0,
    max: 480,
    step: 1,
    value: 0,
    unit: 'mailles',
    onChange: (value) => {
      const layer = selected();
      if (layer?.kind === 'image') patchImageLayer(layer.id, { x: Math.round(value) }, true);
    },
  });
  const posY = makeSliderNumber({
    label: 'Position verticale',
    testId: 'ctl-image-y',
    min: 0,
    max: 600,
    step: 1,
    value: 0,
    unit: 'rangs',
    onChange: (value) => {
      const layer = selected();
      if (layer?.kind === 'image') patchImageLayer(layer.id, { y: Math.round(value) }, true);
    },
  });
  const widthStitches = makeSliderNumber({
    label: 'Largeur',
    testId: 'ctl-image-width',
    min: 2,
    max: 480,
    step: 1,
    value: 2,
    unit: 'mailles',
    onChange: (value) => {
      const layer = selected();
      if (layer?.kind === 'image') patchImageLayer(layer.id, { widthStitches: Math.max(2, Math.round(value)) }, true);
    },
  });
  const rotation = makeSliderNumber({
    label: 'Rotation',
    testId: 'ctl-image-rotation',
    min: 0,
    max: 359,
    step: 1,
    value: 0,
    unit: '°',
    onChange: (value) => {
      const layer = selected();
      if (layer?.kind === 'image') patchImageLayer(layer.id, { rotation: Math.round(value) % 360 }, true);
    },
  });
  numbers.append(posX.root, posY.root, widthStitches.root, rotation.root);
  image.append(preview, replaceRow, flipX.root, flipY.root, repeat.root, repeatGap.root, numbers);

  // ------------------------------------------------------------------ Couleurs transparentes
  const transparency = details('Couleurs transparentes', 'section-transparence');
  const transparencyHint = document.createElement('p');
  transparencyHint.className = 'hint';
  transparencyHint.textContent =
    'Un clic rend la couleur transparente (le calque du dessous apparaît) ; un second clic la rétablit.';
  const chips = document.createElement('div');
  chips.className = 'color-chips';
  chips.dataset.testid = 'transparent-colors';
  transparency.append(transparencyHint, chips);

  let chipsKey = '';

  function renderChips(layer: StackLayer): void {
    const colors = deps.layerKeyColors(layer.id);
    const transparent = new Set(layer.transparentColors.map((c) => c.toLowerCase()));
    const key = `${layer.id}|${colors.join(',')}|${[...transparent].sort().join(',')}`;
    if (key === chipsKey) return;
    chipsKey = key;
    chips.replaceChildren();
    if (colors.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Couleurs principales pas encore connues (calque vide ou image en cours de lecture).';
      chips.appendChild(empty);
      return;
    }
    for (const color of colors) {
      const hex = color.toLowerCase();
      const off = transparent.has(hex);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = off ? 'color-chip is-transparent' : 'color-chip';
      chip.dataset.testid = `layer-color-${hex.slice(1)}`;
      chip.dataset.color = hex;
      chip.style.setProperty('--chip', hex);
      chip.title = off ? `${hex} — transparente` : `${hex} — cliquer pour rendre transparente`;
      chip.setAttribute('aria-label', chip.title);
      chip.setAttribute('aria-pressed', off ? 'true' : 'false');
      chip.addEventListener('click', () => toggleLayerTransparentColor(layer.id, hex as Hex));
      chips.appendChild(chip);
    }
  }

  // ------------------------------------------------------------------ synchronisation
  function syncFond(layer: StackLayer): void {
    if (layer.kind !== 'fond') return;
    if (document.activeElement !== fondColor.input) fondColor.input.value = layer.color;
    renderYarns();
  }

  function syncExtent(layer: StackLayer): void {
    if (layer.kind !== 'motif') return;
    const { design } = getState();
    const rows = motifRowCount();
    const band =
      layer.bounds.kind === 'bande'
        ? { from: layer.bounds.fromRow, to: layer.bounds.toRow }
        : { from: 0, to: rows };
    boundsAll.input.checked = layer.bounds.kind === 'tout';
    boundsBand.input.checked = layer.bounds.kind === 'bande';
    bandFrom.setRange(0, Math.max(1, rows - 1));
    bandTo.setRange(1, rows);
    bandFrom.setValue(band.from);
    bandTo.setValue(band.to);
    const isBand = layer.bounds.kind === 'bande';
    bandFrom.root.hidden = !isBand;
    bandTo.root.hidden = !isBand;
    const perCm = design.dimensions.rowsPerCm;
    bandReadout.textContent = isBand
      ? `Du rang ${band.from} au rang ${band.to} sur ${rows} · de ${cm(band.from, perCm)} à ${cm(band.to, perCm)} depuis le haut de la tige.`
      : `Tous les rangs de motif (0 à ${rows}) · ${cm(rows, perCm)} depuis le haut de la tige.`;
  }

  function syncImage(layer: StackLayer): void {
    if (layer.kind !== 'image') return;
    const { design } = getState();
    deps.drawAssetPreview(layer.id, preview);
    flipX.input.checked = layer.flipX;
    flipY.input.checked = layer.flipY;
    repeat.input.checked = layer.repeatAroundGap !== null;
    repeatGap.root.hidden = layer.repeatAroundGap === null;
    repeatGap.setValue(layer.repeatAroundGap ?? 0);
    const rows = motifRowCount();
    posX.setRange(0, design.dimensions.needles);
    posY.setRange(0, rows);
    widthStitches.setRange(2, design.dimensions.needles);
    posX.setValue(Math.round(layer.x));
    posY.setValue(Math.round(layer.y));
    widthStitches.setValue(Math.round(layer.widthStitches));
    rotation.setValue(Math.round(layer.rotation));
  }

  function syncSource(layer: StackLayer): void {
    if (layer.kind === 'fond') {
      sourceText.textContent = 'Une seule couleur, sous tous les autres calques.';
      useImported.hidden = true;
      return;
    }
    if (layer.kind === 'image') {
      const asset = layer.asset;
      const name =
        asset.kind === 'embarquee'
          ? (getState().embeddedAssets.find((a) => a.id === asset.assetId)?.name ?? 'image du projet')
          : `${asset.collectionId} ${asset.variation}`;
      sourceText.textContent = `Image : ${name}`;
      useImported.hidden = true;
      return;
    }
    const { tiles, catalogue } = getState();
    if (layer.source.kind === 'collection') {
      const id = layer.source.collectionId;
      const nom = catalogue?.collections.find((c) => c.id === id)?.nom ?? id;
      sourceText.textContent = `Source : collection ${nom}`;
      useImported.hidden = tiles.length === 0;
      return;
    }
    const count = layer.source.tileIds.length || tiles.length;
    sourceText.textContent = `Source : ${count} carreau${count > 1 ? 'x' : ''} importé${count > 1 ? 's' : ''}`;
    useImported.hidden = true;
  }

  function sync(): void {
    const layer = selected();
    if (!layer) {
      title.textContent = 'Aucun calque sélectionné';
      sourceText.textContent = 'Choisissez un calque dans la liste du bas.';
      useImported.hidden = true;
      resetLayer.hidden = true;
      fond.hidden = true;
      extent.hidden = true;
      image.hidden = true;
      transparency.hidden = true;
      return;
    }
    title.textContent = `${kindLabel(layer)} · ${layer.name}`;
    resetLayer.hidden = false;
    fond.hidden = layer.kind !== 'fond';
    extent.hidden = layer.kind !== 'motif';
    image.hidden = layer.kind !== 'image';
    transparency.hidden = layer.kind === 'fond';
    syncSource(layer);
    syncFond(layer);
    syncExtent(layer);
    syncImage(layer);
    if (layer.kind !== 'fond') renderChips(layer);
  }

  return { header, source, fond, extent, image, transparency, sync };
}
