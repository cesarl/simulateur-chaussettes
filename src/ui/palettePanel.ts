/**
 * Bloc « Couleurs » : palettes d’artiste, pastilles de zones, nuancier.
 */
import {
  paletteOptions,
  suggestZoneColors,
  yarnColors,
  isPngCollection,
  type Collection,
  type NuancierColor,
  type ZoneColors,
} from '../core/collections';
import { MACHINE_LIMITS } from '../core/sizes';
import type { Hex } from '../core/types';
import { editingCollection, getState, setMotifCollection, toggleLayerTransparentColor, update } from '../state';
import { nuancierMap, tilesFromCollection } from '../io/collectionTiles';
import { createColorRow } from './colorRow';

function familyOf(id: string): string {
  const m = /^([A-Z]+)/.exec(id);
  return m?.[1] ?? 'AUTRE';
}

async function reloadTiles(
  collection: Collection,
  colors: ZoneColors,
  paletteId: string | null,
): Promise<void> {
  const cat = getState().catalogue;
  if (!cat) return;
  const nuancier = nuancierMap(cat);
  const tiles = await tilesFromCollection(collection, colors, nuancier);
  const yarns = yarnColors(collection, colors, nuancier);
  setMotifCollection(collection.id, { ...colors }, paletteId);
  update({
    tiles,
    design: {
      quantize: {
        paletteMode: 'manuelle',
        palette: yarns.map((y) => y.hex),
        maxColors: Math.max(2, Math.min(8, yarns.length)),
      },
    },
    error: null,
  });
}

export interface PalettePanelApi {
  sync: () => void;
}

