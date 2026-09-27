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
import { encodePng, bytesToBase64 } from '../io/pngCodec';
import { fixtureUrl, loadTileFromFile, loadTileFromUrl } from '../io/tiles';
import { calepinageForCollection } from './collectionPicker';

export type LibraryTab = 'collections' | 'images';

export interface LibraryApi {
  open: (tab: LibraryTab) => void;
  close: () => void;
}

/** Image d’exemple servie par l’application (aucun réseau externe). */
const EXAMPLE_IMAGE = 'carreau-test-damier.png';

const CATEGORY_ORDER: Array<{ id: string; label: string }> = [
  { id: 'mes-collections', label: 'Mes collections' },
  { id: 'signature', label: 'Signature' },
  { id: 'classic', label: 'Classiques' },
  { id: 'new', label: 'Nouveautés' },
  { id: 'autres', label: 'Autres' },
];

function categoryKey(c: Collection): string {
  if (c.source === 'locale') return 'mes-collections';
  const cat = (c.categorie ?? '').toLowerCase();
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

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.dataset.testid = 'lib-close';
  closeBtn.textContent = 'Fermer';

  header.append(tabCollections, tabImages, spacer, closeBtn);

  const status = document.createElement('p');
  status.className = 'hint';
  status.dataset.testid = 'lib-status';

  // -------------------------------------------------------------- onglet Collections
  const collectionsPane = document.createElement('div');
  collectionsPane.className = 'library-pane';
  collectionsPane.dataset.testid = 'lib-pane-collections';

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher une collection…';
  search.dataset.testid = 'lib-search';
  search.className = 'coll-search';

  const collectionsList = document.createElement('div');
  collectionsList.className = 'library-collections';
  collectionsList.dataset.testid = 'lib-collections';

  collectionsPane.append(search, collectionsList);

  // -------------------------------------------------------------- onglet Images
  const imagesPane = document.createElement('div');
  imagesPane.className = 'library-pane library-pane-images';
  imagesPane.dataset.testid = 'lib-pane-images';

  const imagesTools = document.createElement('div');
  imagesTools.className = 'library-tools';

  const exampleBtn = document.createElement('button');
  exampleBtn.type = 'button';
  exampleBtn.dataset.testid = 'lib-image-example';
  exampleBtn.textContent = 'Ajouter l’image d’exemple';

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.dataset.testid = 'lib-image-import';
  importBtn.textContent = 'Importer PNG / SVG…';

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

  imagesPane.append(imagesTools, imagesDrop, imagesList);

  const variationMenu = document.createElement('div');
  variationMenu.className = 'library-variation-menu';
  variationMenu.dataset.testid = 'lib-variation-menu';
  variationMenu.hidden = true;
  variationMenu.setAttribute('role', 'menu');

  dialog.append(header, status, collectionsPane, imagesPane, variationMenu);
  host.appendChild(dialog);

  let activeTab: LibraryTab = 'collections';
  let busy = false;
  let variationAnchor: HTMLElement | null = null;
  const thumbs = new Map<string, string>();

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function setBusy(on: boolean): void {
    busy = on;
    dialog.classList.toggle('busy', on);
  }

  function close(): void {
    closeVariationMenu();
    if (dialog.open) dialog.close();
  }

  function closeVariationMenu(): void {
    variationMenu.hidden = true;
    variationAnchor = null;
    variationMenu.replaceChildren();
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

  function openVariationMenu(c: Collection, anchor: HTMLElement): void {
    if (variationAnchor === anchor && !variationMenu.hidden) {
      closeVariationMenu();
      return;
    }
    variationAnchor = anchor;
    variationMenu.replaceChildren();
    const title = document.createElement('p');
    title.className = 'library-variation-title';
    title.textContent = 'Ajouter une variation comme image';
    variationMenu.appendChild(title);
    for (const variation of c.variations) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'library-variation-item';
      item.role = 'menuitem';
      item.dataset.testid = `lib-add-variation-${c.id}-${variation.name}`;
      item.textContent = variation.name;
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        addVariationImage(c, variation);
        closeVariationMenu();
      });
      variationMenu.appendChild(item);
    }
    variationMenu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    variationMenu.style.left = `${Math.min(rect.left - dialogRect.left, dialogRect.width - 220)}px`;
    variationMenu.style.top = `${rect.bottom - dialogRect.top + 4}px`;
  }

  function renderCollectionItem(c: Collection, cat: Catalogue, container: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'library-item-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-item';
    button.dataset.testid = `lib-collection-${c.id}`;
    button.title = c.nom;
    const img = document.createElement('img');
    img.alt = '';
    img.className = 'coll-thumb';
    void thumbFor(c, cat).then((src) => {
      if (src) img.src = src;
    });
    const name = document.createElement('span');
    name.className = 'coll-name';
    name.textContent = c.nom;
    button.append(img, name);
    button.addEventListener('click', () => void addCollectionLayer(c, cat));

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'library-item-more';
    more.dataset.testid = `lib-collection-menu-${c.id}`;
    more.title = 'Variations comme image';
    more.textContent = '▾';
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      openVariationMenu(c, more);
    });

    wrap.append(button, more);
    container.appendChild(wrap);
  }

  function renderCollections(): void {
    const { catalogue } = getState();
    collectionsList.replaceChildren();
    if (!catalogue) {
      setStatus('Collections non synchronisées : lancez `npm run sync:carreaux`.');
      return;
    }
    const query = search.value.trim();
    const items = visibleCollections(catalogue, false).filter((c) => matches(c, query));
    if (items.length === 0) {
      setStatus('Aucune collection ne correspond.');
      return;
    }
    setStatus(`${items.length} collection${items.length > 1 ? 's' : ''} · un clic ajoute un calque Motif.`);

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
      collectionsList.appendChild(h);
      const row = document.createElement('div');
      row.className = 'library-grid';
      for (const c of cols) renderCollectionItem(c, catalogue, row);
      collectionsList.appendChild(row);
    }
  }

  function renderImages(): void {
    const { embeddedAssets } = getState();
    imagesList.replaceChildren();
    setStatus(
      embeddedAssets.length === 0
        ? 'Aucune image dans le projet : ajoutez l’exemple ou importez un PNG / SVG.'
        : `${embeddedAssets.length} image${embeddedAssets.length > 1 ? 's' : ''} dans le projet · un clic ajoute un calque Image.`,
    );
    for (const asset of embeddedAssets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-item';
      button.dataset.testid = `lib-asset-${asset.id}`;
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'coll-thumb';
      img.src = assetPreviewUrl(asset);
      const name = document.createElement('span');
      name.className = 'coll-name';
      name.textContent = asset.name;
      button.append(img, name);
      button.addEventListener('click', () => addAssetLayer(asset, [...getState().embeddedAssets]));
      imagesList.appendChild(button);
    }
  }

  function showTab(tab: LibraryTab): void {
    activeTab = tab;
    const onCollections = tab === 'collections';
    tabCollections.classList.toggle('active', onCollections);
    tabImages.classList.toggle('active', !onCollections);
    collectionsPane.hidden = !onCollections;
    imagesPane.hidden = onCollections;
    closeVariationMenu();
    if (onCollections) renderCollections();
    else renderImages();
  }

  tabCollections.addEventListener('click', () => showTab('collections'));
  tabImages.addEventListener('click', () => showTab('images'));
  closeBtn.addEventListener('click', () => close());
  dialog.addEventListener('close', () => closeVariationMenu());
  search.addEventListener('input', () => {
    if (activeTab === 'collections') renderCollections();
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

  document.addEventListener('pointerdown', (event) => {
    if (variationMenu.hidden) return;
    const target = event.target;
    if (target instanceof Node && (variationMenu.contains(target) || variationAnchor?.contains(target))) return;
    closeVariationMenu();
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
