/**
 * Page d’administration des collections locales (T44) — mode dev.
 * File System Access API si disponible, sinon téléchargement .zip.
 */
import {
  autoZoneSvg,
  collectionIdFromName,
  lockColorsAcrossVariations,
  recolorPreview,
  setZoneColorId,
  type NuancierEntry,
  type SvgZonesResult,
} from './core/svgZones';
import { buildZip } from './io/zipStore';

interface LocalCollectionDraft {
  id: string;
  nom: string;
  format: string;
  category: string;
  variations: number;
  layouts: string[];
  defaut_layout: string;
  colors: string[];
  files: Array<{ name: string; text: string; zoned: string; zones: SvgZonesResult['zones'] }>;
  palettes: string[][]; // codes par zone
}

type Mode = 'none' | 'fs' | 'download';

const statusEl = document.querySelector('[data-testid="admin-status"]') as HTMLElement;
const modeLabel = document.querySelector('[data-testid="admin-mode-label"]') as HTMLElement;
const listEl = document.querySelector('[data-testid="admin-list"]') as HTMLElement;
const editorEl = document.querySelector('#admin-editor') as HTMLElement;

let mode: Mode = 'none';
let dirHandle: FileSystemDirectoryHandle | null = null;
let collections: LocalCollectionDraft[] = [];
let nuancier: NuancierEntry[] = [];
let calepinageIds: string[] = [];
let editing: LocalCollectionDraft | null = null;

function setStatus(msg: string, ok = true): void {
  statusEl.textContent = msg;
  statusEl.className = ok ? 'hint ok' : 'hint err';
}

async function loadCatalogueMeta(): Promise<void> {
  try {
    const res = await fetch('./carreaux/catalogue.json');
    if (!res.ok) throw new Error('catalogue manquant');
    const cat = (await res.json()) as { nuancier: Array<{ id: string; hex: string; nom?: string }> };
    nuancier = cat.nuancier.map((c) => ({ id: c.id, hex: c.hex, nom: c.nom }));
  } catch {
    nuancier = [];
  }
  try {
    const res = await fetch('./carreaux/calepinages.json');
    if (res.ok) {
      const raw = (await res.json()) as Array<{ id: string }>;
      calepinageIds = raw.map((p) => p.id);
    }
  } catch {
    calepinageIds = ['aleatoire', 'damier_4', 'g-suite'];
  }
  if (!calepinageIds.length) calepinageIds = ['aleatoire'];
}

async function readCollectionsJson(handle: FileSystemDirectoryHandle): Promise<unknown[]> {
  try {
    const fileHandle = await handle.getFileHandle('collections.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderList(): void {
  listEl.replaceChildren();
  if (!collections.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Aucune collection locale pour l’instant.';
    listEl.appendChild(p);
    return;
  }
  for (const c of collections) {
    const card = document.createElement('div');
    card.className = 'admin-card';
    card.dataset.testid = `admin-coll-${c.id}`;
    card.innerHTML = `<strong>${c.nom}</strong> <code>${c.id}</code> — ${c.variations} var. · ${c.format}`;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Éditer';
    edit.addEventListener('click', () => openEditor(c));
    card.appendChild(edit);
    listEl.appendChild(card);
  }
}

function openEditor(draft?: LocalCollectionDraft): void {
  editing =
    draft ??
    ({
      id: '',
      nom: '',
      format: '20x20',
      category: 'mes-collections',
      variations: 0,
      layouts: [calepinageIds[0] ?? 'aleatoire'],
      defaut_layout: calepinageIds[0] ?? 'aleatoire',
      colors: [],
      files: [],
      palettes: [],
    } satisfies LocalCollectionDraft);
  editorEl.hidden = false;
  editorEl.replaceChildren();
  const form = document.createElement('div');
  form.className = 'admin-form admin-card';
  form.dataset.testid = 'admin-editor';

  const nameInput = document.createElement('input');
  nameInput.dataset.testid = 'admin-name';
  nameInput.value = editing.nom;
  nameInput.addEventListener('input', () => {
    editing!.nom = nameInput.value;
    editing!.id = collectionIdFromName(nameInput.value);
    idOut.textContent = editing!.id;
  });

  const idOut = document.createElement('code');
  idOut.dataset.testid = 'admin-id';
  idOut.textContent = editing.id || '…';

  const format = document.createElement('select');
  format.dataset.testid = 'admin-format';
  for (const f of ['10x10', '15x15', '20x20']) {
    const o = document.createElement('option');
    o.value = f;
    o.textContent = f;
    if (f === editing.format) o.selected = true;
    format.appendChild(o);
  }
  format.addEventListener('change', () => {
    editing!.format = format.value;
  });

  const layoutsHost = document.createElement('div');
  layoutsHost.dataset.testid = 'admin-layouts';
  for (const id of calepinageIds.slice(0, 24)) {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = id;
    cb.checked = editing.layouts.includes(id);
    cb.addEventListener('change', () => {
      if (cb.checked) editing!.layouts = [...new Set([...editing!.layouts, id])];
      else editing!.layouts = editing!.layouts.filter((x) => x !== id);
    });
    lab.append(cb, document.createTextNode(` ${id}`));
    layoutsHost.appendChild(lab);
  }

  const drop = document.createElement('div');
  drop.dataset.testid = 'admin-drop';
  drop.className = 'admin-card';
  drop.textContent = 'Glisser-déposer des SVG/PNG ici (ordre = VAR1, VAR2…)';
  drop.style.minHeight = '4rem';
  drop.addEventListener('dragover', (e) => e.preventDefault());
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    void ingestFiles(e.dataTransfer?.files);
  });
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg,.png,image/svg+xml,image/png';
  fileInput.multiple = true;
  fileInput.dataset.testid = 'admin-files';
  fileInput.addEventListener('change', () => void ingestFiles(fileInput.files));

  const fileList = document.createElement('ul');
  fileList.className = 'file-list';
  fileList.dataset.testid = 'admin-file-list';

  const preview = document.createElement('div');
  preview.className = 'admin-previews';
  preview.dataset.testid = 'admin-zone-preview';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.dataset.testid = 'admin-save';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', () => void saveCurrent());

  form.append(
    labelWrap('Nom', nameInput),
    document.createTextNode(' Identifiant : '),
    idOut,
    labelWrap('Format', format),
    document.createElement('hr'),
    document.createTextNode('Calepinages proposés'),
    layoutsHost,
    document.createElement('hr'),
    drop,
    fileInput,
    fileList,
    preview,
    saveBtn,
  );
  editorEl.appendChild(form);
  refreshFileList(fileList, preview);
}

