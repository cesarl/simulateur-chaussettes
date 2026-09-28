/**
 * Atelier « Créer un motif » (T102) — motif.html
 */
import {
  defaultColorsFromVariations,
  draftToApiDonnees,
  emptyMotifDraft,
  previewSharedId,
  unionZones,
  variationsFromZoned,
  zoneSvgBatch,
  zonesMismatchWarning,
  type MotifDraft,
  type MotifFormat,
  type MotifVariationDraft,
} from './core/motifDraft';
import { recolorPreview, type NuancierEntry } from './core/svgZones';
import { recolorSvg } from './core/collections';
import { loadTileFromSvgText } from './io/tiles';
import { createSharedCollection, patchSharedCollection, countFavorisUsingCollection } from './io/collectionsClient';
import { encodeFavoriVignette, encodeSolidFavoriVignette } from './io/favoriVignette';
import { fetchSharedCollectionById } from './io/catalogue';
import { askSharedPassword } from './io/imagesClient';
import { FavorisApiError } from './io/favorisApi';
import { forgetPassword, storePassword } from './io/favorisClient';
import { disclosure } from './ui/kit/disclosure';
import { kitButton } from './ui/kit/button';
import { showToast } from './ui/kit/toast';
import { openDialog } from './ui/kit/dialog';
import { BUILTIN_PRESETS } from './core/presets';
import type { TileAsset } from './core/types';
import { createScene } from './render/scene';
import { createSockObject } from './render/sock3d/sockObject';
import { defaultDimensions } from './core/sizes';
import { composeGrid } from './core/grid';
import { NUANCIER_DEFAULT_ZONE_COLORS } from './core/nuancierDefaults';
import { migrateLegacyKind } from './core/presets';
import { samplePattern } from './core/layout';
import type { LayoutSettings, ZoneSettings } from './core/types';
import * as THREE from 'three';

const DRAFT_KEY = 'simulateur-chaussettes:motif-draft';

const formHost = document.querySelector('[data-testid="motif-form"]') as HTMLElement;
const previewHost = document.querySelector('[data-testid="motif-preview"]') as HTMLElement;
const statusEl = document.querySelector('[data-testid="motif-status"]') as HTMLElement;

let draft: MotifDraft = emptyMotifDraft();
let nuancier: NuancierEntry[] = [];
let previewTiles: TileAsset[] = [];
let previewPaletteId: 'defaut' | 'reco-1' | 'reco-2' | 'reco-3' = 'defaut';
let showDecor = false;
let sockObj: ReturnType<typeof createSockObject> | null = null;
let sceneHandle: ReturnType<typeof createScene> | null = null;

const CALEP_CHOICES = ['grille', 'damier', 'quinconce-h', 'aleatoire'] as const;

function setStatus(msg: string, ok = true): void {
  statusEl.hidden = !msg;
  statusEl.textContent = msg;
  statusEl.dataset.ok = ok ? '1' : '0';
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hexById(): Map<string, string> {
  return new Map(nuancier.map((n) => [n.id, n.hex]));
}

function activeColors(): Record<string, string> {
  if (previewPaletteId === 'defaut') return { ...draft.couleursParDefaut };
  const idx = Number(previewPaletteId.replace('reco-', '')) - 1;
  const reco = draft.recommandations[idx];
  return reco ? { ...draft.couleursParDefaut, ...reco.colors } : { ...draft.couleursParDefaut };
}

async function loadNuancier(): Promise<void> {
  try {
    const res = await fetch('./carreaux/catalogue.json');
    if (!res.ok) return;
    const raw = (await res.json()) as { nuancier?: Array<NuancierEntry & { public?: boolean }> };
    nuancier = (raw.nuancier ?? []).filter((n) => n && typeof n.id === 'string');
  } catch {
    nuancier = [];
  }
}

function persistDraft(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

function loadDraftFromStorage(): MotifDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MotifDraft;
  } catch {
    return null;
  }
}

