import type { StitchGrid } from '../core/types';
import { Zone } from '../core/types';
import { seamColumn } from '../core/calepinage';
import { editingLayoutSettings } from '../state';

/**
 * Vue à plat : une maille = un rectangle au rapport réel.
 * Le zoom est un entier (1 = 4 px de large). Le quadrillage n'apparaît
 * qu'à partir de 12 px de large, pour laisser le centre de la maille lisible.
 */

const MARGIN_LEFT = 96;
const MARGIN_TOP = 22;
const GRID_MIN_PX = 12;

const ZONE_LABEL: Record<number, string> = {
  [Zone.Cuff]: 'Bord-côte',
  [Zone.Leg]: 'Tige',
  [Zone.Heel]: 'Talon',
  [Zone.Foot]: 'Pied',
  [Zone.Toe]: 'Pointe',
  [Zone.Empty]: 'Hors tricot',
};

export interface FlatHandle {
  setGrid: (grid: StitchGrid, aspect: number) => void;
  setFloatMask: (mask: Uint8Array | null) => void;
  centerOf: (col: number, row: number) => { x: number; y: number } | null;
  setDevTools: (visible: boolean) => void;
  /** Affiche la vue à plat (true) ou la 3D (false). En double panneau, no-op (toujours visible). */
  setFlat: (flat: boolean) => void;
  isFlat: () => boolean;
  /** Reparentage visionneuse ↔ mode technique. */
  setHosts: (hosts: FlatHosts) => void;
}

export interface FlatHosts {
  /** Conteneur du canvas à plat. */
  canvasHost: HTMLElement;
  /** Conteneur des boutons 3D / À plat (optionnel). */
  toolsHost?: HTMLElement | null;
  /** Canvas WebGL 3D à masquer en mode plat (visionneuse). */
  sockCanvas?: HTMLCanvasElement | null;
  /** true = 2D et 3D côte à côte (mode ?dev) : pas de bascule. */
  dualPane?: boolean;
}