function labelWrap(text: string, el: HTMLElement): HTMLElement {
  const lab = document.createElement('label');
  lab.textContent = text;
  lab.appendChild(el);
  return lab;
}

async function ingestFiles(fileList: FileList | null | undefined): Promise<void> {
  if (!editing || !fileList?.length) return;
  const files = [...fileList].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const svgTexts: string[] = [];
  const pngFiles: File[] = [];
  for (const f of files) {
    if (/\.png$/i.test(f.name) || f.type === 'image/png') pngFiles.push(f);
    else if (/\.svg$/i.test(f.name) || f.type.includes('svg')) svgTexts.push(await f.text());
  }
  const firstPass = svgTexts.map((t) => autoZoneSvg(t, nuancier));
  const locked = lockColorsAcrossVariations(firstPass);
  const zoned = svgTexts.map((t) => autoZoneSvg(t, nuancier, locked));
  editing.files = [];
  for (const r of zoned) {
    editing.files.push({
      name: `VAR${editing.files.length + 1}.svg`,
      text: r.original,
      zoned: r.zoned,
      zones: r.zones,
    });
  }
  for (const png of pngFiles) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(png);
    });
    editing.files.push({
      name: `VAR${editing.files.length + 1}.png`,
      text: dataUrl,
      zoned: dataUrl,
      zones: [],
    });
  }
  editing.variations = editing.files.length;
  const zoneIds = new Set<string>();
  for (const f of editing.files) for (const z of f.zones) if (z.suggestedColorId) zoneIds.add(z.suggestedColorId);
  editing.colors = [...zoneIds];
  const fileListEl = editorEl.querySelector('[data-testid="admin-file-list"]') as HTMLElement;
  const preview = editorEl.querySelector('[data-testid="admin-zone-preview"]') as HTMLElement;
  refreshFileList(fileListEl, preview);
  setStatus(`${editing.files.length} fichier(s) prêts`);
}

