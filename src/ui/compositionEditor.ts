/**
 * Éditeur de composition sur la vue à plat (T46).
 * Canvas mailles + sélection/poignées + clavier ; 3D à droite via le viewport.
 */
import {
  EMPTY_COMPOSITION,
  addLayer,
  assetKey,
  hitTest,
  layerCorners,
  moveLayer,
  updateLayer,
  type Composition,
  type EmbeddedAsset,
  type RasterImage,
} from '../core/composition';
import { motifRows } from '../core/layout';
import { getState, update } from '../state';
import { Zone } from '../core/types';
import { rowRanges } from '../core/grid';
import { seamColumn } from '../core/calepinage';
import { encodePng, bytesToBase64 } from '../io/pngCodec';
import { loadTileFromFile } from '../io/tiles';

export interface CompositionEditorApi {
  sync: () => void;
  setImages: (images: Map<string, RasterImage>) => void;
  destroy: () => void;
}

const BASE_W = 4;

export function mountCompositionEditor(host: HTMLElement): CompositionEditorApi {
  const root = document.createElement('div');
  root.className = 'comp-editor';
  root.dataset.testid = 'comp-editor';
  root.hidden = true;

  const toolbar = document.createElement('div');
  toolbar.className = 'comp-toolbar';
  const addLib = document.createElement('button');
  addLib.type = 'button';
  addLib.dataset.testid = 'comp-add-library';
  addLib.textContent = 'Ajouter (bibliothèque)';
  const addImport = document.createElement('button');
  addImport.type = 'button';
  addImport.dataset.testid = 'comp-add-import';
  addImport.textContent = 'Importer PNG/SVG';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.png,.svg,image/png,image/svg+xml';
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.dataset.testid = 'comp-import-input';
  const snapToggle = document.createElement('label');
  snapToggle.className = 'comp-snap';
  const snapInput = document.createElement('input');
  snapInput.type = 'checkbox';
  snapInput.checked = true;
  snapInput.dataset.testid = 'comp-snap';
  snapToggle.append(snapInput, document.createTextNode(' Aimantation'));
  const helpBtn = document.createElement('button');
  helpBtn.type = 'button';
  helpBtn.dataset.testid = 'comp-help';
  helpBtn.textContent = '?';
  helpBtn.title = 'Conseils jacquard';
  const helpBubble = document.createElement('p');
  helpBubble.className = 'hint comp-help-bubble';
  helpBubble.dataset.testid = 'comp-help-bubble';
  helpBubble.hidden = true;
  helpBubble.textContent =
    'Préférez des dessins en aplats (SVG) ; les photos passent mal en 4 à 6 couleurs de fil.';
  helpBtn.addEventListener('click', () => {
    helpBubble.hidden = !helpBubble.hidden;
  });
  toolbar.append(addLib, addImport, fileInput, snapToggle, helpBtn);

  const canvas = document.createElement('canvas');
  canvas.dataset.testid = 'comp-canvas';
  canvas.tabIndex = 0;

  const layers = document.createElement('div');
  layers.className = 'comp-layers';
  layers.dataset.testid = 'comp-layers';

  const inspector = document.createElement('div');
  inspector.className = 'comp-inspector';
  inspector.dataset.testid = 'comp-inspector';

  const libPicker = document.createElement('div');
  libPicker.className = 'comp-lib';
  libPicker.dataset.testid = 'comp-lib-picker';
  libPicker.hidden = true;

  root.append(toolbar, helpBubble, canvas, layers, inspector, libPicker);
  host.appendChild(root);

  const splitter = document.createElement('div');
  splitter.className = 'comp-splitter';
  splitter.dataset.testid = 'comp-splitter';
  splitter.title = 'Redimensionner';
  host.appendChild(splitter);

  let images = new Map<string, RasterImage>();
  let selectedId: string | null = null;
  let zoom = 1;
  let panX = 20;
  let panY = 20;
  let dragging: { id: string; startX: number; startY: number; origX: number; origY: number } | null =
    null;
  let handleDrag:
    | { kind: 'scale'; id: string; startDist: number; origW: number }
    | { kind: 'rotate'; id: string; startAngle: number; origRot: number }
    | null = null;
  let panning = false;
  let lastPan = { x: 0, y: 0 };
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let splitRatio = 0.5;

  function composition(): Composition {
    const p = getState().design.pattern;
    if (p?.kind === 'composition') return p.composition;
    return EMPTY_COMPOSITION;
  }

  function gauge() {
    const { design } = getState();
    return {
      needles: design.dimensions.needles,
      rows: motifRows(design.dimensions, design.zones),
      stitchesPerCm: design.dimensions.stitchesPerCm,
      rowsPerCm: design.dimensions.rowsPerCm,
    };
  }

  function setComposition(next: Composition): void {
    update({ design: { pattern: { kind: 'composition', composition: next } } });
  }

  function stitchSize(): { sw: number; sh: number } {
    const g = gauge();
    const sw = BASE_W * zoom;
    const sh = Math.max(1, Math.round(sw * (g.rowsPerCm / g.stitchesPerCm)));
    return { sw, sh };
  }

  function draw(): void {
    const state = getState();
    const source = state.design.pattern;
    root.hidden = source?.kind !== 'composition';
    if (source?.kind !== 'composition') return;

    const comp = source.composition;
    const g = gauge();
    const { sw, sh } = stitchSize();
    const ranges = rowRanges(state.design.dimensions, state.design.zones);
    const totalRows =
      (state.design.zones.cuffEnabled ? state.design.dimensions.cuffRows : 0) +
      state.design.dimensions.legRows +
      state.design.dimensions.heelRows +
      state.design.dimensions.footRows +
      state.design.dimensions.toeRows;
    const width = Math.ceil(panX + g.needles * sw + 40);
    const height = Math.ceil(panY + totalRows * sh + 40);
    canvas.width = Math.min(4000, Math.max(host.clientWidth || 600, width));
    canvas.height = Math.min(6000, Math.max(400, height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ebe6dc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Zones grisées hors motif
    const motifStart = ranges.leg.start;
    for (let row = 0; row < totalRows; row++) {
      const y = panY + row * sh;
      let zone: number = Zone.Empty;
      if (row >= ranges.cuff.start && row < ranges.cuff.end) zone = Zone.Cuff;
      else if (row >= ranges.leg.start && row < ranges.leg.end) zone = Zone.Leg;
      else if (row >= ranges.heel.start && row < ranges.heel.end) zone = Zone.Heel;
      else if (row >= ranges.foot.start && row < ranges.foot.end) zone = Zone.Foot;
      else if (row >= ranges.toe.start && row < ranges.toe.end) zone = Zone.Toe;
      if (zone === Zone.Cuff || zone === Zone.Heel || zone === Zone.Toe || zone === Zone.Empty) {
        ctx.fillStyle = 'rgba(120,110,100,0.35)';
        ctx.fillRect(panX, y, g.needles * sw, sh);
      }
    }

    // Fond motif
    ctx.fillStyle = comp.background;
    ctx.fillRect(panX, panY + motifStart * sh, g.needles * sw, g.rows * sh);

    // Calques (aperçu approximatif : rectangles colorés)
    for (const layer of comp.layers) {
      if (layer.hidden) continue;
      const img = images.get(assetKey(layer.asset));
      const corners = layerCorners(layer, img ?? { width: 1, height: 1 }, g);
      ctx.save();
      ctx.translate(panX, panY + motifStart * sh);
      ctx.beginPath();
      corners.forEach(([x, y], i) => {
        const px = ((x % g.needles) + g.needles) % g.needles * sw;
        const py = y * sh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = layer.id === selectedId ? 'rgba(180,70,47,0.45)' : 'rgba(30,80,140,0.35)';
      ctx.fill();
      ctx.strokeStyle = layer.id === selectedId ? '#b5462f' : '#1f3a5f';
      ctx.lineWidth = layer.id === selectedId ? 2 : 1;
      ctx.stroke();
      ctx.restore();
    }

    // Ligne de raccord
    const seam = seamColumn(state.design.layout.seam, g.needles);
    ctx.strokeStyle = '#b5462f';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(panX + seam * sw, panY);
    ctx.lineTo(panX + seam * sw, panY + totalRows * sh);
    ctx.stroke();
    ctx.setLineDash([]);

    // Repères devant / dos / côtés (colonnes convention : dos=0, côtés=W/4 & 3W/4, devant=W/2… selon seam)
    const markers: Array<{ col: number; label: string }> = [
      { col: 0, label: 'dos' },
      { col: Math.round(g.needles / 4), label: 'côté' },
      { col: Math.round(g.needles / 2), label: 'devant' },
      { col: Math.round((3 * g.needles) / 4), label: 'côté' },
    ];
    ctx.fillStyle = '#5a5048';
    ctx.font = '11px sans-serif';
    for (const m of markers) {
      const x = panX + m.col * sw;
      ctx.strokeStyle = 'rgba(90,80,72,0.35)';
      ctx.beginPath();
      ctx.moveTo(x, panY);
      ctx.lineTo(x, panY + totalRows * sh);
      ctx.stroke();
      ctx.fillText(m.label, x + 2, panY + 12);
    }

    // Poignées du calque sélectionné
    if (selectedId) {
      const layer = comp.layers.find((l) => l.id === selectedId);
      if (layer && !layer.hidden) {
        const img = images.get(assetKey(layer.asset)) ?? { width: 1, height: 1 };
        const corners = layerCorners(layer, img, g);
        const pts = corners.map(([x, y]) => ({
          px: panX + (((x % g.needles) + g.needles) % g.needles) * sw,
          py: panY + (motifStart + y) * sh,
        }));
        for (const p of pts) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#b5462f';
          ctx.lineWidth = 1.5;
          ctx.fillRect(p.px - 4, p.py - 4, 8, 8);
          ctx.strokeRect(p.px - 4, p.py - 4, 8, 8);
        }
        // Poignée de rotation au-dessus du centre
        const cx = pts.reduce((s, p) => s + p.px, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.py, 0) / pts.length;
        const rotY = Math.min(...pts.map((p) => p.py)) - 18;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, rotY);
        ctx.strokeStyle = '#b5462f';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, rotY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#b5462f';
        ctx.fill();
      }
    }

    renderLayersPanel(comp);
    renderInspector(comp);
    applySplit();
  }

  function applySplit(): void {
    const mode = getState().design.pattern?.kind === 'composition';
    root.hidden = !mode;
    splitter.hidden = !mode;
    if (!mode) {
      host.style.removeProperty('--comp-split');
      return;
    }
    const pct = Math.round(splitRatio * 100);
    host.style.setProperty('--comp-split', `${pct}%`);
  }

  function softSnap(x: number, y: number, needles: number): { x: number; y: number } {
    if (!snapInput.checked) return { x, y };
    const targets = [0, needles / 4, needles / 2, (3 * needles) / 4];
    let sx = x;
    for (const t of targets) {
      if (Math.abs(x - t) <= 2) sx = t;
    }
    return { x: sx, y };
  }

  function renderInspector(comp: Composition): void {
    inspector.replaceChildren();
    const layer = comp.layers.find((l) => l.id === selectedId);
    if (!layer) {
      inspector.hidden = true;
      return;
    }
    inspector.hidden = false;
    const g = gauge();
    const title = document.createElement('h3');
    title.textContent = 'Calque sélectionné';
    inspector.appendChild(title);

    const addNum = (label: string, testid: string, value: number, onChange: (n: number) => void) => {
      const row = document.createElement('label');
      row.textContent = `${label} `;
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(Math.round(value * 10) / 10);
      input.dataset.testid = testid;
      input.addEventListener('change', () => onChange(Number(input.value)));
      row.appendChild(input);
      inspector.appendChild(row);
    };

    addNum('X (mailles)', 'comp-prop-x', layer.x, (n) =>
      setComposition(updateLayer(comp, layer.id, { x: n })),
    );
    addNum('Y (rangs)', 'comp-prop-y', layer.y, (n) =>
      setComposition(updateLayer(comp, layer.id, { y: n })),
    );
    addNum('Largeur (mailles)', 'comp-prop-w', layer.widthStitches, (n) =>
      setComposition(updateLayer(comp, layer.id, { widthStitches: Math.max(1, n) })),
    );
    const widthCm = layer.widthStitches / g.stitchesPerCm;
    const cm = document.createElement('p');
    cm.className = 'hint';
    cm.textContent = `≈ ${widthCm.toFixed(1)} cm`;
    inspector.appendChild(cm);
    addNum('Rotation (°)', 'comp-prop-rot', layer.rotation, (n) =>
      setComposition(updateLayer(comp, layer.id, { rotation: n })),
    );

    const flips = document.createElement('div');
    flips.className = 'row';
    const mkFlip = (label: string, testid: string, key: 'flipX' | 'flipY') => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.testid = testid;
      btn.textContent = label;
      btn.classList.toggle('selected', layer[key]);
      btn.addEventListener('click', () =>
        setComposition(updateLayer(comp, layer.id, { [key]: !layer[key] })),
      );
      flips.appendChild(btn);
    };
    mkFlip('Miroir H', 'comp-flip-h', 'flipX');
    mkFlip('Miroir V', 'comp-flip-v', 'flipY');
    inspector.appendChild(flips);

    const repeat = document.createElement('label');
    repeat.textContent = 'Répéter autour ';
    const gap = document.createElement('input');
    gap.type = 'number';
    gap.dataset.testid = 'comp-repeat-gap';
    gap.value = layer.repeatAroundGap == null ? '' : String(layer.repeatAroundGap);
    gap.placeholder = 'écart';
    gap.addEventListener('change', () => {
      const v = gap.value.trim() === '' ? null : Number(gap.value);
      setComposition(updateLayer(comp, layer.id, { repeatAroundGap: v }));
    });
    repeat.appendChild(gap);
    inspector.appendChild(repeat);

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.dataset.testid = 'comp-pixel-preview';
    previewBtn.textContent = 'Aperçu gros pixels';
    previewBtn.addEventListener('click', () => showPixelPreview(layer));
    inspector.appendChild(previewBtn);

    let previewHost = inspector.querySelector('[data-testid="comp-pixel-preview-canvas"]') as HTMLCanvasElement | null;
    if (!previewHost) {
      previewHost = document.createElement('canvas');
      previewHost.dataset.testid = 'comp-pixel-preview-canvas';
      previewHost.hidden = true;
      inspector.appendChild(previewHost);
    }
  }

  function showPixelPreview(layer: { id: string; asset: import('../core/composition').AssetRef; widthStitches: number }): void {
    const img = images.get(assetKey(layer.asset));
    let canvas = root.querySelector('[data-testid="comp-pixel-preview-canvas"]') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.dataset.testid = 'comp-pixel-preview-canvas';
      inspector.appendChild(canvas);
    }
    if (!img) {
      canvas.hidden = true;
      setStatusHint('Image du calque pas encore chargée.');
      return;
    }
    const tw = Math.max(1, Math.round(layer.widthStitches));
    const aspect = img.height / Math.max(1, img.width);
    const th = Math.max(1, Math.round(tw * aspect * (gauge().stitchesPerCm / gauge().rowsPerCm)));
    canvas.width = tw;
    canvas.height = th;
    canvas.style.width = `${Math.min(280, tw * 4)}px`;
    canvas.style.height = 'auto';
    canvas.style.imageRendering = 'pixelated';
    canvas.hidden = false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const src = document.createElement('canvas');
    src.width = img.width;
    src.height = img.height;
    const sctx = src.getContext('2d');
    if (!sctx) return;
    const imageData = sctx.createImageData(img.width, img.height);
    imageData.data.set(img.rgba);
    sctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, tw, th);
    ctx.drawImage(src, 0, 0, tw, th);
  }

  function renderLayersPanel(comp: Composition): void {
    layers.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Calques';
    layers.appendChild(title);
    const bg = document.createElement('label');
    bg.textContent = 'Fond ';
    const bgInput = document.createElement('input');
    bgInput.type = 'color';
    bgInput.value = comp.background;
    bgInput.dataset.testid = 'comp-bg-color';
    bgInput.addEventListener('input', () => {
      setComposition({ ...comp, background: bgInput.value });
    });
    bg.appendChild(bgInput);
    layers.appendChild(bg);

    [...comp.layers].reverse().forEach((layer, revIdx) => {
      const idx = comp.layers.length - 1 - revIdx;
      const row = document.createElement('div');
      row.className = layer.id === selectedId ? 'comp-layer selected' : 'comp-layer';
      row.dataset.testid = `comp-layer-${layer.id}`;
      const name = document.createElement('span');
      name.dataset.testid = `comp-layer-name-${layer.id}`;
      name.textContent = layer.asset.kind === 'collection'
        ? `${layer.asset.collectionId}/${layer.asset.variation}`
        : layer.id;
      row.appendChild(name);
      row.addEventListener('click', () => {
        selectedId = layer.id;
        draw();
      });

      const vis = document.createElement('button');
      vis.type = 'button';
      vis.dataset.testid = `comp-vis-${layer.id}`;
      vis.textContent = layer.hidden ? 'afficher' : 'cacher';
      vis.title = layer.hidden ? 'Afficher' : 'Masquer';
      vis.addEventListener('click', (e) => {
        e.stopPropagation();
        setComposition(updateLayer(composition(), layer.id, { hidden: !layer.hidden }));
      });
      const lock = document.createElement('button');
      lock.type = 'button';
      lock.dataset.testid = `comp-lock-${layer.id}`;
      lock.textContent = layer.locked ? 'déverrouiller' : 'verrouiller';
      lock.title = 'Verrou';
      lock.addEventListener('click', (e) => {
        e.stopPropagation();
        setComposition(updateLayer(composition(), layer.id, { locked: !layer.locked }));
      });
      const up = document.createElement('button');
      up.type = 'button';
      up.dataset.testid = `comp-up-${layer.id}`;
      up.textContent = '↑';
      up.addEventListener('click', (e) => {
        e.stopPropagation();
        setComposition(moveLayer(composition(), layer.id, 'monter'));
      });
      const down = document.createElement('button');
      down.type = 'button';
      down.dataset.testid = `comp-down-${layer.id}`;
      down.textContent = '↓';
      down.addEventListener('click', (e) => {
        e.stopPropagation();
        setComposition(moveLayer(composition(), layer.id, 'descendre'));
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.dataset.testid = `comp-delete-${layer.id}`;
      del.textContent = '✕';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = composition();
        setComposition({ ...cur, layers: cur.layers.filter((l) => l.id !== layer.id) });
        if (selectedId === layer.id) selectedId = null;
      });
      void idx;
      row.append(vis, lock, up, down, del);
      layers.appendChild(row);
    });
  }

  function clientToStitch(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    const { sw, sh } = stitchSize();
    const g = gauge();
    const ranges = rowRanges(getState().design.dimensions, getState().design.zones);
    const px = clientX - rect.left - panX;
    const py = clientY - rect.top - panY - ranges.leg.start * sh;
    if (py < 0 || py > g.rows * sh) return null;
    return {
      x: ((Math.floor(px / sw) % g.needles) + g.needles) % g.needles,
      y: Math.floor(py / sh),
    };
  }

  function handleAt(clientX: number, clientY: number): typeof handleDrag {
    if (!selectedId) return null;
    const comp = composition();
    const layer = comp.layers.find((l) => l.id === selectedId);
    if (!layer || layer.locked) return null;
    const g = gauge();
    const ranges = rowRanges(getState().design.dimensions, getState().design.zones);
    const { sw, sh } = stitchSize();
    const img = images.get(assetKey(layer.asset)) ?? { width: 1, height: 1 };
    const corners = layerCorners(layer, img, g);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const pts = corners.map(([x, y]) => ({
      px: panX + (((x % g.needles) + g.needles) % g.needles) * sw,
      py: panY + (ranges.leg.start + y) * sh,
    }));
    for (const p of pts) {
      if (Math.hypot(mx - p.px, my - p.py) <= 10) {
        const cx = pts.reduce((s, q) => s + q.px, 0) / pts.length;
        const cy = pts.reduce((s, q) => s + q.py, 0) / pts.length;
        return {
          kind: 'scale',
          id: layer.id,
          startDist: Math.max(1, Math.hypot(mx - cx, my - cy)),
          origW: layer.widthStitches,
        };
      }
    }
    const cx = pts.reduce((s, p) => s + p.px, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.py, 0) / pts.length;
    const rotY = Math.min(...pts.map((p) => p.py)) - 18;
    if (Math.hypot(mx - cx, my - rotY) <= 10) {
      return {
        kind: 'rotate',
        id: layer.id,
        startAngle: Math.atan2(my - cy, mx - cx),
        origRot: layer.rotation,
      };
    }
    return null;
  }

  let spaceDown = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) spaceDown = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceDown = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2 || e.shiftKey || spaceDown) {
      panning = true;
      lastPan = { x: e.clientX, y: e.clientY };
      return;
    }
    const handle = handleAt(e.clientX, e.clientY);
    if (handle) {
      handleDrag = handle;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const st = clientToStitch(e.clientX, e.clientY);
    if (!st) {
      canvas.focus();
      return;
    }
    const comp = composition();
    const g = gauge();
    // Fallback 1×1 si l’image n’est pas encore chargée : la géométrie approximative suffit pour sélectionner.
    const hitImages = new Map<string, { width: number; height: number }>();
    for (const layer of comp.layers) {
      const key = assetKey(layer.asset);
      hitImages.set(key, images.get(key) ?? { width: 1, height: 1 });
    }
    const hit = hitTest(comp, hitImages, g, st.x + 0.5, st.y + 0.5);
    if (hit) {
      selectedId = hit;
      const layer = comp.layers.find((l) => l.id === hit)!;
      if (!layer.locked) {
        dragging = { id: hit, startX: st.x, startY: st.y, origX: layer.x, origY: layer.y };
      }
    } else {
      selectedId = null;
    }
    draw();
    canvas.focus();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (panning) {
      panX += e.clientX - lastPan.x;
      panY += e.clientY - lastPan.y;
      lastPan = { x: e.clientX, y: e.clientY };
      draw();
      return;
    }
    if (handleDrag) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const comp = composition();
      const layer = comp.layers.find((l) => l.id === handleDrag!.id);
      if (!layer) return;
      const g = gauge();
      const ranges = rowRanges(getState().design.dimensions, getState().design.zones);
      const { sw, sh } = stitchSize();
      const img = images.get(assetKey(layer.asset)) ?? { width: 1, height: 1 };
      const corners = layerCorners(layer, img, g);
      const pts = corners.map(([x, y]) => ({
        px: panX + (((x % g.needles) + g.needles) % g.needles) * sw,
        py: panY + (ranges.leg.start + y) * sh,
      }));
      const cx = pts.reduce((s, p) => s + p.px, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.py, 0) / pts.length;
      if (handleDrag.kind === 'scale') {
        const dist = Math.max(1, Math.hypot(mx - cx, my - cy));
        const nextW = Math.max(2, Math.round((handleDrag.origW * dist) / handleDrag.startDist));
        const next = updateLayer(comp, handleDrag.id, { widthStitches: nextW });
        clearTimeout(debounce);
        debounce = setTimeout(() => setComposition(next), 60);
        update({ design: { pattern: { kind: 'composition', composition: next } } }, {
          skipHistory: true,
          coalesce: true,
        });
      } else {
        const ang = Math.atan2(my - cy, mx - cx);
        let deg = handleDrag.origRot + ((ang - handleDrag.startAngle) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        const next = updateLayer(comp, handleDrag.id, { rotation: deg });
        clearTimeout(debounce);
        debounce = setTimeout(() => setComposition(next), 60);
        update({ design: { pattern: { kind: 'composition', composition: next } } }, {
          skipHistory: true,
          coalesce: true,
        });
      }
      return;
    }
    if (!dragging) return;
    const st = clientToStitch(e.clientX, e.clientY);
    if (!st) return;
    const dx = st.x - dragging.startX;
    const dy = st.y - dragging.startY;
    const snapped = softSnap(dragging.origX + dx, dragging.origY + dy, gauge().needles);
    const next = updateLayer(composition(), dragging.id, {
      x: snapped.x,
      y: snapped.y,
    });
    clearTimeout(debounce);
    debounce = setTimeout(() => setComposition(next), 60);
    // aperçu local
    update({ design: { pattern: { kind: 'composition', composition: next } } }, { skipHistory: true, coalesce: true });
  });

  canvas.addEventListener('pointerup', () => {
    dragging = null;
    handleDrag = null;
    panning = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.max(1, Math.min(8, zoom + (e.deltaY > 0 ? -1 : 1)));
    draw();
  });

  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      splitRatio = Math.min(0.75, Math.max(0.25, (ev.clientX - rect.left) / rect.width));
      applySplit();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  canvas.addEventListener('keydown', (e) => {
    const comp = composition();
    if (!selectedId) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setComposition(updateLayer(comp, selectedId, { x: (comp.layers.find((l) => l.id === selectedId)?.x ?? 0) - step }));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setComposition(updateLayer(comp, selectedId, { x: (comp.layers.find((l) => l.id === selectedId)?.x ?? 0) + step }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setComposition(updateLayer(comp, selectedId, { y: (comp.layers.find((l) => l.id === selectedId)?.y ?? 0) - step }));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setComposition(updateLayer(comp, selectedId, { y: (comp.layers.find((l) => l.id === selectedId)?.y ?? 0) + step }));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setComposition({ ...comp, layers: comp.layers.filter((l) => l.id !== selectedId) });
      selectedId = null;
    } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const layer = comp.layers.find((l) => l.id === selectedId);
      if (!layer) return;
      const g = gauge();
      const newId = `L${Date.now().toString(36)}`;
      let next = addLayer(comp, layer.asset, g, newId);
      next = updateLayer(next, newId, { ...layer, id: newId, x: layer.x + 5, y: layer.y + 5 });
      setComposition(next);
      selectedId = newId;
    } else if (e.key === '[') {
      setComposition(moveLayer(comp, selectedId, 'dessous'));
    } else if (e.key === ']') {
      setComposition(moveLayer(comp, selectedId, 'dessus'));
    }
  });

  addLib.addEventListener('click', () => {
    const cat = getState().catalogue;
    libPicker.hidden = false;
    libPicker.replaceChildren();
    if (!cat) {
      libPicker.textContent = 'Catalogue non disponible.';
      return;
    }
    for (const c of cat.collections.filter((x) => x.variations.length)) {
      for (const v of c.variations) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.testid = `comp-lib-${c.id}-${v.name}`;
        btn.textContent = `${c.nom} · ${v.name}`;
        btn.addEventListener('click', () => {
          const g = gauge();
          const newId = `L${Date.now().toString(36)}`;
          let next = addLayer(composition(), { kind: 'collection', collectionId: c.id, variation: v.name }, g, newId);
          next = updateLayer(next, newId, {
            x: g.needles / 2,
            y: g.rows / 3,
            widthStitches: Math.round(g.needles / 4),
          });
          setComposition(next);
          selectedId = newId;
          libPicker.hidden = true;
        });
        libPicker.appendChild(btn);
      }
    }
  });

  addImport.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (files.length) void importFiles(files);
  });

  async function importFiles(files: File[]): Promise<void> {
    const g = gauge();
    let next = composition();
    const assets = [...getState().embeddedAssets];
    for (const file of files) {
      try {
        const asset = await fileToEmbeddedAsset(file);
        assets.push(asset);
        const newId = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        next = addLayer(next, { kind: 'embarquee', assetId: asset.id }, g, newId);
        next = updateLayer(next, newId, {
          x: g.needles / 2,
          y: g.rows / 3,
          widthStitches: Math.round(g.needles / 4),
        });
        selectedId = newId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import impossible.';
        setStatusHint(message);
      }
    }
    update({
      embeddedAssets: assets,
      design: { pattern: { kind: 'composition', composition: next } },
    });
    libPicker.hidden = true;
  }

  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) =>
      /\.(png|svg)$/i.test(f.name) || f.type === 'image/png' || f.type === 'image/svg+xml',
    );
    if (files.length) void importFiles(files);
  });

  function setStatusHint(msg: string): void {
    let el = root.querySelector('[data-testid="comp-hint"]') as HTMLElement | null;
    if (!el) {
      el = document.createElement('p');
      el.className = 'hint';
      el.dataset.testid = 'comp-hint';
      root.appendChild(el);
    }
    el.textContent = msg;
  }

  return {
    sync: draw,
    setImages: (imgs) => {
      images = imgs;
      draw();
    },
    destroy: () => {
      root.remove();
      splitter.remove();
    },
  };
}

