import type { StitchGrid } from '../core/types';
import { Zone } from '../core/types';
import { seamColumn } from '../core/calepinage';
import { getState } from '../state';

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
}

export function mountFlatView(viewport: HTMLElement, onReturnTo3d: () => void): FlatHandle {
  const gl = viewport.querySelector('canvas');
  if (gl instanceof HTMLCanvasElement) gl.dataset.testid = 'sock-canvas';

  const layer = document.createElement('div');
  layer.className = 'flat-layer';
  layer.hidden = true;

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
  const button3d = document.createElement('button');
  button3d.type = 'button';
  button3d.dataset.testid = 'view-3d';
  button3d.textContent = '3D';
  button3d.setAttribute('aria-pressed', 'true');
  const buttonFlat = document.createElement('button');
  buttonFlat.type = 'button';
  buttonFlat.dataset.testid = 'view-flat';
  buttonFlat.textContent = 'À plat';
  buttonFlat.setAttribute('aria-pressed', 'false');
  switcher.append(button3d, buttonFlat);
  const shortcuts = document.createElement('p');
  shortcuts.className = 'view-shortcuts';
  shortcuts.dataset.testid = 'view-shortcuts';
  shortcuts.textContent = 'R : réinitialiser · F : face · T : ¾ · E : extérieur · D : dos · I : intérieur';
  viewport.append(layer, switcher, shortcuts);

  let grid: StitchGrid | null = null;
  let floatMask: Uint8Array | null = null;
  let aspect = 0.75;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

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
    if (!context || !grid) return;
    if (layer.hidden) return;
    resizeCanvasOnly();
    const { w, h } = cells();
    const originX = MARGIN_LEFT + panX;
    const originY = MARGIN_TOP + panY;
    context.fillStyle = '#f4f1ec';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const byColor = new Map<string, number[]>();
    for (let index = 0; index < grid.colorIndex.length; index++) {
      const color = grid.palette[grid.colorIndex[index] ?? 0] ?? '#000000';
      const bucket = byColor.get(color);
      if (bucket) bucket.push(index);
      else byColor.set(color, [index]);
    }
    for (const [color, indices] of byColor) {
      context.fillStyle = color;
      context.beginPath();
      for (const index of indices) {
        const col = index % grid.width;
        const row = Math.floor(index / grid.width);
        context.rect(originX + col * w, originY + row * h, w, h);
      }
      context.fill();
    }

    if (floatMask && floatMask.length === grid.colorIndex.length) {
      context.fillStyle = '#d9822b';
      for (let index = 0; index < floatMask.length; index++) {
        if (floatMask[index] !== 1) continue;
        const col = index % grid.width;
        const row = Math.floor(index / grid.width);
        context.fillRect(originX + col * w, originY + row * h, 1, 1);
      }
    }

    if (w >= GRID_MIN_PX) {
      context.strokeStyle = 'rgba(29, 29, 27, 0.28)';
      context.lineWidth = 1;
      context.beginPath();
      for (let col = 0; col <= grid.width; col++) {
        const x = originX + col * w + 0.5;
        context.moveTo(x, originY);
        context.lineTo(x, originY + grid.height * h);
      }
      for (let row = 0; row <= grid.height; row++) {
        const y = originY + row * h + 0.5;
        context.moveTo(originX, y);
        context.lineTo(originX + grid.width * w, y);
      }
      context.stroke();
    }

    context.fillStyle = '#6b6760';
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let col = 0; col < grid.width; col += 10) {
      const x = originX + col * w + w / 2;
      if (x < MARGIN_LEFT || x > canvas.width - 4) continue;
      context.fillText(String(col), x, 11);
    }
    context.textAlign = 'right';
    for (let row = 0; row < grid.height; row += 10) {
      const y = originY + row * h + h / 2;
      if (y < MARGIN_TOP || y > canvas.height - 4) continue;
      context.fillText(String(row), MARGIN_LEFT - 8, y);
    }

    // Trait du raccord (colonne où le tour se referme)
    const col = Math.round(seamColumn(getState().design.layout.seam, grid.width));
    const sx = originX + col * w + 0.5;
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = '#b5462f';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(sx, originY);
    context.lineTo(sx, originY + grid.height * h);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = '#b5462f';
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText('raccord', sx + 4, originY + 4);
    context.restore();

    drawZones(originY, h);
  }

  function resizeCanvasOnly(): void {
    const width = Math.max(1, layer.clientWidth);
    const height = Math.max(1, layer.clientHeight);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
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

  function setMode(flat: boolean): void {
    layer.hidden = !flat;
    buttonFlat.setAttribute('aria-pressed', flat ? 'true' : 'false');
    button3d.setAttribute('aria-pressed', flat ? 'false' : 'true');
    if (gl instanceof HTMLCanvasElement) gl.style.display = flat ? 'none' : 'block';
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
      switcher.hidden = !visible;
      shortcuts.hidden = !visible;
      if (!visible) setMode(false);
    },
  };
}