function refreshFileList(fileList: HTMLElement, preview: HTMLElement): void {
  if (!editing) return;
  fileList.replaceChildren();
  editing.files.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = `VAR${i + 1} — ${f.name} (${f.zones.length} zones)`;
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.disabled = i === 0;
    up.addEventListener('click', () => {
      const arr = editing!.files;
      [arr[i - 1], arr[i]] = [arr[i]!, arr[i - 1]!];
      refreshFileList(fileList, preview);
    });
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.disabled = i === editing!.files.length - 1;
    down.addEventListener('click', () => {
      const arr = editing!.files;
      [arr[i], arr[i + 1]] = [arr[i + 1]!, arr[i]!];
      refreshFileList(fileList, preview);
    });
    li.append(up, down);
    fileList.appendChild(li);
  });
  preview.replaceChildren();
  const hexById = new Map(nuancier.map((n) => [n.id, n.hex]));
  editing.files.forEach((file, fileIndex) => {
    const block = document.createElement('section');
    block.className = 'admin-motif';
    block.dataset.testid = `admin-motif-${fileIndex}`;
    const title = document.createElement('h3');
    title.textContent = `Motif ${fileIndex + 1}`;
    block.appendChild(title);

    const pair = document.createElement('div');
    pair.className = 'zone-preview';
    const before = document.createElement('div');
    before.append(paragraph('Avant'), previewImage(file.text, 'avant'));
    const afterImg = previewImage(previewSrc(file, hexById), 'après');
    afterImg.dataset.testid = `admin-preview-after-${fileIndex}`;
    const after = document.createElement('div');
    after.append(paragraph('Après'), afterImg);
    pair.append(before, after);
    block.appendChild(pair);

    if (!file.zones.length) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'Pas de zones : le remplacement de couleurs ne s’applique pas à ce motif.';
      block.appendChild(note);
      preview.appendChild(block);
      return;
    }

    const zoneEditor = document.createElement('div');
    zoneEditor.dataset.testid = `admin-zone-codes-${fileIndex}`;
    for (const z of file.zones) {
      const row = document.createElement('div');
      row.className = 'admin-zone-row';
      const source = swatch(z.fillHex);
      source.title = `Couleur d’origine ${z.fillHex}`;
      const yarn = swatch(hexById.get(z.suggestedColorId ?? '') ?? '#cccccc');
      yarn.dataset.testid = `admin-zone-swatch-${fileIndex}-${z.id}`;
      yarn.title = 'Fil choisi';
      const sel = document.createElement('select');
      sel.dataset.testid = `admin-zone-${fileIndex}-${z.id}`;
      for (const n of nuancier) {
        const o = document.createElement('option');
        o.value = n.id;
        o.textContent = n.nom ? `${n.nom} · ${n.id}` : n.id;
        if (n.id === z.suggestedColorId) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        z.suggestedColorId = sel.value;
        file.zoned = setZoneColorId(file.zoned, z.id, sel.value);
        yarn.style.background = hexById.get(sel.value) ?? '#cccccc';
        const chosen = nuancier.find((n) => n.id === sel.value);
        yarn.title = chosen?.nom ? `${chosen.nom} · ${chosen.id}` : sel.value;
        afterImg.src = svgUrl(recolorPreview(file.zoned, file.zones, hexById));
        if (editing) editing.colors = colorIdsOf(editing);
      });
      const caption = document.createElement('span');
      caption.textContent = z.id;
      row.append(source, caption, document.createTextNode('→'), yarn, sel);
      zoneEditor.appendChild(row);
    }
    block.appendChild(zoneEditor);
    preview.appendChild(block);
  });
}