async function fileToEmbeddedAsset(file: File): Promise<EmbeddedAsset> {
  const id = `A${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const isSvg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';
  if (isSvg) {
    const data = await file.text();
    // Dimensions via le pipeline tiles (SVG → raster) pour width/height.
    const tile = await loadTileFromFile(file);
    return {
      id,
      name: file.name,
      mime: 'image/svg+xml',
      data,
      width: tile.width,
      height: tile.height,
    };
  }
  const tile = await loadTileFromFile(file);
  // PNG > 2 Mo : déjà plafonné par loadTileFromFile (1024) ; on ré-encode en data URL.
  const png = await encodePng(tile.rgba, tile.width, tile.height);
  const data = `data:image/png;base64,${bytesToBase64(png)}`;
  return {
    id,
    name: file.name,
    mime: 'image/png',
    data,
    width: tile.width,
    height: tile.height,
  };
}

/** Bascule Carreaux / Composition en tête de panneau. */
export function mountPatternModeToggle(host: HTMLElement): { sync: () => void } {
  const bar = document.createElement('div');
  bar.className = 'pattern-mode';
  bar.dataset.testid = 'pattern-mode';
  const carreaux = document.createElement('button');
  carreaux.type = 'button';
  carreaux.dataset.testid = 'mode-carreaux';
  carreaux.textContent = 'Carreaux';
  const composition = document.createElement('button');
  composition.type = 'button';
  composition.dataset.testid = 'mode-composition';
  composition.textContent = 'Composition';
  bar.append(carreaux, composition);
  host.prepend(bar);

  carreaux.addEventListener('click', () => {
    update({ design: { pattern: { kind: 'carreaux' } } });
  });
  composition.addEventListener('click', () => {
    const cur = getState().design.pattern;
    if (cur?.kind === 'composition') return;
    update({
      design: {
        pattern: { kind: 'composition', composition: { ...EMPTY_COMPOSITION } },
      },
    });
  });

  function sync(): void {
    const kind = getState().design.pattern?.kind ?? 'carreaux';
    carreaux.setAttribute('aria-pressed', kind === 'carreaux' ? 'true' : 'false');
    composition.setAttribute('aria-pressed', kind === 'composition' ? 'true' : 'false');
    carreaux.classList.toggle('selected', kind === 'carreaux');
    composition.classList.toggle('selected', kind === 'composition');
    document.getElementById('app')?.classList.toggle('composition-mode', kind === 'composition');
  }
  sync();
  return { sync };
}