function clearDraftStorage(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

async function ingestFiles(fileList: FileList | File[]): Promise<void> {
  const files = [...fileList].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const svgTexts: string[] = [];
  const pngUrls: string[] = [];
  for (const f of files) {
    if (/\.png$/i.test(f.name) || f.type === 'image/png') {
      pngUrls.push(
        await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        }),
      );
    } else if (/\.svg$/i.test(f.name) || f.type.includes('svg')) {
      svgTexts.push(await f.text());
    }
  }
  const zoned = zoneSvgBatch(svgTexts, nuancier);
  const added = variationsFromZoned(zoned, pngUrls);
  const start = draft.variations.length;
  for (let i = 0; i < added.length; i++) {
    const v = added[i]!;
    v.name = `VAR${start + i + 1}`;
    draft.variations.push(v);
  }
  if (draft.variations.length > 16) {
    draft.variations = draft.variations.slice(0, 16);
    setStatus('16 variations maximum.', false);
  }
  draft.couleursParDefaut = {
    ...defaultColorsFromVariations(draft.variations),
    ...draft.couleursParDefaut,
  };
  persistDraft();
  await rebuildPreviewTiles();
  renderAll();
}

async function rebuildPreviewTiles(): Promise<void> {
  const colors = activeColors();
  const hexMap = hexById();
  const tiles: TileAsset[] = [];
  for (const v of draft.variations) {
    if (v.mime === 'image/png') continue;
    const hexByZone: Record<string, string> = {};
    for (const z of v.zones) {
      const id = colors[z.id] ?? z.suggestedColorId;
      const hex = id ? hexMap.get(id) : undefined;
      if (hex) hexByZone[z.id] = hex;
    }
    const svg = Object.keys(hexByZone).length ? recolorSvg(v.zoned, hexByZone) : v.zoned;
    tiles.push(await loadTileFromSvgText(svg, `${draft.nom || 'motif'}-${v.name}`));
  }
  previewTiles = tiles;
}

function draw2dPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = 480;
  canvas.width = size;
  canvas.height = size;
  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(0, 0, size, size);
  if (!previewTiles.length) {
    ctx.fillStyle = '#5a5348';
    ctx.font = '14px sans-serif';
    ctx.fillText('Déposez des variations pour prévisualiser', 24, 40);
    return;
  }
  const cells = 4;
  const cell = Math.floor(size / cells);
  const kind = draft.calepinageParDefaut ?? 'grille';
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const t = previewTiles[(row * cells + col) % previewTiles.length]!;
      const off = document.createElement('canvas');
      off.width = t.width;
      off.height = t.height;
      const octx = off.getContext('2d')!;
      const img = octx.createImageData(t.width, t.height);
      img.data.set(t.rgba);
      octx.putImageData(img, 0, 0);
      const shift = kind.includes('damier') && row % 2 === 1 ? cell / 2 : 0;
      ctx.drawImage(off, col * cell + shift, row * cell, cell, cell);
    }
  }
}

function ensure3d(host: HTMLElement): void {
  if (sceneHandle) return;
  sceneHandle = createScene(host);
  sceneHandle.renderer.setClearColor(new THREE.Color('#ecebe8'));
}

