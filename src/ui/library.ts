/**
 * Bibliothèque — version minimale (T54) : ajouter un calque Motif depuis une collection,
 * ou un calque Image (exemple fourni, ou PNG / SVG importé et embarqué dans le projet).
 * T57 enrichit ce dialogue (vignettes de variations, glisser-déposer, « importer comme carreau »).
 */
import { visibleCollections, isPngCollection, type Catalogue, type Collection } from '../core/collections';
import type { EmbeddedAsset } from '../core/composition';
import { addImageLayer, addMotifLayer, canAddLayer, defaultMotifLayout, getState, update } from '../state';
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

function matches(c: Collection, query: string): boolean {
  if (!query) return true;
  return `${c.nom} ${c.id} ${c.description}`.toLowerCase().includes(query.toLowerCase());
}

async function assetFromTile(
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
  collectionsList.className = 'library-grid';
  collectionsList.dataset.testid = 'lib-collections';

  collectionsPane.append(search, collectionsList);

  // -------------------------------------------------------------- onglet Images
  const imagesPane = document.createElement('div');
  imagesPane.className = 'library-pane';
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

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.png,.svg,image/png,image/svg+xml';
  fileInput.multiple = true;
  fileInput.dataset.testid = 'lib-image-file';
  fileInput.hidden = true;

  imagesTools.append(exampleBtn, importBtn, fileInput);

  const imagesList = document.createElement('div');
  imagesList.className = 'library-grid';
  imagesList.dataset.testid = 'lib-images';

  imagesPane.append(imagesTools, imagesList);

  dialog.append(header, status, collectionsPane, imagesPane);
  host.appendChild(dialog);

  let activeTab: LibraryTab = 'collections';
  let busy = false;
  const thumbs = new Map<string, string>();

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function setBusy(on: boolean): void {
    busy = on;
    dialog.classList.toggle('busy', on);
  }

  function close(): void {
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

  function addAssetLayer(asset: EmbeddedAsset, assets: EmbeddedAsset[]): void {
    const added = addImageLayer({ kind: 'embarquee', assetId: asset.id }, asset.name, assets);
    if (added) close();
    else setStatus('16 calques au maximum.');
  }

  async function addExample(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setStatus('Chargement de l’exemple…');
    try {
      const existing = getState().embeddedAssets.find((a) => a.name === EXAMPLE_IMAGE);
      if (existing) {
        addAssetLayer(existing, [...getState().embeddedAssets]);
        return;
      }
      const tile = await loadTileFromUrl(fixtureUrl(EXAMPLE_IMAGE));
      const asset = await assetFromTile(EXAMPLE_IMAGE, tile);
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
    try {
      for (const file of files) {
        if (!canAddLayer()) {
          setStatus('16 calques au maximum.');
          break;
        }
        const tile = await loadTileFromFile(file);
        const asset = await assetFromTile(file.name, tile);
        addAssetLayer(asset, [...getState().embeddedAssets, asset]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import impossible.';
      setStatus(message);
    } finally {
      setBusy(false);
    }
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
    for (const c of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-item';
      button.dataset.testid = `lib-collection-${c.id}`;
      button.title = c.nom;
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'coll-thumb';
      void thumbFor(c, catalogue).then((src) => {
        if (src) img.src = src;
      });
      const name = document.createElement('span');
      name.className = 'coll-name';
      name.textContent = c.nom;
      button.append(img, name);
      button.addEventListener('click', () => void addCollectionLayer(c, catalogue));
      collectionsList.appendChild(button);
    }
  }

  function renderImages(): void {
    const { embeddedAssets } = getState();
    imagesList.replaceChildren();
    setStatus(
      embeddedAssets.length === 0
        ? 'Aucune image dans le projet : ajoutez l’exemple ou importez un PNG / SVG.'
        : `${embeddedAssets.length} image${embeddedAssets.length > 1 ? 's' : ''} dans le projet.`,
    );
    for (const asset of embeddedAssets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-item';
      button.dataset.testid = `lib-asset-${asset.id}`;
      const name = document.createElement('span');
      name.className = 'coll-name';
      name.textContent = asset.name;
      button.append(name);
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
    if (onCollections) renderCollections();
    else renderImages();
  }

  tabCollections.addEventListener('click', () => showTab('collections'));
  tabImages.addEventListener('click', () => showTab('images'));
  closeBtn.addEventListener('click', () => close());
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

  return {
    open(tab) {
      showTab(tab);
      if (!dialog.open) dialog.showModal();
    },
    close,
  };
}
