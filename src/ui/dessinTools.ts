/**
 * Barre d’outils et interactions de dessin 2D (T72) pour un calque Dessin sélectionné.
 */
import {
  brushCells,
  dessinCellsForGauge,
  faceGuides,
  floodCells,
  lineCells,
  mirrorCells,
  paintDessin,
  rectCells,
  rgbKeys,
  rowsOfCells,
  stackGauge,
  type DessinLayer,
  type SockDesignV2,
  type StackLayer,
} from '../core/layers';
import type { Hex } from '../core/types';
import type { FlatHandle } from './flatView';

export type DessinTool =
  | 'crayon'
  | 'gomme'
  | 'trait'
  | 'rectangle'
  | 'pot'
  | 'pipette'
  | 'main';

export type DessinSymmetry = 'aucune' | 'devant-dos' | 'interieur-exterieur';

export interface DessinToolsState {
  tool: DessinTool;
  color: Hex;
  thickness: number;
  symmetry: DessinSymmetry;
  snap: boolean;
  rectFilled: boolean;
  potFromVisible: boolean;
}

export interface DessinToolsDeps {
  getDesign: () => SockDesignV2;
  getSelectedId: () => string | null;
  getStackRgb: () => Uint8ClampedArray | null;
  /** Commit définitif (une étape d’historique). */
  commitDessin: (layerId: string, next: DessinLayer) => void;
  /** Aperçu pendant le trait (sans historique). */
  previewStack: (layers: StackLayer[], dirtyRows: [number, number] | null) => void;
  endPreview: () => void;
  onColorChange?: (color: Hex) => void;
}

const STORAGE_KEY = 'sim-dessin-tools';
const DEFAULT_COLOR = '#1d1d1b' as Hex;

function loadState(): DessinToolsState {
  const base: DessinToolsState = {
    tool: 'crayon',
    color: DEFAULT_COLOR,
    thickness: 1,
    symmetry: 'aucune',
    snap: true,
    rectFilled: true,
    potFromVisible: true,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DessinToolsState>;
    return { ...base, ...parsed, color: (parsed.color as Hex) ?? DEFAULT_COLOR };
  } catch {
    return base;
  }
}