function paragraph(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function swatch(hex: string): HTMLElement {
  const chip = document.createElement('i');
  chip.className = 'admin-swatch';
  chip.style.background = hex;
  return chip;
}

function svgUrl(svgOrUrl: string): string {
  if (svgOrUrl.startsWith('data:')) return svgOrUrl;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOrUrl)}`;
}

function previewImage(src: string, alt: string): HTMLImageElement {
  const img = document.createElement('img');
  img.alt = alt;
  img.src = svgUrl(src);
  return img;
}

function previewSrc(file: { text: string; zoned: string; zones: { fillHex: string; suggestedColorId: string | null }[] }, hexById: ReadonlyMap<string, string>): string {
  if (!file.zones.length) return file.text;
  return recolorPreview(file.zoned, file.zones, hexById);
}

function colorIdsOf(d: { files: Array<{ zones: Array<{ suggestedColorId: string | null }> }> }): string[] {
  const ids = new Set<string>();
  for (const f of d.files) for (const z of f.zones) if (z.suggestedColorId) ids.add(z.suggestedColorId);
  return [...ids];
}

function validateDraft(d: LocalCollectionDraft): string | null {
  if (!d.nom.trim()) return 'Nom requis';
  if (!d.id) return 'Identifiant invalide';
  if (collections.some((c) => c.id === d.id && c !== d)) return 'Identifiant déjà utilisé';
  if (!d.files.length) return 'Au moins une variation requise';
  for (const f of d.files) {
    for (const z of f.zones) {
      if (z.suggestedColorId && !nuancier.some((n) => n.id === z.suggestedColorId)) {
        return `Code nuancier inconnu : ${z.suggestedColorId}`;
      }
    }
  }
  return null;
}

async function saveCurrent(): Promise<void> {
  if (!editing) return;
  const err = validateDraft(editing);
  if (err) {
    setStatus(err, false);
    return;
  }
  editing.colors = colorIdsOf(editing);
  const entry = {
    id: editing.id,
    nom: editing.nom,
    description: '',
    format: editing.format,
    variations: editing.files.length,
    defaut_layout: editing.defaut_layout,
    layouts: editing.layouts,
    category: editing.category || 'mes-collections',
    colors: editing.colors,
    active: true,
  };
  const idx = collections.findIndex((c) => c.id === editing!.id);
  if (idx >= 0) collections[idx] = editing;
  else collections.push(editing);

  const jsonList = collections.map((c) => ({
    id: c.id,
    nom: c.nom,
    description: '',
    format: c.format,
    variations: c.files.length,
    defaut_layout: c.defaut_layout,
    layouts: c.layouts,
    category: c.category,
    colors: c.colors,
    active: true,
  }));

  if (mode === 'fs' && dirHandle) {
    await writeToDirectory(dirHandle, jsonList, editing);
    setStatus('Enregistré. Lancez `npm run sync:local` puis committez.');
  } else {
    await downloadZip(jsonList, editing);
    setStatus('ZIP téléchargé. Décompressez dans collections-locales/, puis `npm run sync:local` et committez.');
  }
  renderList();
  void entry;
}

async function writeToDirectory(
  root: FileSystemDirectoryHandle,
  jsonList: unknown[],
  current: LocalCollectionDraft,
): Promise<void> {
  const jsonHandle = await root.getFileHandle('collections.json', { create: true });
  const writable = await jsonHandle.createWritable();
  await writable.write(JSON.stringify(jsonList, null, 1));
  await writable.close();
  let svgDir: FileSystemDirectoryHandle;
  try {
    svgDir = await root.getDirectoryHandle('svg', { create: true });
  } catch {
    svgDir = root;
  }
  for (let i = 0; i < current.files.length; i++) {
    const f = current.files[i]!;
    const ext = /\.png$/i.test(f.name) ? 'png' : 'svg';
    const name = `${current.id}-VAR${i + 1}.${ext}`;
    const fh = await svgDir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    if (ext === 'png' && f.text.startsWith('data:')) {
      const bin = await (await fetch(f.text)).arrayBuffer();
      await w.write(bin);
    } else {
      await w.write(f.zoned);
    }
    await w.close();
  }
}

async function downloadZip(jsonList: unknown[], current: LocalCollectionDraft): Promise<void> {
  const entries: Array<{ path: string; data: string | Uint8Array }> = [
    { path: 'collections.json', data: JSON.stringify(jsonList, null, 1) },
  ];
  for (let i = 0; i < current.files.length; i++) {
    const f = current.files[i]!;
    const ext = /\.png$/i.test(f.name) ? 'png' : 'svg';
    const name = `svg/${current.id}-VAR${i + 1}.${ext}`;
    if (ext === 'png' && f.text.startsWith('data:')) {
      const bin = new Uint8Array(await (await fetch(f.text)).arrayBuffer());
      entries.push({ path: name, data: bin });
    } else {
      entries.push({ path: name, data: f.zoned });
    }
  }
  const zip = buildZip(entries);
  const copy = new Uint8Array(zip.byteLength);
  copy.set(zip);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'collections-locales.zip';
  a.dataset.testid = 'admin-zip-download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.querySelector('[data-testid="admin-open-dir"]')?.addEventListener('click', async () => {
  const w = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (!w.showDirectoryPicker) {
    setStatus('API dossier indisponible — utilisez le mode téléchargement.', false);
    return;
  }
  try {
    dirHandle = await w.showDirectoryPicker();
    mode = 'fs';
    modeLabel.textContent = 'Mode : dossier ouvert';
    const raw = await readCollectionsJson(dirHandle);
    collections = raw.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: String(rec.id ?? ''),
        nom: String(rec.nom ?? ''),
        format: String(rec.format ?? '20x20'),
        category: String(rec.category ?? 'mes-collections'),
        variations: Number(rec.variations ?? 0),
        layouts: Array.isArray(rec.layouts) ? rec.layouts.map(String) : [],
        defaut_layout: String(rec.defaut_layout ?? 'aleatoire'),
        colors: Array.isArray(rec.colors) ? rec.colors.map(String) : [],
        files: [],
        palettes: [],
      };
    });
    renderList();
    setStatus('Dossier prêt');
  } catch {
    setStatus('Ouverture annulée', false);
  }
});

document.querySelector('[data-testid="admin-download-mode"]')?.addEventListener('click', () => {
  mode = 'download';
  dirHandle = null;
  modeLabel.textContent = 'Mode : téléchargement (.zip)';
  setStatus('Mode téléchargement actif');
});

document.querySelector('[data-testid="admin-new"]')?.addEventListener('click', () => {
  if (mode === 'none') {
    mode = 'download';
    modeLabel.textContent = 'Mode : téléchargement (.zip)';
  }
  openEditor();
});

void loadCatalogueMeta().then(() => setStatus('Prêt'));