export function mountFlatView(hosts: FlatHosts, onReturnTo3d: () => void): FlatHandle {
  let sockCanvas = hosts.sockCanvas ?? null;
  let dualPane = hosts.dualPane === true;

  const layer = document.createElement('div');
  layer.className = 'flat-layer';
  layer.hidden = !dualPane;

  const canvas = document.createElement('canvas');
  canvas.dataset.testid = 'flat-canvas';
  canvas.setAttribute('aria-label', 'Grille de mailles à plat');

  const hover = document.createElement('p');
  hover.className = 'flat-hover';
  hover.dataset.testid = 'flat-hover';
  hover.textContent = 'Survolez une maille.';
  layer.append(canvas, hover);

  const switcher = document.createElement('div');
  switcher.className = 'view-switch';
  switcher.dataset.testid = 'view-switch';
  const button3d = document.createElement('button');
  button3d.type = 'button';
  button3d.dataset.testid = 'view-3d';
  button3d.textContent = '3D';
  button3d.setAttribute('aria-pressed', dualPane ? 'false' : 'true');
  const buttonFlat = document.createElement('button');
  buttonFlat.type = 'button';
  buttonFlat.dataset.testid = 'view-flat';
  buttonFlat.textContent = 'À plat';
  buttonFlat.setAttribute('aria-pressed', dualPane ? 'true' : 'false');
  switcher.append(button3d, buttonFlat);
  const shortcuts = document.createElement('p');
  shortcuts.className = 'view-shortcuts';
  shortcuts.dataset.testid = 'view-shortcuts';
  shortcuts.textContent = 'R : réinitialiser · F : face · T : ¾ · E : extérieur · D : dos · I : intérieur';

  hosts.canvasHost.append(layer);
  const toolsTarget = hosts.toolsHost ?? hosts.canvasHost;
  toolsTarget.append(switcher, shortcuts);

  let grid: StitchGrid | null = null;
  let floatMask: Uint8Array | null = null;
  let aspect = 0.75;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let toolsVisible = true;

  const context = canvas.getContext('2d');

  function cells(): { w: number; h: number } {
    const w = 4 * zoom;
    const h = Math.max(1, Math.round(4 * aspect)) * zoom;
    return { w, h };
  }

  function resize(): void {
    const width = Math.max(1, layer.clientWidth);
    const height = Math.max(1, layer.clientHeight);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    draw();
  }

  function draw(): void {
    if (!context || layer.hidden) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f4f1ec';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!grid) return;

    const { w, h } = cells();
    const showGrid = w >= GRID_MIN_PX;
    const originX = MARGIN_LEFT + panX;
    const originY = MARGIN_TOP + panY;

    for (let row = 0; row < grid.height; row += 1) {
      for (let col = 0; col < grid.width; col += 1) {
        const index = row * grid.width + col;
        const color = grid.palette[grid.colorIndex[index] ?? 0] ?? '#cccccc';
        const x = originX + col * w;
        const y = originY + row * h;
        if (x + w < 0 || y + h < 0 || x > canvas.width || y > canvas.height) continue;
        context.fillStyle = color;
        context.fillRect(x, y, w, h);
        if (floatMask && floatMask[index]) {
          context.fillStyle = 'rgba(0,0,0,0.35)';
          context.fillRect(x, y, w, h);
        }
        if (showGrid) {
          context.strokeStyle = 'rgba(0,0,0,0.12)';
          context.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
      }
    }

    const seam = seamColumn(editingLayoutSettings().seam, grid.width);
    if (grid.width > 0) {
      const sx = originX + seam * w;
      context.strokeStyle = 'rgba(181,70,47,0.7)';
      context.beginPath();
      context.moveTo(sx, originY);
      context.lineTo(sx, originY + grid.height * h);
      context.stroke();
    }

    drawZones(originY, h);
  }

  function drawZones(originY: number, cellH: number): void {
    if (!context || !grid) return;
    context.textAlign = 'left';
    context.font = '11px system-ui, sans-serif';
    let row = 0;
    while (row < grid.height) {
      const zone = grid.zone[row * grid.width] ?? Zone.Empty;
      let end = row + 1;
      while (end < grid.height && (grid.zone[end * grid.width] ?? Zone.Empty) === zone) end += 1;
      const top = originY + row * cellH;
      const bottom = originY + end * cellH;
      const mid = (top + bottom) / 2;
      if (bottom > MARGIN_TOP && top < canvas.height) {
        const color = grid.palette[grid.colorIndex[row * grid.width] ?? 0] ?? '#000000';
        context.fillStyle = color;
        context.fillRect(8, Math.max(MARGIN_TOP, top), 6, Math.max(4, Math.min(bottom, canvas.height) - Math.max(MARGIN_TOP, top)));
        if (bottom - top >= 14 && mid > 8 && mid < canvas.height - 8) {
          context.fillStyle = '#1d1d1b';
          context.fillText(ZONE_LABEL[zone] ?? 'Zone', 18, mid);
        }
      }
      row = end;
    }
  }

  function centerOf(col: number, row: number): { x: number; y: number } | null {
    if (!grid || layer.hidden || canvas.width < 2 || canvas.height < 2) return null;
    if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
    const { w, h } = cells();
    const x = Math.floor(MARGIN_LEFT + panX + col * w + w / 2);
    const y = Math.floor(MARGIN_TOP + panY + row * h + h / 2);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x, y };
  }

  function stitchAt(px: number, py: number): { col: number; row: number } | null {
    if (!grid) return null;
    const { w, h } = cells();
    const col = Math.floor((px - MARGIN_LEFT - panX) / w);
    const row = Math.floor((py - MARGIN_TOP - panY) / h);
    if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
    return { col, row };
  }

  function showHover(px: number, py: number): void {
    const hit = stitchAt(px, py);
    if (!hit || !grid) {
      hover.textContent = 'Survolez une maille.';
      return;
    }
    const index = hit.row * grid.width + hit.col;
    const zone = grid.zone[index] ?? Zone.Empty;
    const color = grid.palette[grid.colorIndex[index] ?? 0] ?? '#000000';
    hover.textContent = `Maille ${hit.col} · rang ${hit.row} · ${ZONE_LABEL[zone] ?? 'Zone'} · ${color}`;
  }

  function applyToolsVisibility(): void {
    // En double panneau : pas de bascule 3D/plat (les deux sont visibles).
    // Les raccourcis caméra restent visibles dans la barre d’outils.
    switcher.hidden = dualPane || !toolsVisible;
    shortcuts.hidden = !toolsVisible;
  }

  function setMode(flat: boolean): void {
    if (dualPane) {
      layer.hidden = false;
      if (sockCanvas) sockCanvas.style.display = 'block';
      buttonFlat.setAttribute('aria-pressed', 'true');
      button3d.setAttribute('aria-pressed', 'false');
      resize();
      return;
    }
    layer.hidden = !flat;
    buttonFlat.setAttribute('aria-pressed', flat ? 'true' : 'false');
    button3d.setAttribute('aria-pressed', flat ? 'false' : 'true');
    if (sockCanvas) sockCanvas.style.display = flat ? 'none' : 'block';
    if (flat) {
      resize();
    } else {
      onReturnTo3d();
    }
  }

  button3d.addEventListener('click', () => setMode(false));
  buttonFlat.addEventListener('click', () => setMode(true));

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const next = event.deltaY < 0 ? zoom + 1 : zoom - 1;
    zoom = Math.min(8, Math.max(1, next));
    draw();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (dragging) {
      panX += event.clientX - lastX;
      panY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      draw();
    }
    const rect = canvas.getBoundingClientRect();
    showHover(event.clientX - rect.left, event.clientY - rect.top);
  });
  canvas.addEventListener('pointerleave', () => {
    if (!dragging) hover.textContent = 'Survolez une maille.';
  });

  const observer = new ResizeObserver(() => {
    if (!layer.hidden) resize();
  });
  observer.observe(layer);

  applyToolsVisibility();
  if (dualPane) setMode(true);

  return {
    setGrid(next, nextAspect) {
      grid = next;
      aspect = nextAspect > 0 ? nextAspect : 0.75;
      draw();
    },
    setFloatMask(mask: Uint8Array | null) {
      floatMask = mask;
      draw();
    },
    centerOf,
    setDevTools(visible: boolean) {
      toolsVisible = visible;
      applyToolsVisibility();
    },
    setFlat(flat: boolean) {
      setMode(flat);
    },
    isFlat() {
      return !layer.hidden;
    },
    setHosts(next: FlatHosts) {
      sockCanvas = next.sockCanvas ?? null;
      dualPane = next.dualPane === true;
      if (layer.parentElement !== next.canvasHost) {
        next.canvasHost.append(layer);
      }
      const tools = next.toolsHost ?? next.canvasHost;
      if (switcher.parentElement !== tools) {
        tools.append(switcher, shortcuts);
      }
      applyToolsVisibility();
      if (dualPane) {
        setMode(true);
      } else {
        setMode(false);
      }
    },
  };
}
