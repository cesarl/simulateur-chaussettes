import type { SockDimensions, StitchGrid, ZoneSettings } from '../core/types';
import { Zone } from '../core/types';
import { seamColumn } from '../core/calepinage';
import { rowRanges } from '../core/grid';
import { gridYToMotifY, motifYToGridY } from '../core/layers';
import { editingLayoutSettings, getState } from '../state';

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
  /** Centre écran d'une maille en coordonnées motif (rang 0 = haut de la tige). */
  clientAtMotifStitch: (col: number, motifRow: number) => { x: number; y: number } | null;
  /** Souris → maille motif, ou null hors zone motif. */
  clientToMotifStitch: (px: number, py: number) => { col: number; row: number } | null;
  redraw: () => void;
  /** Redessine seulement les poignées (canvas overlay), sans recalculer la grille. */
  redrawOverlay: () => void;
  /** Contexte 2D du canvas des poignées. */
  getOverlayContext: () => CanvasRenderingContext2D | null;
  /**
   * Aperçu rapide pendant un glisser (T62) : peint le RVB motif (3 octets/maille)
   * sur la zone motif, en gardant bord-côte / talon / pointe de la grille courante.
   */
  paintMotifRgbPreview: (rgb: Uint8ClampedArray, needles: number, motifRows: number) => void;
  panBy: (dx: number, dy: number) => void;
  setPanMode: (active: boolean) => void;
  setOverlayDrawer: (draw: (() => void) | null) => void;
  /** Décale la vue 2D pour centrer une maille motif. */
  revealMotifStitch: (col: number, motifRow: number) => void;
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
  /** Barre d’outils de la vue 3D : raccourcis caméra. */
  shortcutsHost?: HTMLElement | null;
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

  const overlay = document.createElement('canvas');
  overlay.dataset.testid = 'flat-overlay';
  overlay.className = 'flat-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  const hover = document.createElement('p');
  hover.className = 'flat-hover';
  hover.dataset.testid = 'flat-hover';
  hover.textContent = 'Survolez une maille.';
  layer.append(canvas, overlay, hover);

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
  toolsTarget.append(switcher);
  placeShortcuts(hosts.shortcutsHost, toolsTarget);

  let grid: StitchGrid | null = null;
  let floatMask: Uint8Array | null = null;
  let aspect = 0.75;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let panMode = false;
  let toolsVisible = true;
  let overlayDrawer: (() => void) | null = null;
  let dims: SockDimensions = getState().design.dimensions;
  let zones: ZoneSettings = getState().design.zones;
  /** Bitmap 1 px = 1 maille (recyclé). */
  let stitchBitmap: ImageData | null = null;
  let stitchCanvas: HTMLCanvasElement | null = null;

  const context = canvas.getContext('2d');
  const overlayCtx = overlay.getContext('2d');

  function cells(): { w: number; h: number } {
    const w = 4 * zoom;
    const ar = aspect > 0 && Number.isFinite(aspect) ? aspect : 0.75;
    const h = Math.max(1, Math.round(4 * ar)) * zoom;
    return { w, h };
  }

  function parseHex(hex: string): [number, number, number] {
    const h = hex.startsWith('#') ? hex.slice(1) : hex;
    if (h.length !== 6) return [204, 204, 204];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function ensureStitchBitmap(): ImageData | null {
    if (!grid) return null;
    if (!stitchBitmap || stitchBitmap.width !== grid.width || stitchBitmap.height !== grid.height) {
      stitchBitmap = new ImageData(grid.width, grid.height);
      stitchCanvas = document.createElement('canvas');
      stitchCanvas.width = grid.width;
      stitchCanvas.height = grid.height;
    }
    const data = stitchBitmap.data;
    for (let i = 0; i < grid.colorIndex.length; i++) {
      let [r, g, b] = parseHex(grid.palette[grid.colorIndex[i] ?? 0] ?? '#cccccc');
      if (floatMask && floatMask[i]) {
        r = Math.round(r * 0.65);
        g = Math.round(g * 0.65);
        b = Math.round(b * 0.65);
      }
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
    const sc = stitchCanvas!.getContext('2d');
    if (sc) sc.putImageData(stitchBitmap, 0, 0);
    return stitchBitmap;
  }

  /** Point écran pour une maille / coordonnée continue (rang de grille, éventuellement fractionnaire). */
  function pointAt(col: number, row: number): { x: number; y: number } | null {
    if (!grid || layer.hidden || canvas.width < 2 || canvas.height < 2) return null;
    if (col < -1 || row < -1 || col > grid.width || row > grid.height) return null;
    const { w, h } = cells();
    const x = Math.floor(MARGIN_LEFT + panX + col * w + w / 2);
    const y = Math.floor(MARGIN_TOP + panY + row * h + h / 2);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x, y };
  }

  function resize(): void {
    const width = Math.max(1, layer.clientWidth);
    const height = Math.max(1, layer.clientHeight);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width;
      overlay.height = height;
    }
    draw();
  }

  function drawOverlayOnly(): void {
    if (!overlayCtx || layer.hidden) return;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (!grid) return;
    overlayDrawer?.();
  }

  function draw(): void {
    if (!context || layer.hidden) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f4f1ec';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!grid) {
      drawOverlayOnly();
      return;
    }

    const { w, h } = cells();
    const showGrid = w >= GRID_MIN_PX;
    const originX = MARGIN_LEFT + panX;
    const originY = MARGIN_TOP + panY;

    ensureStitchBitmap();
    if (stitchCanvas) {
      context.imageSmoothingEnabled = false;
      context.drawImage(
        stitchCanvas,
        0,
        0,
        grid.width,
        grid.height,
        originX,
        originY,
        grid.width * w,
        grid.height * h,
      );
    }

    if (showGrid) {
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      context.beginPath();
      const x0 = Math.max(0, Math.floor(-originX / w));
      const x1 = Math.min(grid.width, Math.ceil((canvas.width - originX) / w) + 1);
      const y0 = Math.max(0, Math.floor(-originY / h));
      const y1 = Math.min(grid.height, Math.ceil((canvas.height - originY) / h) + 1);
      for (let col = x0; col <= x1; col++) {
        const x = originX + col * w + 0.5;
        context.moveTo(x, originY + y0 * h);
        context.lineTo(x, originY + y1 * h);
      }
      for (let row = y0; row <= y1; row++) {
        const y = originY + row * h + 0.5;
        context.moveTo(originX + x0 * w, y);
        context.lineTo(originX + x1 * w, y);
      }
      context.stroke();
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
    drawOverlayOnly();
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
    return pointAt(col, row);
  }

  function clientAtMotifStitch(col: number, motifRow: number): { x: number; y: number } | null {
    return pointAt(col, motifYToGridY(dims, zones, motifRow));
  }

  function clientToMotifStitch(px: number, py: number): { col: number; row: number } | null {
    if (!grid) return null;
    const { w, h } = cells();
    const col = Math.floor((px - MARGIN_LEFT - panX) / w);
    const gridY = (py - MARGIN_TOP - panY) / h;
    if (col < 0 || col >= grid.width || gridY < 0 || gridY >= grid.height) return null;
    const ranges = rowRanges(dims, zones);
    if (gridY < ranges.leg.start) return null;
    if (gridY >= ranges.toe.start) return null;
    if (!zones.patternOnFoot && gridY >= ranges.foot.start) return null;
    const inLeg = gridY >= ranges.leg.start && gridY < ranges.leg.end;
    const inHeel = gridY >= ranges.leg.end && gridY < ranges.foot.start;
    const inFoot = zones.patternOnFoot && gridY >= ranges.foot.start && gridY < ranges.foot.end;
    if (!inLeg && !inHeel && !inFoot) return null;
    const motifY = gridYToMotifY(dims, zones, gridY);
    return { col, row: Math.floor(motifY) };
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

  function placeShortcuts(host: HTMLElement | null | undefined, fallback: HTMLElement): void {
    const target = host ?? fallback;
    if (shortcuts.parentElement !== target) target.append(shortcuts);
  }

  function applyToolsVisibility(): void {
    // En double panneau : pas de bascule 3D/plat (les deux sont visibles).
    // Les raccourcis caméra restent dans la barre d’outils 3D.
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

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    showHover(event.clientX - rect.left, event.clientY - rect.top);
  });
  canvas.addEventListener('pointerleave', () => {
    hover.textContent = 'Survolez une maille.';
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
      aspect = nextAspect > 0 && Number.isFinite(nextAspect) ? nextAspect : aspect > 0 ? aspect : 0.75;
      const state = getState();
      dims = state.design.dimensions;
      zones = state.design.zones;
      draw();
    },
    setFloatMask(mask: Uint8Array | null) {
      floatMask = mask;
      draw();
    },
    centerOf,
    clientAtMotifStitch,
    clientToMotifStitch,
    redraw: draw,
    redrawOverlay: drawOverlayOnly,
    getOverlayContext: () => overlayCtx,
    paintMotifRgbPreview(rgb: Uint8ClampedArray, needles: number, motifRowCount: number) {
      if (!grid || !context || layer.hidden) return;
      ensureStitchBitmap();
      if (!stitchBitmap || !stitchCanvas) return;
      const data = stitchBitmap.data;
      const ranges = rowRanges(dims, zones);
      let motifI = 0;
      for (let row = 0; row < grid.height; row++) {
        const inLeg = row >= ranges.leg.start && row < ranges.leg.end;
        const inFoot = zones.patternOnFoot && row >= ranges.foot.start && row < ranges.foot.end;
        if (!inLeg && !inFoot) continue;
        for (let col = 0; col < needles && col < grid.width; col++) {
          if (motifI >= motifRowCount * needles) break;
          const src = motifI * 3;
          const dst = (row * grid.width + col) * 4;
          data[dst] = rgb[src] ?? 0;
          data[dst + 1] = rgb[src + 1] ?? 0;
          data[dst + 2] = rgb[src + 2] ?? 0;
          data[dst + 3] = 255;
          motifI += 1;
        }
      }
      const sc = stitchCanvas.getContext('2d');
      if (sc) sc.putImageData(stitchBitmap, 0, 0);
      const { w, h } = cells();
      const originX = MARGIN_LEFT + panX;
      const originY = MARGIN_TOP + panY;
      context.imageSmoothingEnabled = false;
      // Repaint only the stitch area over existing background/zones labels: full clear cheap path
      context.fillStyle = '#f4f1ec';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        stitchCanvas,
        0,
        0,
        grid.width,
        grid.height,
        originX,
        originY,
        grid.width * w,
        grid.height * h,
      );
      drawZones(originY, h);
      drawOverlayOnly();
    },
    panBy(dx: number, dy: number) {
      panX += dx;
      panY += dy;
      draw();
    },
    setPanMode(active: boolean) {
      panMode = active;
      canvas.style.cursor = active || panMode ? 'grabbing' : '';
    },
    setOverlayDrawer(fn: (() => void) | null) {
      overlayDrawer = fn;
      draw();
    },
    revealMotifStitch(col: number, motifRow: number) {
      if (!grid) return;
      const { w, h } = cells();
      const fullRow = motifYToGridY(dims, zones, motifRow);
      const targetX = MARGIN_LEFT + col * w + w / 2;
      const targetY = MARGIN_TOP + fullRow * h + h / 2;
      panX = canvas.width / 2 - targetX;
      panY = canvas.height / 2 - targetY;
      draw();
    },
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
      if (switcher.parentElement !== tools) tools.append(switcher);
      placeShortcuts(next.shortcutsHost, tools);
      applyToolsVisibility();
      if (dualPane) {
        setMode(true);
      } else {
        setMode(false);
      }
    },
  };
}
