/**
 * Bibliothèque (T57) : dialogue modal pour ajouter des calques Motif ou Image.
 */
import {
  visibleCollections,
  isPngCollection,
  type Catalogue,
  type Collection,
  type CollectionVariation,
} from '../core/collections';
import type { EmbeddedAsset } from '../core/composition';
import type { TileAsset } from '../core/types';
import { addImageLayer, addMotifLayer, canAddLayer, defaultMotifLayout, getState, subscribe, update } from '../state';
import { collectionThumbDataUrl, nuancierMap, tilesFromCollection } from '../io/collectionTiles';
import {
  bibliothequeImageUrl,
  loadBibliothequeImages,
  type BibliothequeImage,
} from '../io/bibliothequeImages';
import {
  askSharedPassword,
  deleteSharedImage,
  FavorisApiError,
  forgetPassword,
  listSharedImages,
  renameSharedImage,
  sharedImageUrl,
  uploadSharedImage,
  type SharedImage,
} from '../io/imagesClient';
import { encodePng, bytesToBase64 } from '../io/pngCodec';
import { fixtureUrl, loadTileFromFile, loadTileFromUrl } from '../io/tiles';
import { calepinageForCollection } from './collectionPicker';
import { openMenu, closeOpenMenu, type MenuEntry } from './kit/menu';
import { kitButton } from './kit/button';
import { disclosure } from './kit/disclosure';
import { icon } from './kit/icons';

export type LibraryTab = 'collections' | 'images';

export interface LibraryApi {
  open: (tab: LibraryTab) => void;
  close: () => void;
}

/** Image d’exemple servie par l’application (aucun réseau externe). */
const EXAMPLE_IMAGE = 'carreau-test-damier.png';

const CATEGORY_ORDER: Array<{ id: string; label: string }> = [
  { id: 'partagees', label: 'Collections partagées' },
  { id: 'mes-collections', label: 'Mes collections' },
  { id: 'signature', label: 'Signature' },
  { id: 'classic', label: 'Classiques' },
  { id: 'new', label: 'Nouveautés' },
  { id: 'autres', label: 'Autres' },
];

function categoryKey(c: Collection): string {
  if (c.source === 'partagee') return 'partagees';
  if (c.source === 'locale') return 'mes-collections';
  const cat = (c.categorie ?? '').toLowerCase();
  if (cat === 'collections partagées' || cat === 'partagees' || cat === 'partagées') return 'partagees';
  if (cat === 'mes-collections' || cat === 'locale' || cat === 'local') return 'mes-collections';
  if (cat === 'signature') return 'signature';
  if (cat === 'classic' || cat === 'classique' || cat === 'classiques') return 'classic';
  if (cat === 'new' || cat === 'nouveaute' || cat === 'nouveautés' || cat === 'nouveautes') return 'new';
  return 'autres';
}

function matches(c: Collection, query: string): boolean {
  if (!query) return true;
  return `${c.nom} ${c.id} ${c.description}`.toLowerCase().includes(query.toLowerCase());
}

function assetPreviewUrl(asset: EmbeddedAsset): string {
  if (asset.mime === 'image/svg+xml' && !asset.data.startsWith('data:')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.data)}`;
  }
  if (asset.data.startsWith('data:')) return asset.data;
  return `data:${asset.mime};base64,${asset.data}`;
}

/** Champ recherche avec loupe (kit). */
function makeSearchField(opts: {
  placeholder: string;
  testId: string;
  extraClass?: string;
}): { root: HTMLElement; input: HTMLInputElement } {
  const root = document.createElement('div');
  root.className = 'library-search-field';
  const ico = icon('search', { size: 16, className: 'library-search-icon' });
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = opts.placeholder;
  input.dataset.testid = opts.testId;
  if (opts.extraClass) input.className = opts.extraClass;
  root.append(ico, input);
  return { root, input };
}

/** Carreau rasterisé (PNG ou SVG) → image embarquée dans le projet (aucun envoi réseau). */
export async function embeddedAssetFromTile(
  name: string,
  tile: { width: number; height: number; rgba: Uint8ClampedArray; svgText?: string },
): Promise<EmbeddedAsset> {
  const id = `A${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (tile.svgText !== undefined) {
    return { id, name, mime: 'image/svg+xml', data: tile.svgText, width: tile.width, height: tile.height };
  }
  const png = await encodePng(tile.rgba, tile.width, tile.height);
  return {
    id,
    name,
    mime: 'image/png',
    data: `data:image/png;base64,${bytesToBase64(png)}`,
    width: tile.width,
    height: tile.height,
  };
}