export function mountPalettePanel(host: HTMLElement): PalettePanelApi {
  const section = document.createElement('details');
  section.className = 'section';
  section.open = true;
  section.dataset.testid = 'section-couleurs';

  const summary = document.createElement('summary');
  summary.className = 'section-summary';
  const title = document.createElement('span');
  title.className = 'section-title';
  title.textContent = 'Couleurs';
  summary.appendChild(title);
  section.appendChild(summary);

  const countLine = document.createElement('p');
  countLine.className = 'hint';
  countLine.dataset.testid = 'yarn-count';
  section.appendChild(countLine);

  const pngHint = document.createElement('p');
  pngHint.className = 'hint';
  pngHint.dataset.testid = 'png-colors-hint';
  pngHint.hidden = true;
  pngHint.textContent = 'Couleurs figées : image PNG (réduction automatique, N réglable dans Gros pixels).';
  section.appendChild(pngHint);

  const alert = document.createElement('p');
  alert.className = 'tile-error';
  alert.dataset.testid = 'yarn-alert';
  alert.hidden = true;
  section.appendChild(alert);

  const optionsHost = document.createElement('div');
  optionsHost.className = 'pal-options';
  optionsHost.dataset.testid = 'pal-options';
  section.appendChild(optionsHost);

  const showTest = document.createElement('label');
  showTest.className = 'row coll-dev';
  const showTestBox = document.createElement('input');
  showTestBox.type = 'checkbox';
  showTestBox.dataset.testid = 'pal-show-test';
  showTest.append(showTestBox, document.createTextNode(' Afficher les couleurs en test'));
  section.appendChild(showTest);

  const swatches = document.createElement('div');
  swatches.className = 'zone-swatches';
  swatches.dataset.testid = 'zone-swatches';
  section.appendChild(swatches);

  const matchBtn = document.createElement('button');
  matchBtn.type = 'button';
  matchBtn.dataset.testid = 'match-zones';
  matchBtn.textContent = 'Assortir bord-côte, talon et pointe';
  section.appendChild(matchBtn);

  const zonePickers = document.createElement('div');
  zonePickers.className = 'row';
  for (const kind of ['cuff', 'heel', 'toe'] as const) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.testid = `nuancier-${kind}`;
    btn.textContent =
      kind === 'cuff' ? 'Nuancier bord-côte' : kind === 'heel' ? 'Nuancier talon' : 'Nuancier pointe';
    btn.addEventListener('click', () => openPicker(kind));
    zonePickers.appendChild(btn);
  }
  section.appendChild(zonePickers);

  const picker = document.createElement('div');
  picker.className = 'nuancier-picker';
  picker.dataset.testid = 'nuancier-picker';
  picker.hidden = true;
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher (nom ou code)…';
  search.dataset.testid = 'nuancier-search';
  picker.appendChild(search);
  const pickerList = document.createElement('div');
  pickerList.className = 'nuancier-list';
  picker.appendChild(pickerList);
  section.appendChild(picker);

  host.appendChild(section);

  let targetZone: string | null = null;
  let targetKind: 'zone' | 'cuff' | 'heel' | 'toe' | null = null;
  let busy = false;

  function activeCollection(): Collection | null {
    const { catalogue } = getState();
    const activeCollectionId = editingCollection()?.id ?? null;
    if (!catalogue || !activeCollectionId) return null;
    return catalogue.collections.find((c) => c.id === activeCollectionId) ?? null;
  }

  function closePicker(): void {
    picker.hidden = true;
    targetZone = null;
    targetKind = null;
    search.value = '';
  }

  function openPicker(kind: typeof targetKind, zone?: string): void {
    targetKind = kind;
    targetZone = zone ?? null;
    picker.hidden = false;
    search.focus();
    renderPicker();
  }

  function renderPicker(): void {
    const cat = getState().catalogue;
    pickerList.replaceChildren();
    if (!cat) return;
    const q = search.value.trim().toLowerCase();
    const showAll = showTestBox.checked;
    const colors = cat.nuancier.filter((c) => {
      if (!showAll && !c.public) return false;
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        c.nom.toLowerCase().includes(q) ||
        c.ral.toLowerCase().includes(q)
      );
    });
    const byFam = new Map<string, NuancierColor[]>();
    for (const c of colors) {
      const fam = familyOf(c.id);
      const list = byFam.get(fam) ?? [];
      list.push(c);
      byFam.set(fam, list);
    }
    for (const fam of [...byFam.keys()].sort()) {
      const h = document.createElement('h4');
      h.className = 'calep-group-title';
      h.textContent = fam;
      pickerList.appendChild(h);
      const row = document.createElement('div');
      row.className = 'nuancier-row';
      for (const c of byFam.get(fam) ?? []) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nuancier-swatch';
        btn.dataset.testid = `nuancier-${c.id}`;
        btn.title = `${c.id} · ${c.nom} · ${c.ral}`;
        const chip = document.createElement('i');
        chip.style.background = c.hex;
        const label = document.createElement('span');
        label.textContent = `${c.id} · ${c.nom}`;
        btn.append(chip, label);
        btn.addEventListener('click', () => void pickColor(c));
        row.appendChild(btn);
      }
      pickerList.appendChild(row);
    }
  }

  async function pickColor(c: NuancierColor): Promise<void> {
    if (busy) return;
    const collection = activeCollection();
    const coll = editingCollection();
    if (!collection || !coll) {
      closePicker();
      return;
    }
    busy = true;
    try {
      if (targetKind === 'zone' && targetZone) {
        const next = { ...coll.colors, [targetZone]: c.id };
        await reloadTiles(collection, next, 'custom');
      } else if (targetKind === 'cuff') {
        update({ design: { zones: { cuffColor: c.hex } } });
      } else if (targetKind === 'heel') {
        update({ design: { zones: { heelColor: c.hex } } });
      } else if (targetKind === 'toe') {
        update({ design: { zones: { toeColor: c.hex } } });
      }
    } finally {
      busy = false;
      closePicker();
    }
  }

  matchBtn.addEventListener('click', () => {
    const collection = activeCollection();
    const coll = editingCollection();
    const cat = getState().catalogue;
    if (!collection || !coll || !cat) return;
    const yarns = yarnColors(collection, coll.colors, nuancierMap(cat));
    const suggested = suggestZoneColors(yarns);
    update({
      design: {
        zones: {
          cuffColor: suggested.cuff,
          heelColor: suggested.heel,
          toeColor: suggested.toe,
        },
      },
    });
  });

  search.addEventListener('input', () => renderPicker());
  showTestBox.addEventListener('change', () => {
    render();
    if (!picker.hidden) renderPicker();
  });

  function render(): void {
    const state = getState();
    const collection = activeCollection();
    const coll = editingCollection();
    const cat = state.catalogue;
    const png = collection ? isPngCollection(collection) : false;
    section.hidden = !collection || !cat || (!png && !coll);
    if (!collection || !cat || (!png && !coll)) {
      closePicker();
      return;
    }

    pngHint.hidden = !png;
    showTest.hidden = png;
    optionsHost.hidden = png;
    swatches.hidden = png;
    matchBtn.hidden = png;

    if (png) {
      countLine.textContent = `Couleurs figées : image PNG — ${state.design.quantize.maxColors} couleurs max (auto)`;
      alert.hidden = true;
      return;
    }

    const zoneColors = coll!.colors;
    const paletteOptionId = coll!.paletteId;
    const nuancier = nuancierMap(cat);
    const yarns = yarnColors(collection, zoneColors, nuancier);
    countLine.textContent = `${yarns.length} couleur${yarns.length > 1 ? 's' : ''} de fil`;
    const over = yarns.length > MACHINE_LIMITS.maxColorsTotal;
    alert.hidden = !over;
    alert.textContent = over
      ? `Attention : ${yarns.length} couleurs dépassent la limite machine (${MACHINE_LIMITS.maxColorsTotal}).`
      : '';

    const opts = paletteOptions(collection, nuancier, showTestBox.checked);
    optionsHost.replaceChildren();
    for (const opt of opts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = paletteOptionId === opt.id ? 'pal-band selected' : 'pal-band';
      btn.dataset.testid = `pal-option-${opt.id}`;
      const strip = document.createElement('span');
      strip.className = 'pal-strip';
      for (const z of collection.zones) {
        const id = opt.colors[z];
        const col = id ? nuancier.get(id) : undefined;
        const chip = document.createElement('i');
        chip.style.background = col?.hex ?? '#ccc';
        strip.appendChild(chip);
      }
      const label = document.createElement('span');
      label.textContent = opt.label;
      btn.append(strip, label);
      btn.addEventListener('click', () => {
        if (busy) return;
        void (async () => {
          busy = true;
          try {
            await reloadTiles(collection, { ...opt.colors }, opt.id);
          } finally {
            busy = false;
          }
        })();
      });
      optionsHost.appendChild(btn);
    }

    swatches.replaceChildren();
    const motifLayer = state.design.layers.find((l) => l.id === state.selectedLayerId);
    const motifId =
      motifLayer?.kind === 'motif'
        ? motifLayer.id
        : (state.design.layers.find((l) => l.kind === 'motif')?.id ?? null);
    const transparent = new Set(
      (motifId
        ? state.design.layers.find((l) => l.id === motifId)?.transparentColors
        : []
      )?.map((c) => c.toLowerCase()) ?? [],
    );
    // Zones partageant le même fil : bascule groupée + info-bulle.
    const hexToZones = new Map<string, string[]>();
    for (const z of collection.zones) {
      const code = zoneColors[z];
      const col = code ? nuancier.get(code) : undefined;
      const hex = (col?.hex ?? '#cccccc').toLowerCase();
      const list = hexToZones.get(hex) ?? [];
      list.push(z);
      hexToZones.set(hex, list);
    }
    for (const z of collection.zones) {
      const code = zoneColors[z];
      const col = code ? nuancier.get(code) : undefined;
      const hex = (col?.hex ?? '#cccccc').toLowerCase() as Hex;
      const siblings = hexToZones.get(hex) ?? [z];
      const shared = siblings.length > 1;
      const eyeTitle = shared
        ? `Même fil que ${siblings.filter((s) => s !== z).join(', ')} — bascule groupée`
        : undefined;
      const row = createColorRow({
        hex,
        label: col ? `${z} · ${col.id} · ${col.nom}` : `${z} · —`,
        transparent: transparent.has(hex),
        eyeTitle,
        testId: `zone-swatch-${z}`,
        onToggleEye: () => {
          if (!motifId) return;
          toggleLayerTransparentColor(motifId, hex);
        },
      });
      // Œil de zone : testid distinct pour éviter le double `layer-color-*` (section Couleurs du calque).
      const eye = row.querySelector('.color-row-eye');
      if (eye instanceof HTMLElement) {
        eye.dataset.testid = `zone-eye-${z}`;
      }
      row.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('.color-row-eye, .color-row-recolor')) return;
        openPicker('zone', z);
      });
      swatches.appendChild(row);
    }
  }

  return { sync: render };
}

/** Libellés fabricant pour la légende d’export (code · nom). */
export function yarnLegendLabels(): Map<string, string> {
  const state = getState();
  const cat = state.catalogue;
  const coll = editingCollection();
  const collection =
    cat && coll ? cat.collections.find((c) => c.id === coll.id) : null;
  const map = new Map<string, string>();
  if (!collection || !coll || !cat) return map;
  const yarns = yarnColors(collection, coll.colors, nuancierMap(cat));
  for (const y of yarns) map.set(y.hex.toLowerCase(), `${y.id} · ${y.nom}`);
  return map;
}
