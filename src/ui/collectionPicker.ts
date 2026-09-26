/**
 * Section « Collection » : recherche, groupes, choix d’une collection.
 */
import {
  visibleCollections,
  yarnColors,
  isPngCollection,
  type Catalogue,
  type Collection,
} from '../core/collections';
import { DEFAULT_CALEPINAGE } from '../core/calepinage';
import { getState, update } from '../state';
import { collectionThumbDataUrl, nuancierMap, tilesFromCollection } from '../io/collectionTiles';

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

function matchesQuery(c: Collection, q: string): boolean {
  if (!q) return true;
  const hay = `${c.nom} ${c.id} ${c.description}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function calepinageForCollection(c: Collection) {
  const id = c.calepinageParDefaut;
  if (!id) return { ...DEFAULT_CALEPINAGE };
  return {
    ...DEFAULT_CALEPINAGE,
    source: 'prereglage' as const,
    presetId: id,
  };
}

export interface CollectionPickerApi {
  sync: () => void;
}

export function mountCollectionPicker(host: HTMLElement): CollectionPickerApi {
  const section = document.createElement('details');
  section.className = 'section';
  section.open = true;
  section.dataset.testid = 'section-collections';

  const summary = document.createElement('summary');
  summary.className = 'section-summary';
  const title = document.createElement('span');
  title.className = 'section-title';
  title.textContent = 'Collection';
  summary.appendChild(title);
  section.appendChild(summary);

  const current = document.createElement('p');
  current.className = 'hint';
  current.dataset.testid = 'coll-current';
  current.textContent = 'Aucune collection sélectionnée.';
  section.appendChild(current);

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher une collection…';
  search.dataset.testid = 'coll-search';
  search.className = 'coll-search';
  section.appendChild(search);

  const showDev = document.createElement('label');
  showDev.className = 'row coll-dev';
  const showDevBox = document.createElement('input');
  showDevBox.type = 'checkbox';
  showDevBox.dataset.testid = 'coll-show-dev';
  showDev.append(showDevBox, document.createTextNode(' Afficher les collections en développement'));
  section.appendChild(showDev);

  const list = document.createElement('div');
  list.className = 'coll-list';
  list.dataset.testid = 'coll-list';
  section.appendChild(list);

  const missing = document.createElement('p');
  missing.className = 'hint';
  missing.hidden = true;
  missing.textContent = 'Catalogue non disponible.';
  section.appendChild(missing);

  host.appendChild(section);

  const thumbCache = new Map<string, string>();
  let query = '';
  let loading = false;

  async function selectCollection(c: Collection, cat: Catalogue): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      const nuancier = nuancierMap(cat);
      const colors = { ...c.couleursParDefaut };
      const tiles = await tilesFromCollection(c, colors, nuancier);
      const png = isPngCollection(c);
      const yarns = png ? [] : yarnColors(c, colors, nuancier);
      update({
        tiles,
        activeCollectionId: c.id,
        zoneColors: png ? {} : colors,
        paletteOptionId: 'defaut',
        design: {
          layout: { calepinage: calepinageForCollection(c) },
          name: c.nom,
          quantize: png
            ? {
                paletteMode: 'auto',
                palette: [],
                maxColors: Math.max(2, Math.min(8, getState().design.quantize.maxColors || 4)),
              }
            : {
                paletteMode: 'manuelle',
                palette: yarns.map((y) => y.hex),
                maxColors: Math.max(2, Math.min(8, yarns.length || 2)),
              },
        },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger la collection.';
      update({ error: message });
    } finally {
      loading = false;
    }
  }

  async function ensureThumb(c: Collection, cat: Catalogue): Promise<string> {
    const cached = thumbCache.get(c.id);
    if (cached) return cached;
    const url = await collectionThumbDataUrl(c, nuancierMap(cat));
    thumbCache.set(c.id, url);
    return url;
  }

  function render(): void {
    const state = getState();
    const cat = state.catalogue;
    missing.hidden = !!cat;
    list.replaceChildren();
    if (!cat) {
      current.textContent = 'Collections non synchronisées.';
      return;
    }

    const active = cat.collections.find((c) => c.id === state.activeCollectionId) ?? null;
    current.textContent = active
      ? `Collection : ${active.nom} (${active.variations.length} motif${active.variations.length > 1 ? 's' : ''})`
      : 'Aucune collection sélectionnée.';

    const items = visibleCollections(cat, showDevBox.checked).filter((c) => matchesQuery(c, query));
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
      list.appendChild(h);
      const row = document.createElement('div');
      row.className = 'coll-row';
      for (const c of cols) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = state.activeCollectionId === c.id ? 'coll-item selected' : 'coll-item';
        btn.dataset.testid = `coll-item-${c.id}`;
        btn.title = c.nom;
        const img = document.createElement('img');
        img.alt = '';
        img.className = 'coll-thumb';
        void ensureThumb(c, cat).then((src) => {
          if (src) img.src = src;
        });
        const name = document.createElement('span');
        name.className = 'coll-name';
        name.textContent = c.nom;
        const badge = document.createElement('span');
        badge.className = 'calep-badge';
        badge.textContent = `${c.variations.length} motif${c.variations.length > 1 ? 's' : ''}`;
        btn.append(img, name, badge);
        btn.addEventListener('click', () => void selectCollection(c, cat));
        row.appendChild(btn);
      }
      list.appendChild(row);
    }
  }

  search.addEventListener('input', () => {
    query = search.value.trim();
    render();
  });
  showDevBox.addEventListener('change', () => render());

  return { sync: render };
}