function saveState(state: DessinToolsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function symmetryAxis(sym: DessinSymmetry, W: number): number | null {
  if (sym === 'devant-dos') return W / 4;
  if (sym === 'interieur-exterieur') return 0;
  return null;
}

function withMirror(
  cells: Array<[number, number]>,
  sym: DessinSymmetry,
  W: number,
): Array<[number, number]> {
  const axis = symmetryAxis(sym, W);
  if (axis === null) return cells;
  const mirrored = mirrorCells(cells, axis, W);
  const seen = new Set(cells.map(([x, y]) => `${x},${y}`));
  const out = [...cells];
  for (const c of mirrored) {
    const k = `${c[0]},${c[1]}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

function snapCol(col: number, W: number, enabled: boolean): number {
  if (!enabled) return col;
  const guides = [...faceGuides(W).map((g) => g.col), 0, W];
  let best = col;
  let bestD = Infinity;
  for (const g of guides) {
    const target = ((g % W) + W) % W;
    let d = Math.abs(col - target);
    d = Math.min(d, W - d);
    if (d <= 2 && d < bestD) {
      bestD = d;
      best = target;
    }
  }
  return best;
}

export interface DessinToolsApi {
  root: HTMLElement;
  sync: () => void;
  getState: () => DessinToolsState;
  setColor: (color: Hex) => void;
  isDrawingActive: () => boolean;
  dispose: () => void;
}

export function mountDessinTools(
  host: HTMLElement,
  flat: FlatHandle,
  deps: DessinToolsDeps,
): DessinToolsApi {
  let state = loadState();
  const root = document.createElement('div');
  root.className = 'dessin-toolbar';
  root.dataset.testid = 'dessin-toolbar';
  root.hidden = true;

  const tools: Array<{ id: DessinTool; label: string; key: string }> = [
    { id: 'crayon', label: 'Crayon', key: 'B' },
    { id: 'gomme', label: 'Gomme', key: 'E' },
    { id: 'trait', label: 'Trait', key: 'L' },
    { id: 'rectangle', label: 'Rectangle', key: 'R' },
    { id: 'pot', label: 'Pot', key: 'G' },
    { id: 'pipette', label: 'Pipette', key: 'I' },
    { id: 'main', label: 'Main', key: 'Espace' },
  ];

  const toolGroup = document.createElement('div');
  toolGroup.className = 'dessin-tool-group';
  const toolButtons = new Map<DessinTool, HTMLButtonElement>();
  for (const t of tools) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.testid = `dessin-tool-${t.id}`;
    btn.title = `${t.label} (${t.key})`;
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      state = { ...state, tool: t.id };
      saveState(state);
      syncUi();
    });
    toolButtons.set(t.id, btn);
    toolGroup.appendChild(btn);
  }

  const colorBtn = document.createElement('button');
  colorBtn.type = 'button';
  colorBtn.className = 'dessin-color';
  colorBtn.dataset.testid = 'dessin-color';
  colorBtn.title = 'Couleur courante';

  const thick = document.createElement('label');
  thick.className = 'dessin-thick';
  thick.textContent = 'Épaisseur ';
  const thickInput = document.createElement('input');
  thickInput.type = 'number';
  thickInput.min = '1';
  thickInput.max = '4';
  thickInput.dataset.testid = 'dessin-thickness';
  thickInput.addEventListener('input', () => {
    state = { ...state, thickness: Math.min(4, Math.max(1, Number(thickInput.value) || 1)) };
    saveState(state);
  });
  thickInput.addEventListener('change', () => {
    state = { ...state, thickness: Math.min(4, Math.max(1, Number(thickInput.value) || 1)) };
    thickInput.value = String(state.thickness);
    saveState(state);
  });
  thick.appendChild(thickInput);

  const sym = document.createElement('select');
  sym.dataset.testid = 'dessin-symmetry';
  for (const [value, label] of [
    ['aucune', 'Symétrie : aucune'],
    ['devant-dos', 'Devant ↔ Dos'],
    ['interieur-exterieur', 'Intérieur ↔ Extérieur'],
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sym.appendChild(opt);
  }
  sym.addEventListener('change', () => {
    state = { ...state, symmetry: sym.value as DessinSymmetry };
    saveState(state);
  });

  const snap = document.createElement('label');
  snap.className = 'dessin-check';
  const snapInput = document.createElement('input');
  snapInput.type = 'checkbox';
  snapInput.dataset.testid = 'dessin-snap';
  snapInput.addEventListener('change', () => {
    state = { ...state, snap: snapInput.checked };
    saveState(state);
  });
  snap.append(snapInput, document.createTextNode(' Aimantation'));

  const rectFill = document.createElement('label');
  rectFill.className = 'dessin-check';
  const rectFillInput = document.createElement('input');
  rectFillInput.type = 'checkbox';
  rectFillInput.dataset.testid = 'dessin-rect-filled';
  rectFillInput.addEventListener('change', () => {
    state = { ...state, rectFilled: rectFillInput.checked };
    saveState(state);
  });
  rectFill.append(rectFillInput, document.createTextNode(' Rectangle plein'));

  const potMode = document.createElement('label');
  potMode.className = 'dessin-check';
  const potInput = document.createElement('input');
  potInput.type = 'checkbox';
  potInput.dataset.testid = 'dessin-pot-visible';
  potInput.addEventListener('change', () => {
    state = { ...state, potFromVisible: potInput.checked };
    saveState(state);
  });
  potMode.append(potInput, document.createTextNode(' Pot d’après ce qu’on voit'));

  const bubble = document.createElement('p');
  bubble.className = 'dessin-bubble';
  bubble.dataset.testid = 'dessin-out-zone';
  bubble.hidden = true;

  root.append(toolGroup, colorBtn, thick, sym, snap, rectFill, potMode);
  host.append(root, bubble);

  let stroke:
    | {
        id: string;
        base: DessinLayer;
        start: { col: number; row: number };
        cells: Array<[number, number]>;
        last3d: number;
      }
    | null = null;
  let spacePan = false;
  let raf = 0;
  let panning = false;
  let lastPan = { x: 0, y: 0 };

  function selectedDessin(): DessinLayer | null {
    const id = deps.getSelectedId();
    if (!id) return null;
    const layer = deps.getDesign().layers.find((l) => l.id === id);
    return layer?.kind === 'dessin' ? layer : null;
  }

  function syncUi(): void {
    const dessin = selectedDessin();
    root.hidden = !dessin;
    if (!dessin) {
      bubble.hidden = true;
      flat.setDessinPreview(null);
      return;
    }
    for (const [id, btn] of toolButtons) {
      btn.setAttribute('aria-pressed', id === state.tool ? 'true' : 'false');
      btn.classList.toggle('active', id === state.tool);
    }
    colorBtn.style.background = state.color;
    thickInput.value = String(state.thickness);
    sym.value = state.symmetry;
    snapInput.checked = state.snap;
    rectFillInput.checked = state.rectFilled;
    potInput.checked = state.potFromVisible;
  }

  function applyCells(
    base: DessinLayer,
    cells: Array<[number, number]>,
    erase: boolean,
  ): DessinLayer {
    const design = deps.getDesign();
    const g = stackGauge(design.dimensions, design.zones);
    const mirrored = withMirror(cells, state.symmetry, g.needles);
    return paintDessin(base, g.needles, g.rows, mirrored, erase ? null : state.color);
  }

  function previewFrom(working: DessinLayer, dirty: Array<[number, number]>): void {
    const design = deps.getDesign();
    const layers = design.layers.map((l) => (l.id === working.id ? working : l));
    const g = stackGauge(design.dimensions, design.zones);
    const rows = dirty.length ? rowsOfCells(withMirror(dirty, state.symmetry, g.needles), g.rows) : null;
    deps.previewStack(layers, rows);
    flat.setDessinPreview(
      withMirror(dirty, state.symmetry, g.needles),
      state.tool === 'gomme',
    );
  }

  function cellsForTool(
    tool: DessinTool,
    from: { col: number; row: number },
    to: { col: number; row: number },
    shift: boolean,
    W: number,
  ): Array<[number, number]> {
    if (tool === 'crayon' || tool === 'gomme') {
      return brushCells(to.col, to.row, state.thickness);
    }
    if (tool === 'trait') {
      return lineCells(from.col, from.row, to.col, to.row, W, state.thickness, shift);
    }
    if (tool === 'rectangle') {
      return rectCells(from.col, from.row, to.col, to.row, W, state.rectFilled);
    }
    return [];
  }

  function showOutZone(kind: 'talon' | 'pointe' | 'bord-cote' | null): void {
    if (!kind) {
      bubble.hidden = true;
      bubble.textContent = '';
      return;
    }
    bubble.hidden = false;
    if (kind === 'talon') {
      bubble.textContent = 'Le talon est tricoté d’une seule couleur : on ne peut pas y dessiner.';
    } else if (kind === 'pointe') {
      bubble.textContent = 'La pointe est tricotée d’une seule couleur : on ne peut pas y dessiner.';
    } else {
      bubble.textContent = 'Le bord-côte est tricoté d’une seule couleur : on ne peut pas y dessiner.';
    }
  }

  function canvasEl(): HTMLCanvasElement | null {
    const el = document.querySelector('[data-testid="flat-canvas"]');
    return el instanceof HTMLCanvasElement ? el : null;
  }

  function pointerToStitch(event: PointerEvent): { col: number; row: number } | null {
    const canvas = canvasEl();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const st = flat.clientToMotifStitch(event.clientX - rect.left, event.clientY - rect.top);
    if (!st) return null;
    const design = deps.getDesign();
    const W = design.dimensions.needles;
    const useSnap =
      state.snap && (state.tool === 'trait' || state.tool === 'crayon' || state.tool === 'gomme');
    return { col: snapCol(st.col, W, useSnap), row: st.row };
  }

  function onPointerDown(event: PointerEvent): void {
    const dessin = selectedDessin();
    if (!dessin || root.hidden) return;
    const canvas = canvasEl();
    if (!canvas) return;
    if (event.target !== canvas) return;

    if (spacePan || state.tool === 'main' || event.button === 1 || event.button === 2) {
      panning = true;
      lastPan = { x: event.clientX, y: event.clientY };
      flat.setPanMode(true);
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;

    const st = pointerToStitch(event);
    if (!st) {
      showOutZone('talon');
      canvas.style.cursor = 'not-allowed';
      return;
    }
    showOutZone(null);

    const design = deps.getDesign();
    const W = design.dimensions.needles;

    if (event.altKey || state.tool === 'pipette') {
      const rgb = deps.getStackRgb();
      if (rgb) {
        const i = (st.row * W + st.col) * 3;
        const hex = `#${[rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')}` as Hex;
        state = { ...state, color: hex };
        saveState(state);
        syncUi();
        deps.onColorChange?.(hex);
      }
      return;
    }

    if (state.tool === 'pot') {
      const g = stackGauge(design.dimensions, design.zones);
      let keys: ArrayLike<number>;
      if (state.potFromVisible) {
        const rgb = deps.getStackRgb();
        if (!rgb) return;
        keys = rgbKeys(rgb);
      } else {
        keys = dessinCellsForGauge(dessin, g.needles, g.rows);
      }
      const area = floodCells(keys, g.needles, g.rows, st.col, st.row);
      deps.commitDessin(dessin.id, applyCells(dessin, area, false));
      return;
    }

    const cells = cellsForTool(state.tool, st, st, event.shiftKey, W);
    stroke = { id: dessin.id, base: dessin, start: st, cells, last3d: 0 };
    previewFrom(applyCells(dessin, cells, state.tool === 'gomme'), cells);
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event: PointerEvent): void {
    if (panning) {
      flat.panBy(event.clientX - lastPan.x, event.clientY - lastPan.y);
      lastPan = { x: event.clientX, y: event.clientY };
      return;
    }
    const dessin = selectedDessin();
    if (!dessin || root.hidden) return;
    const canvas = canvasEl();
    if (!canvas) return;

    const st = pointerToStitch(event);
    if (!st) {
      canvas.style.cursor = 'not-allowed';
      if (!stroke) flat.setDessinPreview(null);
      return;
    }
    canvas.style.cursor = spacePan || state.tool === 'main' ? 'grab' : '';
    showOutZone(null);

    const design = deps.getDesign();
    const W = design.dimensions.needles;

    if (!stroke) {
      const hover =
        state.tool === 'trait' || state.tool === 'rectangle'
          ? brushCells(st.col, st.row, state.thickness)
          : cellsForTool(state.tool, st, st, event.shiftKey, W);
      flat.setDessinPreview(
        withMirror(hover, state.symmetry, W),
        state.tool === 'gomme',
      );
      return;
    }

    if (state.tool === 'crayon' || state.tool === 'gomme') {
      const add = brushCells(st.col, st.row, state.thickness);
      const seen = new Set(stroke.cells.map(([x, y]) => `${x},${y}`));
      for (const c of add) {
        const k = `${c[0]},${c[1]}`;
        if (!seen.has(k)) {
          seen.add(k);
          stroke.cells.push(c);
        }
      }
    } else {
      stroke.cells = cellsForTool(state.tool, stroke.start, st, event.shiftKey, W);
    }

    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!stroke) return;
      const working = applyCells(stroke.base, stroke.cells, state.tool === 'gomme');
      const now = performance.now();
      if (now - stroke.last3d > 125) stroke.last3d = now;
      previewFrom(working, stroke.cells);
    });
  }

  function onPointerUp(event: PointerEvent): void {
    if (panning) {
      panning = false;
      flat.setPanMode(false);
      return;
    }
    if (!stroke) return;
    const working = applyCells(stroke.base, stroke.cells, state.tool === 'gomme');
    deps.commitDessin(stroke.id, working);
    deps.endPreview();
    flat.setDessinPreview(null);
    stroke = null;
    const canvas = canvasEl();
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (root.hidden) return;
    const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const view2d = document.getElementById('view2d');
    const active = document.activeElement;
    const inView =
      (active instanceof Node && (root.contains(active) || view2d?.contains(active))) ||
      active === document.body ||
      active === document.documentElement;
    if (!inView) return;

    if (event.code === 'Space') {
      spacePan = true;
      flat.setPanMode(true);
      event.preventDefault();
      return;
    }
    const map: Record<string, DessinTool> = {
      KeyB: 'crayon',
      KeyE: 'gomme',
      KeyL: 'trait',
      KeyR: 'rectangle',
      KeyG: 'pot',
      KeyI: 'pipette',
    };
    const tool = map[event.code];
    if (tool) {
      state = { ...state, tool };
      saveState(state);
      syncUi();
      event.preventDefault();
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      spacePan = false;
      flat.setPanMode(false);
    }
  }

  // Capture pour passer avant les poignées quand un outil de dessin est actif.
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  colorBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = state.color;
    input.addEventListener('change', () => {
      state = { ...state, color: input.value.toLowerCase() as Hex };
      saveState(state);
      syncUi();
      deps.onColorChange?.(state.color);
    });
    input.click();
  });

  syncUi();

  return {
    root,
    sync: syncUi,
    getState: () => state,
    setColor(color: Hex) {
      state = { ...state, color: color.toLowerCase() as Hex };
      saveState(state);
      syncUi();
    },
    isDrawingActive: () =>
      !root.hidden &&
      state.tool !== 'main' &&
      state.tool !== 'pipette' &&
      Boolean(selectedDessin()),
    dispose() {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      root.remove();
      bubble.remove();
    },
  };
}