function update3d(): void {
  const host = previewHost.querySelector('[data-testid="motif-preview-3d"]') as HTMLElement | null;
  if (!host) return;
  ensure3d(host);
  if (!sceneHandle) return;
  try {
    const dims = defaultDimensions('homme');
    const zones: ZoneSettings = {
      cuffEnabled: true,
      ...NUANCIER_DEFAULT_ZONE_COLORS,
      patternOnFoot: true,
      heelHeightMm: 55,
      heelDepthMm: 72,
      heelSpread: 100,
    };
    let pattern: Uint8Array | null = null;
    let palette: string[] = [NUANCIER_DEFAULT_ZONE_COLORS.footColor];
    if (previewTiles.length) {
      const tileStitches = Math.max(2, Math.round(dims.needles / 6));
      const layout: LayoutSettings = {
        calepinage: migrateLegacyKind(draft.calepinageParDefaut ?? 'grille', 1, 0),
        tileStitches,
        tileRows: Math.max(1, Math.round(tileStitches / (dims.stitchesPerCm / dims.rowsPerCm))),
        gapStitches: 0,
        gapRows: 0,
        gapColor: '#cfcec9',
        offsetStitches: 0,
        offsetRows: 0,
        seam: 'dos',
        tilesAround: 6,
        tileSizeMode: 'around',
        tileIds: previewTiles.map((t) => t.id),
      };
      const rgb = samplePattern(previewTiles, layout, dims, zones, 'majoritaire', BUILTIN_PRESETS);
      const map = new Map<string, number>();
      palette = [];
      const h = Math.max(1, dims.legRows);
      pattern = new Uint8Array(dims.needles * h);
      for (let i = 0; i < dims.needles * h; i++) {
        const r = rgb[i * 3]!;
        const g = rgb[i * 3 + 1]!;
        const b = rgb[i * 3 + 2]!;
        const key = `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
        let idx = map.get(key);
        if (idx === undefined) {
          idx = palette.length;
          map.set(key, idx);
          palette.push(key);
        }
        pattern[i] = idx;
      }
    }
    const grid = composeGrid(dims, zones, pattern, palette);
    if (sockObj) {
      sceneHandle.scene.remove(sockObj.mesh);
      sockObj.dispose();
    }
    sockObj = createSockObject(
      {
        size: 'homme',
        needles: dims.needles,
        cuffRows: dims.cuffRows,
        legRows: dims.legRows,
        heelRows: dims.heelRows,
        footRows: dims.footRows,
        toeRows: dims.toeRows,
        rowsPerCm: dims.rowsPerCm,
        heelHeight: zones.heelHeightMm,
        heelDepth: zones.heelDepthMm,
        heelSpread: zones.heelSpread / 100,
      },
      {
        width: grid.width,
        height: grid.height,
        palette: [...grid.palette],
        colorIndex: grid.colorIndex,
      },
      {
        heel: zones.heelColor,
        toe: zones.toeColor,
        rim: zones.cuffEnabled ? zones.cuffColor : undefined,
      },
    );
    sceneHandle.scene.add(sockObj.mesh);
    sceneHandle.requestRender();
  } catch (e) {
    console.warn('Aperçu 3D', e);
  }
  void showDecor;
}

function renderPreview(): void {
  previewHost.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = 'Prévisualisation';
  previewHost.appendChild(title);

  const palRow = document.createElement('div');
  palRow.className = 'motif-preview-tabs';
  const opts: Array<{ id: typeof previewPaletteId; label: string }> = [
    { id: 'defaut', label: 'Défaut' },
    { id: 'reco-1', label: 'Conseillée 1' },
    { id: 'reco-2', label: 'Conseillée 2' },
    { id: 'reco-3', label: 'Conseillée 3' },
  ];
  for (const o of opts) {
    if (o.id !== 'defaut') {
      const n = Number(o.id.replace('reco-', '')) - 1;
      if (!draft.recommandations[n]) continue;
    }
    palRow.appendChild(
      kitButton({
        variant: previewPaletteId === o.id ? 'primary' : 'ghost',
        label: o.label,
        compact: true,
        testId: `motif-preview-pal-${o.id}`,
        onClick: () => {
          previewPaletteId = o.id;
          void rebuildPreviewTiles().then(() => renderPreview());
        },
      }),
    );
  }
  previewHost.appendChild(palRow);

  const c2 = document.createElement('canvas');
  c2.className = 'motif-preview-canvas';
  c2.dataset.testid = 'motif-preview-2d';
  previewHost.appendChild(c2);
  draw2dPreview(c2);

  previewHost.appendChild(
    kitButton({
      variant: showDecor ? 'primary' : 'ghost',
      label: showDecor ? 'Décor : sol + mur' : 'Décor : désactivé',
      compact: true,
      testId: 'motif-preview-decor',
      onClick: () => {
        showDecor = !showDecor;
        renderPreview();
      },
    }),
  );

  const d3 = document.createElement('div');
  d3.className = 'motif-preview-3d';
  d3.dataset.testid = 'motif-preview-3d';
  previewHost.appendChild(d3);
  // Recréer la scène dans le nouveau host
  if (sceneHandle) {
    sceneHandle.dispose?.();
    sceneHandle = null;
    sockObj = null;
  }
  update3d();
}

function renderForm(): void {
  formHost.replaceChildren();

  const idBody = document.createElement('div');
  const nomInput = document.createElement('input');
  nomInput.type = 'text';
  nomInput.maxLength = 60;
  nomInput.value = draft.nom;
  nomInput.dataset.testid = 'motif-nom';
  const idPreview = document.createElement('p');
  idPreview.className = 'motif-id-preview';
  idPreview.dataset.testid = 'motif-id-preview';
  idPreview.textContent = `Identifiant : ${previewSharedId(draft.nom)}`;
  nomInput.addEventListener('input', () => {
    draft.nom = nomInput.value;
    idPreview.textContent = `Identifiant : ${previewSharedId(draft.nom)}`;
    persistDraft();
  });
  idBody.append(labelWrap('Nom', nomInput), idPreview);

  const formatSel = document.createElement('select');
  formatSel.dataset.testid = 'motif-format';
  for (const f of ['20x20', '15x15', '10x10'] as MotifFormat[]) {
    const o = document.createElement('option');
    o.value = f;
    o.textContent = f.replace('x', ' × ');
    if (f === draft.format) o.selected = true;
    formatSel.appendChild(o);
  }
  formatSel.addEventListener('change', () => {
    draft.format = formatSel.value as MotifFormat;
    persistDraft();
  });
  idBody.appendChild(labelWrap('Format', formatSel));

  const desc = document.createElement('textarea');
  desc.rows = 2;
  desc.dataset.testid = 'motif-desc';
  desc.value = draft.description;
  desc.addEventListener('input', () => {
    draft.description = desc.value;
    persistDraft();
  });
  idBody.appendChild(labelWrap('Description', desc));

  formHost.appendChild(
    disclosure({ label: '1. Identité', open: true, testId: 'motif-step-identite', content: idBody }),
  );

  const varBody = document.createElement('div');
  const drop = document.createElement('div');
  drop.className = 'motif-drop';
  drop.dataset.testid = 'motif-drop';
  drop.textContent = 'Déposer des SVG / PNG (ou cliquer)';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg,.png,image/svg+xml,image/png';
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.dataset.testid = 'motif-file-input';
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-drag');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-drag');
    void ingestFiles(e.dataTransfer?.files ?? []);
  });
  fileInput.addEventListener('change', () => void ingestFiles(fileInput.files ?? []));
  varBody.append(drop, fileInput);

  const mismatch = zonesMismatchWarning(draft.variations);
  if (mismatch) {
    const w = document.createElement('p');
    w.className = 'motif-warn';
    w.dataset.testid = 'motif-zones-mismatch';
    w.textContent = mismatch;
    varBody.appendChild(w);
  }

  const list = document.createElement('div');
  list.className = 'motif-var-list';
  list.dataset.testid = 'motif-var-list';
  draft.variations.forEach((v, i) => list.appendChild(variationCard(v, i)));
  varBody.appendChild(list);
  formHost.appendChild(
    disclosure({
      label: `2. Variations (${draft.variations.length})`,
      open: true,
      testId: 'motif-step-variations',
      content: varBody,
    }),
  );

  const colBody = document.createElement('div');
  colBody.className = 'motif-zone-rows';
  colBody.dataset.testid = 'motif-zone-colors';
  const hexMap = hexById();
  for (const z of unionZones(draft.variations)) colBody.appendChild(zoneColorRow(z, hexMap));

  const recoWrap = document.createElement('div');
  recoWrap.className = 'motif-reco-list';
  recoWrap.dataset.testid = 'motif-reco-list';
  const recoTitle = document.createElement('h3');
  recoTitle.textContent = 'Palettes conseillées';
  recoWrap.appendChild(recoTitle);
  draft.recommandations.forEach((r, i) => recoWrap.appendChild(recoBlock(r, i)));
  if (draft.recommandations.length < 3) {
    recoWrap.appendChild(
      kitButton({
        variant: 'ghost',
        label: '+ Palette conseillée',
        compact: true,
        testId: 'motif-reco-add',
        onClick: () => {
          draft.recommandations.push({ nom: '', colors: { ...draft.couleursParDefaut } });
          persistDraft();
          renderForm();
        },
      }),
    );
  }
  colBody.appendChild(recoWrap);
  formHost.appendChild(
    disclosure({ label: '3. Couleurs', open: true, testId: 'motif-step-couleurs', content: colBody }),
  );

  const calBody = document.createElement('div');
  calBody.dataset.testid = 'motif-calep-host';
  const calRow = document.createElement('div');
  calRow.className = 'motif-preview-tabs';
  for (const id of CALEP_CHOICES) {
    const preset = BUILTIN_PRESETS.find((p) => p.id === id);
    calRow.appendChild(
      kitButton({
        variant: draft.calepinageParDefaut === id ? 'primary' : 'ghost',
        label: preset?.nom ?? id,
        compact: true,
        testId: `motif-calep-${id}`,
        onClick: () => {
          draft.calepinageParDefaut = id;
          if (!draft.calepinages.includes(id)) draft.calepinages.push(id);
          persistDraft();
          renderForm();
          renderPreview();
        },
      }),
    );
  }
  calBody.appendChild(calRow);
  const more = document.createElement('p');
  more.className = 'motif-id-preview';
  more.textContent = `Calepinage par défaut : ${draft.calepinageParDefaut ?? 'aucun'}`;
  more.dataset.testid = 'motif-calep-default';
  calBody.appendChild(more);
  formHost.appendChild(
    disclosure({ label: '4. Calepinage', open: true, testId: 'motif-step-calepinage', content: calBody }),
  );

  const saveBody = document.createElement('div');
  saveBody.className = 'motif-actions';
  saveBody.append(
    kitButton({
      variant: 'primary',
      label: 'Enregistrer en ligne',
      testId: 'motif-save',
      onClick: () => void saveOnline(),
    }),
    kitButton({
      variant: 'ghost',
      label: 'Annuler les modifications',
      testId: 'motif-cancel',
      onClick: () => {
        draft = emptyMotifDraft();
        clearDraftStorage();
        previewTiles = [];
        renderAll();
        setStatus('Brouillon annulé.');
      },
    }),
  );
  formHost.appendChild(
    disclosure({ label: '5. Enregistrer', open: true, testId: 'motif-step-save', content: saveBody }),
  );
}

function labelWrap(text: string, el: HTMLElement): HTMLElement {
  const lab = document.createElement('label');
  lab.className = 'motif-field';
  const span = document.createElement('span');
  span.textContent = text;
  lab.append(span, el);
  return lab;
}

function variationCard(v: MotifVariationDraft, index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'motif-var-card';
  card.dataset.testid = `motif-var-${index}`;
  const img = document.createElement('img');
  img.alt = v.name;
  const hexMap = hexById();
  img.src = v.mime === 'image/png' ? v.original : svgDataUrl(recolorPreview(v.zoned, v.zones, hexMap));
  const meta = document.createElement('div');
  meta.className = 'motif-var-meta';
  meta.innerHTML = `<strong>${v.name}</strong><br>${v.zones.length} zone${v.zones.length > 1 ? 's' : ''}`;
  if (v.notSquare) {
    const w = document.createElement('div');
    w.className = 'motif-warn';
    w.textContent = 'Fichier non carré';
    meta.appendChild(w);
  }
  const actions = document.createElement('div');
  actions.append(
    kitButton({
      variant: 'ghost',
      label: '×',
      compact: true,
      testId: `motif-var-del-${index}`,
      onClick: () => {
        draft.variations.splice(index, 1);
        draft.variations.forEach((x, i) => {
          x.name = `VAR${i + 1}`;
        });
        persistDraft();
        void rebuildPreviewTiles().then(() => renderAll());
      },
    }),
  );
  card.append(img, meta, actions);
  return card;
}

function zoneColorRow(zoneId: string, hexMap: Map<string, string>): HTMLElement {
  const row = document.createElement('div');
  row.className = 'motif-zone-row';
  row.dataset.testid = `motif-zone-row-${zoneId}`;
  const sw = document.createElement('i');
  sw.className = 'swatch';
  const current = draft.couleursParDefaut[zoneId] ?? '';
  sw.style.background = hexMap.get(current) ?? '#ccc';
  const lab = document.createElement('span');
  lab.textContent = zoneId;
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher…';
  search.dataset.testid = `motif-zone-search-${zoneId}`;
  const sel = document.createElement('select');
  sel.dataset.testid = `motif-zone-color-${zoneId}`;
  const fill = (q: string) => {
    sel.replaceChildren();
    const qq = q.trim().toLowerCase();
    for (const n of nuancier) {
      const pub = (n as { public?: boolean }).public;
      if (pub === false) continue;
      if (qq && !`${n.id} ${n.nom ?? ''}`.toLowerCase().includes(qq)) continue;
      const o = document.createElement('option');
      o.value = n.id;
      o.textContent = n.nom ? `${n.nom} · ${n.id}` : n.id;
      if (n.id === current) o.selected = true;
      sel.appendChild(o);
    }
  };
  fill('');
  search.addEventListener('input', () => fill(search.value));
  sel.addEventListener('change', () => {
    draft.couleursParDefaut[zoneId] = sel.value;
    sw.style.background = hexMap.get(sel.value) ?? '#ccc';
    persistDraft();
    void rebuildPreviewTiles().then(() => renderPreview());
  });
  row.append(sw, lab, search, sel);
  return row;
}

function recoBlock(reco: { nom: string; colors: Record<string, string> }, index: number): HTMLElement {
  const box = document.createElement('div');
  box.dataset.testid = `motif-reco-${index}`;
  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = 'Nom facultatif';
  name.value = reco.nom;
  name.dataset.testid = `motif-reco-nom-${index}`;
  name.addEventListener('input', () => {
    reco.nom = name.value;
    persistDraft();
  });
  box.appendChild(name);
  box.appendChild(
    kitButton({
      variant: 'ghost',
      label: '×',
      compact: true,
      testId: `motif-reco-del-${index}`,
      onClick: () => {
        draft.recommandations.splice(index, 1);
        persistDraft();
        renderForm();
      },
    }),
  );
  return box;
}

function renderAll(): void {
  renderForm();
  renderPreview();
}

async function captureMotifVignetteBlob(): Promise<Blob | null> {
  try {
    await rebuildPreviewTiles();
    renderPreview();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    if (sceneHandle) {
      sceneHandle.renderer.render(sceneHandle.scene, sceneHandle.camera);
      const dataUrl = sceneHandle.renderer.domElement.toDataURL('image/png');
      const b64 = await encodeFavoriVignette(dataUrl);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: 'image/webp' });
    }
    const solid = await encodeSolidFavoriVignette('#ecebe8');
    const bin = atob(solid);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/webp' });
  } catch {
    return null;
  }
}

async function saveOnline(): Promise<void> {
  if (!draft.nom.trim()) {
    setStatus('Nom requis.', false);
    return;
  }
  if (!draft.variations.length) {
    setStatus('Ajoutez au moins une variation.', false);
    return;
  }
  if (!draft.calepinageParDefaut) {
    draft.calepinageParDefaut = 'damier';
    if (!draft.calepinages.includes('damier')) draft.calepinages.push('damier');
  }
  const password = await askSharedPassword();
  if (!password) return;
  storePassword(password);

  setStatus('Préparation de la vignette…');
  const vignetteBlob = await captureMotifVignetteBlob();

  const donnees = draftToApiDonnees(draft);
  const form = new FormData();
  form.set(
    'json',
    JSON.stringify({
      nom: draft.nom.trim(),
      description: draft.description.trim(),
      format: draft.format,
      donnees,
    }),
  );
  // En création : tous les fichiers. En édition : seulement ceux marqués nouveaux/remplacés.
  for (const v of draft.variations) {
    const sendFile = !draft.id || v.fileDirty === true;
    if (!sendFile) continue;
    if (v.mime === 'image/svg+xml') {
      form.set(v.name, new Blob([v.zoned], { type: 'image/svg+xml' }), `${v.name}.svg`);
    } else {
      const res = await fetch(v.original);
      form.set(v.name, await res.blob(), `${v.name}.png`);
    }
  }
  if (vignetteBlob) {
    form.set('vignette', vignetteBlob, 'vignette.webp');
  }

  try {
    if (draft.id) {
      const updated = await patchSharedCollection(draft.id, form, password);
      for (const v of draft.variations) v.fileDirty = false;
      setStatus(`Motif « ${updated.id} » mis à jour.`);
      showToast({ message: `Motif mis à jour : ${updated.id}` });
    } else {
      const created = await createSharedCollection(form, password);
      draft.id = created.id;
      for (const v of draft.variations) v.fileDirty = false;
      setStatus(`Motif « ${created.id} » enregistré.`);
      showToast({ message: `Motif enregistré : ${created.id}` });
    }
    clearDraftStorage();
  } catch (e) {
    if (e instanceof FavorisApiError && e.status === 401) {
      forgetPassword();
      setStatus('Mot de passe incorrect.', false);
      return;
    }
    setStatus(e instanceof Error ? e.message : 'Échec de l’enregistrement.', false);
  }
}

async function loadExisting(id: string, asCopy: boolean): Promise<void> {
  setStatus('Chargement du motif…');
  const col = await fetchSharedCollectionById(id);
  if (!col) {
    setStatus(`Motif « ${id} » introuvable.`, false);
    return;
  }
  draft = emptyMotifDraft();
  draft.id = asCopy ? null : col.id;
  draft.nom = asCopy ? `${col.nom} (copie)` : col.nom;
  draft.description = col.description;
  draft.format = (['20x20', '15x15', '10x10'].includes(col.format) ? col.format : '20x20') as MotifFormat;
  draft.couleursParDefaut = { ...col.couleursParDefaut };
  draft.recommandations = (col.recommandations ?? []).map((r) => ({ nom: '', colors: { ...r } }));
  draft.calepinages = [...(col.calepinages ?? [])];
  draft.calepinageParDefaut = col.calepinageParDefaut;
  draft.variations = [];
  for (const v of col.variations) {
    try {
      const res = await fetch(v.file.startsWith('/') || /^https?:/i.test(v.file) ? v.file : v.file);
      if (!res.ok) continue;
      if (/\.png$/i.test(v.file)) {
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
        draft.variations.push({
          name: v.name,
          original: dataUrl,
          zoned: dataUrl,
          zones: [],
          mime: 'image/png',
          notSquare: false,
          fileDirty: asCopy,
        });
      } else {
        const text = await res.text();
        const zoned = zoneSvgBatch([text], nuancier);
        const vars = variationsFromZoned(zoned);
        const one = vars[0]!;
        one.name = v.name;
        one.fileDirty = asCopy;
        draft.variations.push(one);
      }
    } catch {
      /* ignore variation */
    }
  }
  if (!asCopy && draft.id) {
    const n = await countFavorisUsingCollection(draft.id);
    if (n > 0) {
      setStatus(`Ce motif est utilisé dans ${n} favori${n > 1 ? 's' : ''} ; ils afficheront la nouvelle version.`);
    } else {
      setStatus(`Édition de « ${draft.id} ».`);
    }
  } else {
    setStatus(asCopy ? 'Copie prête à enregistrer (nouvel identifiant).' : '');
  }
  await rebuildPreviewTiles();
  renderAll();
}

function offerDraftRestore(): void {
  const saved = loadDraftFromStorage();
  if (!saved?.variations?.length) return;
  openDialog({
    title: 'Brouillon trouvé',
    body: 'Reprendre le brouillon ?',
    testId: 'motif-draft-dialog',
    actions: [
      {
        label: 'Ignorer',
        variant: 'ghost',
        testId: 'motif-draft-ignore',
        onClick: () => {
          clearDraftStorage();
          return true;
        },
      },
      {
        label: 'Reprendre le brouillon',
        variant: 'primary',
        testId: 'motif-draft-resume',
        onClick: () => {
          draft = { ...emptyMotifDraft(), ...saved };
          void rebuildPreviewTiles().then(() => renderAll());
          return true;
        },
      },
    ],
  });
}

async function boot(): Promise<void> {
  await loadNuancier();
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');
  const dupId = params.get('dup');
  if (editId) {
    await loadExisting(editId, false);
  } else if (dupId) {
    await loadExisting(dupId, true);
  } else {
    renderAll();
    offerDraftRestore();
  }
  const title = document.querySelector('[data-testid="motif-title"]');
  if (title && (editId || dupId)) {
    title.textContent = editId ? 'Modifier un motif' : 'Dupliquer un motif';
  }
}

void boot();