export function mountLibrary(host: HTMLElement): LibraryApi {
  const dialog = document.createElement('dialog');
  dialog.className = 'library';
  dialog.dataset.testid = 'library-dialog';

  const header = document.createElement('div');
  header.className = 'library-header';

  const tabCollections = document.createElement('button');
  tabCollections.type = 'button';
  tabCollections.className = 'tab';
  tabCollections.dataset.testid = 'lib-tab-collections';
  tabCollections.textContent = 'Collections';

  const tabImages = document.createElement('button');
  tabImages.type = 'button';
  tabImages.className = 'tab';
  tabImages.dataset.testid = 'lib-tab-images';
  tabImages.textContent = 'Images';

  const spacer = document.createElement('span');
  spacer.className = 'library-spacer';

  const closeBtn = kitButton({
    variant: 'ghost',
    label: 'Fermer',
    compact: true,
    testId: 'lib-close',
    icon: 'close',
  });

  header.append(tabCollections, tabImages, spacer, closeBtn);

  const status = document.createElement('p');
  status.className = 'hint';
  status.dataset.testid = 'lib-status';

  // -------------------------------------------------------------- onglet Collections
  const collectionsPane = document.createElement('div');
  collectionsPane.className = 'library-pane';
  collectionsPane.dataset.testid = 'lib-pane-collections';

  const searchField = makeSearchField({
    placeholder: 'Rechercher une collection…',
    testId: 'lib-search',
    extraClass: 'coll-search',
  });
  const search = searchField.input;

  const collectionsList = document.createElement('div');
  collectionsList.className = 'library-collections';
  collectionsList.dataset.testid = 'lib-collections';

  collectionsPane.append(searchField.root, collectionsList);

  // -------------------------------------------------------------- onglet Images
  const imagesPane = document.createElement('div');
  imagesPane.className = 'library-pane library-pane-images';
  imagesPane.dataset.testid = 'lib-pane-images';

  const bibSection = document.createElement('section');
  bibSection.className = 'library-section library-bib';
  bibSection.dataset.testid = 'lib-bib-section';
  const bibHead = document.createElement('div');
  bibHead.className = 'library-section-head';
  const bibTitle = document.createElement('h3');
  bibTitle.className = 'calep-group-title';
  bibTitle.textContent = 'Bibliothèque';
  const bibCount = document.createElement('span');
  bibCount.className = 'library-section-count';
  bibCount.dataset.testid = 'lib-bib-count';
  bibHead.append(bibTitle, bibCount);
  const bibFilterField = makeSearchField({
    placeholder: 'Filtrer la bibliothèque…',
    testId: 'lib-bib-filter',
    extraClass: 'library-search',
  });
  const bibFilter = bibFilterField.input;
  const bibList = document.createElement('div');
  bibList.className = 'library-grid';
  bibList.dataset.testid = 'lib-bib-list';
  bibSection.append(bibHead, bibFilterField.root, bibList);

  const sharedSection = document.createElement('section');
  sharedSection.className = 'library-section library-shared';
  sharedSection.dataset.testid = 'lib-shared-section';
  const sharedHead = document.createElement('div');
  sharedHead.className = 'library-section-head';
  const sharedTitle = document.createElement('h3');
  sharedTitle.className = 'calep-group-title';
  sharedTitle.textContent = 'Bibliothèque partagée';
  const sharedCount = document.createElement('span');
  sharedCount.className = 'library-section-count';
  sharedCount.dataset.testid = 'lib-shared-count';
  sharedHead.append(sharedTitle, sharedCount);
  const sharedToolbar = document.createElement('div');
  sharedToolbar.className = 'library-section-toolbar';
  const sharedFilterField = makeSearchField({
    placeholder: 'Filtrer le partagé…',
    testId: 'lib-shared-filter',
    extraClass: 'library-search',
  });
  const sharedFilter = sharedFilterField.input;
  const sharedUpload = kitButton({
    variant: 'ghost',
    label: 'Envoyer une image…',
    icon: 'upload',
    compact: true,
    testId: 'lib-shared-upload',
  });
  const sharedFile = document.createElement('input');
  sharedFile.type = 'file';
  sharedFile.accept = '.png,.svg,image/png,image/svg+xml';
  sharedFile.dataset.testid = 'lib-shared-file';
  sharedFile.hidden = true;
  const sharedStatus = document.createElement('p');
  sharedStatus.className = 'hint';
  sharedStatus.dataset.testid = 'lib-shared-status';
  sharedStatus.hidden = true;
  const sharedList = document.createElement('div');
  sharedList.className = 'library-grid';
  sharedList.dataset.testid = 'lib-shared-list';
  sharedToolbar.append(sharedFilterField.root, sharedUpload, sharedFile);
  sharedSection.append(sharedHead, sharedToolbar, sharedStatus, sharedList);

  const projectSection = document.createElement('section');
  projectSection.className = 'library-section library-project';
  const projectHead = document.createElement('div');
  projectHead.className = 'library-section-head';
  const projectTitle = document.createElement('h3');
  projectTitle.className = 'calep-group-title';
  projectTitle.textContent = 'Images du projet';
  const projectCount = document.createElement('span');
  projectCount.className = 'library-section-count';
  projectCount.dataset.testid = 'lib-project-count';
  projectHead.append(projectTitle, projectCount);

  const imagesTools = document.createElement('div');
  imagesTools.className = 'library-tools';

  const exampleBtn = kitButton({
    variant: 'ghost',
    label: 'Ajouter l’image d’exemple',
    compact: true,
    testId: 'lib-image-example',
  });

  const importBtn = kitButton({
    variant: 'ghost',
    label: 'Importer PNG / SVG…',
    icon: 'download',
    compact: true,
    testId: 'lib-image-import',
  });

  const importAsMotif = document.createElement('label');
  importAsMotif.className = 'row library-import-motif';
  const importAsMotifBox = document.createElement('input');
  importAsMotifBox.type = 'checkbox';
  importAsMotifBox.dataset.testid = 'lib-import-as-motif';
  importAsMotif.append(importAsMotifBox, document.createTextNode(' Importer comme carreau (Motif)'));

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.png,.svg,image/png,image/svg+xml';
  fileInput.multiple = true;
  fileInput.dataset.testid = 'lib-image-file';
  fileInput.hidden = true;

  imagesTools.append(exampleBtn, importBtn, importAsMotif, fileInput);

  const imagesDrop = document.createElement('div');
  imagesDrop.className = 'library-drop';
  imagesDrop.dataset.testid = 'lib-images-drop';
  imagesDrop.textContent = 'Glisser-déposer des PNG ou SVG ici';

  const imagesList = document.createElement('div');
  imagesList.className = 'library-grid';
  imagesList.dataset.testid = 'lib-images';

  projectSection.append(projectHead, imagesTools, imagesDrop, imagesList);
  imagesPane.append(bibSection, sharedSection, projectSection);

  dialog.append(header, status, collectionsPane, imagesPane);
  host.appendChild(dialog);

  let activeTab: LibraryTab = 'collections';
  let busy = false;
  let openInfoId: string | null = null;
  const thumbs = new Map<string, string>();

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function setBusy(on: boolean): void {
    busy = on;
    dialog.classList.toggle('busy', on);
  }

  function close(): void {
    closeOpenMenu();
    openInfoId = null;
    if (dialog.open) dialog.close();
  }

  async function thumbFor(c: Collection, cat: Catalogue): Promise<string> {
    const cached = thumbs.get(c.id);
    if (cached !== undefined) return cached;
    const url = await collectionThumbDataUrl(c, nuancierMap(cat));
    thumbs.set(c.id, url);
    return url;
  }

  async function addCollectionLayer(c: Collection, cat: Catalogue): Promise<void> {
    if (busy) return;
    setBusy(true);
    setStatus(`Chargement de « ${c.nom} »…`);
    try {
      const colors = { ...c.couleursParDefaut };
      const tiles = await tilesFromCollection(c, colors, nuancierMap(cat));
      const prefix = `${c.id.toLowerCase()}-`;
      const others = getState().tiles.filter((t) => !t.name.toLowerCase().startsWith(prefix));
      const png = isPngCollection(c);
      const added = addMotifLayer(
        { kind: 'collection', collectionId: c.id, colors: png ? {} : colors, paletteId: 'defaut' },
        { ...defaultMotifLayout(), calepinage: calepinageForCollection(c) },
        c.nom,
        [...others, ...tiles],
      );
      if (added) close();
      else setStatus('16 calques au maximum.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Collection illisible.';
      setStatus(message);
      update({ error: message }, { skipHistory: true });
    } finally {
      setBusy(false);
    }
  }

  function addVariationImage(c: Collection, variation: CollectionVariation): void {
    if (busy) return;
    const label = `${c.nom} · ${variation.name}`;
    const added = addImageLayer(
      { kind: 'collection', collectionId: c.id, variation: variation.name },
      label,
    );
    if (added) close();
    else setStatus('16 calques au maximum.');
  }

  function addAssetLayer(asset: EmbeddedAsset, assets: EmbeddedAsset[]): void {
    const added = addImageLayer({ kind: 'embarquee', assetId: asset.id }, asset.name, assets);
    if (added) close();
    else setStatus('16 calques au maximum.');
  }

  function addBibliothequeLayer(entry: BibliothequeImage): void {
    if (busy) return;
    const added = addImageLayer({ kind: 'bibliotheque', imageId: entry.id }, entry.nom);
    if (added) close();
    else setStatus('16 calques au maximum.');
  }

  function addSharedLayer(entry: SharedImage): void {
    if (busy) return;
    const added = addImageLayer({ kind: 'partagee', imageId: entry.id }, entry.nom);
    if (added) close();
    else setStatus('16 calques au maximum.');
  }

  let sharedCache: SharedImage[] | null = null;
  let sharedUnavailable = false;

  function renderShared(entries: SharedImage[] | null, unavailable: boolean): void {
    sharedList.replaceChildren();
    if (unavailable) {
      sharedCount.textContent = '';
      sharedStatus.hidden = true;
      sharedStatus.textContent = '';
      const empty = document.createElement('p');
      empty.className = 'library-empty';
      empty.textContent = 'Bibliothèque partagée indisponible';
      empty.dataset.testid = 'lib-shared-unavailable';
      sharedList.appendChild(empty);
      return;
    }
    sharedStatus.hidden = true;
    sharedStatus.textContent = '';
    const list = entries ?? [];
    const q = sharedFilter.value.trim().toLowerCase();
    const filtered = list.filter((e) => {
      if (!q) return true;
      return `${e.nom} ${e.id}`.toLowerCase().includes(q);
    });
    sharedCount.textContent = `${filtered.length}`;
    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'library-empty';
      empty.textContent = list.length === 0 ? 'Aucune image partagée pour l’instant.' : 'Aucun résultat.';
      sharedList.appendChild(empty);
      return;
    }
    for (const entry of filtered) {
      const wrap = document.createElement('div');
      wrap.className = 'library-item-wrap library-shared-item';
      wrap.dataset.testid = `lib-shared-wrap-${entry.id}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-item';
      button.dataset.testid = `lib-shared-${entry.id}`;
      const media = document.createElement('div');
      media.className = 'library-item-media';
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'coll-thumb';
      img.src = sharedImageUrl(entry.id);
      media.appendChild(img);
      const body = document.createElement('div');
      body.className = 'library-item-body';
      const name = document.createElement('span');
      name.className = 'coll-name';
      name.textContent = entry.nom;
      body.appendChild(name);
      button.append(media, body);
      button.addEventListener('click', () => addSharedLayer(entry));

      const more = kitButton({
        variant: 'icon',
        icon: 'more',
        compact: true,
        testId: `lib-shared-menu-${entry.id}`,
        ariaLabel: 'Plus d’actions',
      });
      more.classList.add('library-item-more');
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        const items: MenuEntry[] = [
          {
            id: 'add',
            label: 'Ajouter comme image',
            icon: 'plus',
            onSelect: () => addSharedLayer(entry),
          },
          { separator: true },
          {
            id: 'rename',
            label: 'Renommer',
            icon: 'pencil',
            testId: `lib-shared-rename-${entry.id}`,
            onSelect: () => {
              void renameSharedEntry(entry);
            },
          },
          {
            id: 'remove',
            label: 'Retirer',
            icon: 'trash',
            danger: true,
            testId: `lib-shared-remove-${entry.id}`,
            onSelect: () => {
              void removeSharedEntry(entry);
            },
          },
        ];
        openMenu({
          anchor: more,
          trigger: more,
          items,
          testId: `lib-shared-kit-menu-${entry.id}`,
        });
      });

      wrap.append(button, more);
      sharedList.appendChild(wrap);
    }
  }

  async function refreshShared(): Promise<void> {
    try {
      sharedCache = await listSharedImages();
      sharedUnavailable = false;
      if (activeTab === 'images') renderShared(sharedCache, false);
    } catch {
      sharedCache = null;
      sharedUnavailable = true;
      if (activeTab === 'images') renderShared(null, true);
    }
  }

  async function withSharedPassword(
    run: (password: string) => Promise<void>,
    retryError?: string | null,
  ): Promise<void> {
    const password = await askSharedPassword(retryError);
    if (!password) return;
    try {
      await run(password);
    } catch (e) {
      if (e instanceof FavorisApiError && e.status === 401) {
        forgetPassword();
        await withSharedPassword(run, 'Mot de passe incorrect');
        return;
      }
      sharedStatus.hidden = false;
      sharedStatus.textContent = e instanceof Error ? e.message : 'Action impossible.';
    }
  }

  async function renameSharedEntry(entry: SharedImage): Promise<void> {
    const nom = window.prompt('Nouveau nom', entry.nom)?.trim();
    if (!nom || nom === entry.nom) return;
    await withSharedPassword(async (password) => {
      await renameSharedImage(entry.id, nom, password);
      await refreshShared();
    });
  }

  async function removeSharedEntry(entry: SharedImage): Promise<void> {
    if (!window.confirm(`Retirer « ${entry.nom} » de la bibliothèque partagée ?`)) return;
    await withSharedPassword(async (password) => {
      await deleteSharedImage(entry.id, password);
      await refreshShared();
    });
  }

  async function uploadSharedFile(file: File): Promise<void> {
    if (busy) return;
    setBusy(true);
    sharedStatus.hidden = false;
    sharedStatus.textContent = 'Envoi…';
    try {
      await withSharedPassword(async (password) => {
        const created = await uploadSharedImage(file, password);
        await refreshShared();
        const added = addImageLayer({ kind: 'partagee', imageId: created.id }, created.nom);
        if (!added) setStatus('16 calques au maximum.');
        else close();
      });
    } finally {
      setBusy(false);
    }
  }

  function addImportedMotifLayer(tile: TileAsset, tiles: TileAsset[], name: string): void {
    const added = addMotifLayer({ kind: 'importes', tileIds: [tile.id] }, defaultMotifLayout(), name, tiles);
    if (added) close();
    else setStatus('16 calques au maximum.');
  }

  async function addExample(): Promise<void> {
    if (busy || importAsMotifBox.checked) return;
    setBusy(true);
    setStatus('Chargement de l’exemple…');
    try {
      const existing = getState().embeddedAssets.find((a) => a.name === EXAMPLE_IMAGE);
      if (existing) {
        addAssetLayer(existing, [...getState().embeddedAssets]);
        return;
      }
      const tile = await loadTileFromUrl(fixtureUrl(EXAMPLE_IMAGE));
      const asset = await embeddedAssetFromTile(EXAMPLE_IMAGE, tile);
      addAssetLayer(asset, [...getState().embeddedAssets, asset]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image d’exemple illisible.';
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function importFiles(files: File[]): Promise<void> {
    if (busy || files.length === 0) return;
    setBusy(true);
    const asMotif = importAsMotifBox.checked;
    try {
      for (const file of files) {
        if (!canAddLayer()) {
          setStatus('16 calques au maximum.');
          break;
        }
        const tile = await loadTileFromFile(file);
        if (asMotif) {
          const tiles = [...getState().tiles, tile];
          const base = file.name.replace(/\.[^.]+$/, '') || file.name;
          addImportedMotifLayer(tile, tiles, base);
          if (!dialog.open) break;
        } else {
          const asset = await embeddedAssetFromTile(file.name, tile);
          addAssetLayer(asset, [...getState().embeddedAssets, asset]);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import impossible.';
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  function openVariationPicker(c: Collection, anchor: HTMLElement): void {
    const items: MenuEntry[] = c.variations.map((variation) => ({
      id: `var-${variation.name}`,
      label: variation.name,
      testId: `lib-add-variation-${c.id}-${variation.name}`,
      onSelect: () => addVariationImage(c, variation),
    }));
    if (items.length === 0) return;
    openMenu({
      anchor,
      trigger: anchor,
      items,
      testId: 'lib-variation-menu',
    });
  }

  function renderCollectionItem(c: Collection, cat: Catalogue, container: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'library-item-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-item';
    button.dataset.testid = `lib-collection-${c.id}`;
    button.title = c.nom;

    const media = document.createElement('div');
    media.className = 'library-item-media';
    const img = document.createElement('img');
    img.alt = '';
    img.className = 'coll-thumb';
    void thumbFor(c, cat).then((src) => {
      if (src) img.src = src;
    });
    media.appendChild(img);

    const body = document.createElement('div');
    body.className = 'library-item-body';
    const name = document.createElement('span');
    name.className = 'coll-name';
    name.textContent = c.nom;
    const meta = document.createElement('span');
    meta.className = 'coll-meta';
    meta.textContent = `${c.variations.length} variation${c.variations.length > 1 ? 's' : ''}`;
    body.append(name, meta);
    button.append(media, body);
    button.addEventListener('click', () => void addCollectionLayer(c, cat));
    button.addEventListener('dblclick', (event) => {
      event.preventDefault();
      void addCollectionLayer(c, cat);
    });

    const hover = document.createElement('div');
    hover.className = 'library-item-hover';
    const addBtn = kitButton({
      variant: 'primary',
      label: 'Ajouter',
      compact: true,
      testId: `lib-add-${c.id}`,
      onClick: (event) => {
        event.stopPropagation();
        void addCollectionLayer(c, cat);
      },
    });
    hover.appendChild(addBtn);

    const more = kitButton({
      variant: 'icon',
      icon: 'more',
      compact: true,
      testId: `lib-collection-menu-${c.id}`,
      ariaLabel: 'Plus d’actions',
    });
    more.classList.add('library-item-more');
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const items: MenuEntry[] = [
        {
          id: 'motif',
          label: 'Ajouter comme motif',
          icon: 'layers',
          onSelect: () => {
            void addCollectionLayer(c, cat);
          },
        },
        {
          id: 'variation',
          label: 'Ajouter une variation comme image',
          icon: 'gallery',
          onSelect: () => {
            queueMicrotask(() => openVariationPicker(c, more));
          },
        },
      ];
      openMenu({ anchor: more, trigger: more, items, testId: `lib-menu-${c.id}` });
    });

    const infoBody = document.createElement('div');
    infoBody.className = 'library-info-panel';
    const format = document.createElement('p');
    format.textContent = c.format ? `Format ${c.format}` : 'Format —';
    const vars = document.createElement('p');
    vars.textContent = `Variations : ${c.variations.map((v) => v.name).join(', ')}`;
    infoBody.append(format, vars);
    const swatches = document.createElement('div');
    swatches.className = 'library-info-swatches';
    const map = nuancierMap(cat);
    const defaults = c.couleursParDefaut ?? {};
    for (const code of Object.values(defaults).slice(0, 8)) {
      const entry = map.get(code);
      const hex = entry?.hex ?? '#cccccc';
      const i = document.createElement('i');
      i.style.background = hex;
      i.title = entry ? `${entry.id} · ${entry.hex}` : code;
      swatches.appendChild(i);
    }
    if (swatches.childElementCount) infoBody.appendChild(swatches);

    const info = disclosure({
      label: 'Infos',
      content: infoBody,
      testId: `lib-info-${c.id}`,
      open: openInfoId === c.id,
      onToggle: (open) => {
        openInfoId = open ? c.id : openInfoId === c.id ? null : openInfoId;
        if (open) {
          for (const other of collectionsList.querySelectorAll<HTMLElement>('.kit-disclosure')) {
            if (other === info) continue;
            if (!other.classList.contains('kit-disclosure--open')) continue;
            const trigger = other.querySelector<HTMLButtonElement>('.kit-disclosure__trigger');
            if (trigger?.getAttribute('aria-expanded') === 'true') trigger.click();
          }
        }
      },
    });

    wrap.append(button, hover, more, info);
    container.appendChild(wrap);
  }

  function renderCollections(): void {
    const { catalogue, sharedCollectionsUnavailable } = getState();
    collectionsList.replaceChildren();
    if (!catalogue) {
      setStatus('Collections non synchronisées : lancez `npm run sync:carreaux`.');
      return;
    }
    const query = search.value.trim();
    const items = visibleCollections(catalogue, false).filter((c) => matches(c, query));
    if (items.length === 0) {
      setStatus(
        sharedCollectionsUnavailable
          ? 'Aucune collection ne correspond. Collections partagées indisponibles (hors ligne ou API absente).'
          : 'Aucune collection ne correspond.',
      );
      return;
    }
    setStatus(
      sharedCollectionsUnavailable
        ? `${items.length} collection${items.length > 1 ? 's' : ''} · Collections partagées indisponibles.`
        : `${items.length} collection${items.length > 1 ? 's' : ''} · un clic ajoute un calque Motif.`,
    );

    const byCat = new Map<string, Collection[]>();
    for (const c of items) {
      const key = categoryKey(c);
      const arr = byCat.get(key) ?? [];
      arr.push(c);
      byCat.set(key, arr);
    }

    for (const group of CATEGORY_ORDER) {
      const cols = byCat.get(group.id);
      if (!cols?.length) continue;
      const h = document.createElement('h3');
      h.className = 'calep-group-title';
      h.textContent = group.label;
      h.dataset.testid = `lib-cat-${group.id}`;
      collectionsList.appendChild(h);
      const row = document.createElement('div');
      row.className = 'library-grid';
      for (const c of cols) renderCollectionItem(c, catalogue, row);
      collectionsList.appendChild(row);
    }

    if (sharedCollectionsUnavailable && !byCat.has('partagees')) {
      const note = document.createElement('p');
      note.className = 'library-empty';
      note.dataset.testid = 'lib-shared-unavailable';
      note.textContent = 'Collections partagées indisponibles (hors ligne ou API absente).';
      collectionsList.appendChild(note);
    }
  }

  function renderBibliotheque(entries: BibliothequeImage[]): void {
    const q = bibFilter.value.trim().toLowerCase();
    bibList.replaceChildren();
    const filtered = entries.filter((e) => {
      if (!q) return true;
      return `${e.nom} ${e.id} ${e.categorie}`.toLowerCase().includes(q);
    });
    bibCount.textContent = `${filtered.length}`;
    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'library-empty';
      empty.textContent = entries.length === 0 ? 'Aucune image dans la bibliothèque.' : 'Aucun résultat.';
      bibList.appendChild(empty);
      return;
    }
    for (const entry of filtered) {
      const wrap = document.createElement('div');
      wrap.className = 'library-item-wrap';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-item';
      button.dataset.testid = `lib-bib-${entry.id}`;
      const media = document.createElement('div');
      media.className = 'library-item-media';
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'coll-thumb';
      img.src = bibliothequeImageUrl(entry.fichier);
      media.appendChild(img);
      const body = document.createElement('div');
      body.className = 'library-item-body';
      const name = document.createElement('span');
      name.className = 'coll-name';
      name.textContent = entry.nom;
      const cat = document.createElement('span');
      cat.className = 'coll-meta';
      cat.textContent = entry.categorie;
      body.append(name, cat);
      button.append(media, body);
      button.addEventListener('click', () => addBibliothequeLayer(entry));

      const hover = document.createElement('div');
      hover.className = 'library-item-hover';
      const addBtn = kitButton({
        variant: 'primary',
        label: 'Ajouter',
        compact: true,
        testId: `lib-bib-add-${entry.id}`,
        onClick: (event) => {
          event.stopPropagation();
          addBibliothequeLayer(entry);
        },
      });
      hover.appendChild(addBtn);

      wrap.append(button, hover);
      bibList.appendChild(wrap);
    }
  }

  function renderImages(): void {
    const { embeddedAssets } = getState();
    imagesList.replaceChildren();
    projectCount.textContent = `${embeddedAssets.length}`;
    void loadBibliothequeImages().then((entries) => {
      if (activeTab !== 'images') return;
      renderBibliotheque(entries);
      const bibN = entries.length;
      setStatus(
        bibN > 0
          ? `${bibN} image${bibN > 1 ? 's' : ''} en bibliothèque · ${embeddedAssets.length} dans le projet.`
          : embeddedAssets.length === 0
            ? 'Aucune image : ajoutez l’exemple ou importez un PNG / SVG.'
            : `${embeddedAssets.length} image${embeddedAssets.length > 1 ? 's' : ''} dans le projet · un clic ajoute un calque Image.`,
      );
    });
    void refreshShared();
    if (embeddedAssets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'library-empty';
      empty.textContent = 'Aucune image dans le projet.';
      imagesList.appendChild(empty);
      return;
    }
    for (const asset of embeddedAssets) {
      const wrap = document.createElement('div');
      wrap.className = 'library-item-wrap';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-item';
      button.dataset.testid = `lib-asset-${asset.id}`;
      const media = document.createElement('div');
      media.className = 'library-item-media';
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'coll-thumb';
      img.src = assetPreviewUrl(asset);
      media.appendChild(img);
      const body = document.createElement('div');
      body.className = 'library-item-body';
      const name = document.createElement('span');
      name.className = 'coll-name';
      name.textContent = asset.name;
      body.appendChild(name);
      button.append(media, body);
      button.addEventListener('click', () => addAssetLayer(asset, [...getState().embeddedAssets]));
      const hover = document.createElement('div');
      hover.className = 'library-item-hover';
      const addBtn = kitButton({
        variant: 'primary',
        label: 'Ajouter',
        compact: true,
        onClick: (event) => {
          event.stopPropagation();
          addAssetLayer(asset, [...getState().embeddedAssets]);
        },
      });
      hover.appendChild(addBtn);
      wrap.append(button, hover);
      imagesList.appendChild(wrap);
    }
  }

  function showTab(tab: LibraryTab): void {
    activeTab = tab;
    const onCollections = tab === 'collections';
    tabCollections.classList.toggle('active', onCollections);
    tabImages.classList.toggle('active', !onCollections);
    collectionsPane.hidden = !onCollections;
    imagesPane.hidden = onCollections;
    closeOpenMenu();
    if (onCollections) renderCollections();
    else renderImages();
  }

  tabCollections.addEventListener('click', () => showTab('collections'));
  tabImages.addEventListener('click', () => showTab('images'));
  closeBtn.addEventListener('click', () => close());
  dialog.addEventListener('close', () => {
    closeOpenMenu();
    openInfoId = null;
  });
  search.addEventListener('input', () => {
    if (activeTab === 'collections') renderCollections();
  });
  bibFilter.addEventListener('input', () => {
    void loadBibliothequeImages().then((entries) => {
      if (activeTab === 'images') renderBibliotheque(entries);
    });
  });
  sharedFilter.addEventListener('input', () => {
    if (activeTab === 'images') renderShared(sharedCache, sharedUnavailable);
  });
  sharedUpload.addEventListener('click', () => sharedFile.click());
  sharedFile.addEventListener('change', () => {
    const file = sharedFile.files?.[0];
    sharedFile.value = '';
    if (file) void uploadSharedFile(file);
  });
  importBtn.addEventListener('click', () => fileInput.click());
  exampleBtn.addEventListener('click', () => void addExample());
  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    void importFiles(files);
  });

  imagesDrop.addEventListener('dragover', (event) => {
    event.preventDefault();
    imagesDrop.classList.add('over');
  });
  imagesDrop.addEventListener('dragleave', () => imagesDrop.classList.remove('over'));
  imagesDrop.addEventListener('drop', (event) => {
    event.preventDefault();
    imagesDrop.classList.remove('over');
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) void importFiles(files);
  });

  subscribe(() => {
    if (!dialog.open) return;
    if (activeTab === 'collections') renderCollections();
    else renderImages();
  });

  return {
    open(tab) {
      showTab(tab);
      if (!dialog.open) dialog.showModal();
    },
    close,
  };
}
