/**
 * Poignées et sélection sur la vue 2D (T56) : s'appuie sur les API de `layers.ts`.
 */
import { assetKey } from '../core/composition';
import type { RasterImage } from '../core/composition';
import {
  dragImage,
  dragMotif,
  imageGizmo,
  layerAtStitch,
  motifGizmo,
  scaleMotif,
  setMotifBand,
  stackGauge,
  type ImageHandle,
  type ImageLayer,
  type MotifLayer,
  type SockDesignV2,
  type StackLayer,
} from '../core/layers';
import type { FlatHandle } from './flatView';

const HANDLE_PX = 10;

export interface FlatGizmoDeps {
  getDesign: () => SockDesignV2;
  getSelectedId: () => string | null;
  getStackOwner: () => Int16Array | null;
  getImages: () => Map<string, RasterImage>;
  selectLayer: (id: string | null) => void;
  patchImage: (id: string, patch: Partial<ImageLayer>, coalesce: boolean) => void;
  patchMotif: (id: string, patch: Partial<MotifLayer>, coalesce: boolean) => void;
  setMotifBounds: (id: string, bounds: ReturnType<typeof setMotifBand>, coalesce: boolean) => void;
}

type ActiveDrag =
  | {
      kind: 'image';
      id: string;
      handle: ImageHandle;
      start: ImageLayer;
      from: [number, number];
    }
  | {
      kind: 'motif-move';
      id: string;
      start: MotifLayer;
      from: [number, number];
    }
  | {
      kind: 'motif-scale';
      id: string;
      start: MotifLayer;
      startFactor: number;
      origin: [number, number];
    }
  | {
      kind: 'motif-band';
      id: string;
      edge: 'haut' | 'bas';
      band: { from: number; to: number };
    };

function imageSize(
  layer: ImageLayer,
  images: Map<string, RasterImage>,
): { width: number; height: number } {
  const img = images.get(assetKey(layer.asset));
  return img ?? { width: 1, height: 1 };
}

function layerById(layers: readonly StackLayer[], id: string): StackLayer | undefined {
  return layers.find((l) => l.id === id);
}

function canEdit(layer: StackLayer | undefined): layer is MotifLayer | ImageLayer {
  if (!layer || layer.kind === 'fond') return false;
  if (layer.locked) return false;
  return true;
}

export function mountFlatGizmos(flat: FlatHandle, canvas: HTMLCanvasElement, deps: FlatGizmoDeps): () => void {
  let active: ActiveDrag | null = null;
  let panning = false;
  let lastPan = { x: 0, y: 0 };
  let spaceDown = false;
  let recomputeTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleHeavy = (): void => {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => {
      recomputeTimer = undefined;
    }, 100);
  };

  flat.setOverlayDrawer(() => {
    const design = deps.getDesign();
    const selectedId = deps.getSelectedId();
    if (!selectedId) return;
    const layer = layerById(design.layers, selectedId);
    if (!canEdit(layer)) return;
    const g = stackGauge(design.dimensions, design.zones);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (layer.kind === 'image') {
      const gz = imageGizmo(layer, imageSize(layer, deps.getImages()), g);
      const pts = gz.corners.map(([col, row]) =>
        flat.clientAtMotifStitch(col, row),
      ).filter((p): p is { x: number; y: number } => p !== null);
      if (pts.length < 4) return;
      ctx.save();
      ctx.strokeStyle = '#b5462f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
      for (const p of pts) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#b5462f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const rot = flat.clientAtMotifStitch(gz.rotate[0], gz.rotate[1]);
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      if (rot) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(rot.x, rot.y);
        ctx.strokeStyle = '#b5462f';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rot.x, rot.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#b5462f';
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    const gz = motifGizmo(layer, g);
    const tile = gz.tile;
    const corners: Array<[number, number]> = [
      [tile.x, tile.y],
      [tile.x + tile.w, tile.y],
      [tile.x + tile.w, tile.y + tile.h],
      [tile.x, tile.y + tile.h],
    ];
    const tpts = corners
      .map(([col, row]) => flat.clientAtMotifStitch(col, row))
      .filter((p): p is { x: number; y: number } => p !== null);
    if (tpts.length >= 4) {
      ctx.save();
      ctx.strokeStyle = '#1f3a5f';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      tpts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      const br = tpts[2]!;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1f3a5f';
      ctx.beginPath();
      ctx.arc(br.x, br.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (layer.bounds.kind === 'bande') {
      const band = gz.band;
      for (const row of [band.from, band.to - 0.01]) {
        const left = flat.clientAtMotifStitch(Math.round(g.needles / 4), row);
        const right = flat.clientAtMotifStitch(Math.round((3 * g.needles) / 4), row);
        if (!left || !right) continue;
        ctx.save();
        ctx.strokeStyle = '#b5462f';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#b5462f';
        ctx.beginPath();
        ctx.arc(left.x, left.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  });

  function hitImageHandle(
    layer: ImageLayer,
    clientX: number,
    clientY: number,
  ): ImageHandle | 'none' {
    const design = deps.getDesign();
    const g = stackGauge(design.dimensions, design.zones);
    const gz = imageGizmo(layer, imageSize(layer, deps.getImages()), g);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const rot = flat.clientAtMotifStitch(gz.rotate[0], gz.rotate[1]);
    if (rot && Math.hypot(mx - rot.x, my - rot.y) <= HANDLE_PX) return 'tourner';
    for (const [col, row] of gz.corners) {
      const p = flat.clientAtMotifStitch(col, row);
      if (p && Math.hypot(mx - p.x, my - p.y) <= HANDLE_PX) return 'echelle';
    }
    return 'none';
  }

  function hitMotifHandle(
    layer: MotifLayer,
    clientX: number,
    clientY: number,
  ): 'scale' | 'band-haut' | 'band-bas' | 'move' | null {
    const design = deps.getDesign();
    const g = stackGauge(design.dimensions, design.zones);
    const gz = motifGizmo(layer, g);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const br = flat.clientAtMotifStitch(gz.tile.x + gz.tile.w, gz.tile.y + gz.tile.h);
    if (br && Math.hypot(mx - br.x, my - br.y) <= HANDLE_PX) return 'scale';
    if (layer.bounds.kind === 'bande') {
      const top = flat.clientAtMotifStitch(Math.round(g.needles / 4), gz.band.from);
      const bottom = flat.clientAtMotifStitch(Math.round(g.needles / 4), gz.band.to - 0.01);
      if (top && Math.hypot(mx - top.x, my - top.y) <= HANDLE_PX + 2) return 'band-haut';
      if (bottom && Math.hypot(mx - bottom.x, my - bottom.y) <= HANDLE_PX + 2) return 'band-bas';
    }
    const st = flat.clientToMotifStitch(mx, my);
    if (!st) return null;
    const t = gz.tile;
    if (st.col >= t.x && st.col <= t.x + t.w && st.row >= t.y && st.row <= t.y + t.h) return 'move';
    return null;
  }

  canvas.tabIndex = 0;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space' && !event.repeat) spaceDown = true;
    if (event.key === 'Escape') {
      deps.selectLayer(null);
      flat.redraw();
      return;
    }
    const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const selectedId = deps.getSelectedId();
    if (!selectedId) return;
    const design = deps.getDesign();
    const layer = layerById(design.layers, selectedId);
    if (layer?.kind !== 'image' || layer.locked) return;
    const step = event.shiftKey ? 10 : 1;
    const patch = (p: Partial<ImageLayer>): void => {
      deps.patchImage(layer.id, p, false);
      scheduleHeavy();
      flat.redraw();
    };
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      patch({ x: layer.x - step });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      patch({ x: layer.x + step });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      patch({ y: layer.y - step });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      patch({ y: layer.y + step });
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') spaceDown = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 1 || event.button === 2 || spaceDown) {
      panning = true;
      lastPan = { x: event.clientX, y: event.clientY };
      flat.setPanMode(true);
      return;
    }
    const design = deps.getDesign();
    const selectedId = deps.getSelectedId();
    const selected = selectedId ? layerById(design.layers, selectedId) : undefined;

    if (selected && canEdit(selected)) {
      if (selected.kind === 'image') {
        const handle = hitImageHandle(selected, event.clientX, event.clientY);
        const rect = canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const st = flat.clientToMotifStitch(mx, my);
        const useHandle = handle !== 'none' ? handle : null;
        if (useHandle && st) {
          active = {
            kind: 'image',
            id: selected.id,
            handle: useHandle,
            start: { ...selected },
            from: [st.col + 0.5, st.row + 0.5],
          };
          canvas.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
        if (st) {
          active = {
            kind: 'image',
            id: selected.id,
            handle: 'deplacer',
            start: { ...selected },
            from: [st.col + 0.5, st.row + 0.5],
          };
          canvas.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
      } else if (selected.kind === 'motif') {
        const hit = hitMotifHandle(selected, event.clientX, event.clientY);
        const st = flat.clientToMotifStitch(
          event.clientX - canvas.getBoundingClientRect().left,
          event.clientY - canvas.getBoundingClientRect().top,
        );
        if (hit === 'scale' && st) {
          const gz = motifGizmo(selected, stackGauge(design.dimensions, design.zones));
          const origin: [number, number] = [gz.tile.x, gz.tile.y];
          const startFactor = 1;
          active = { kind: 'motif-scale', id: selected.id, start: { ...selected }, startFactor, origin };
          canvas.setPointerCapture(event.pointerId);
          return;
        }
        if ((hit === 'band-haut' || hit === 'band-bas') && selected.bounds.kind === 'bande') {
          active = {
            kind: 'motif-band',
            id: selected.id,
            edge: hit === 'band-haut' ? 'haut' : 'bas',
            band: { from: selected.bounds.fromRow, to: selected.bounds.toRow },
          };
          canvas.setPointerCapture(event.pointerId);
          return;
        }
        if (hit === 'move' && st) {
          active = {
            kind: 'motif-move',
            id: selected.id,
            start: { ...selected },
            from: [st.col + 0.5, st.row + 0.5],
          };
          canvas.setPointerCapture(event.pointerId);
          return;
        }
      }
    }

    const st = flat.clientToMotifStitch(
      event.clientX - canvas.getBoundingClientRect().left,
      event.clientY - canvas.getBoundingClientRect().top,
    );
    const owner = deps.getStackOwner();
    if (st && owner) {
      const g = stackGauge(design.dimensions, design.zones);
      const hitId = layerAtStitch(design.layers, owner, g.needles, st.col + 0.5, st.row + 0.5);
      if (hitId) {
        const hitLayer = layerById(design.layers, hitId);
        if (hitLayer?.kind === 'fond') {
          deps.selectLayer(null);
        } else {
          deps.selectLayer(hitId);
        }
      } else {
        deps.selectLayer(null);
      }
      flat.redraw();
    }
    canvas.focus();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (panning) {
      flat.panBy(event.clientX - lastPan.x, event.clientY - lastPan.y);
      lastPan = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    const st = flat.clientToMotifStitch(event.clientX - rect.left, event.clientY - rect.top);
    if (!st) return;
    const to: [number, number] = [st.col + 0.5, st.row + 0.5];
    const design = deps.getDesign();

    if (active.kind === 'image') {
      const g = stackGauge(design.dimensions, design.zones);
      const patch = dragImage(active.start, g, active.handle, active.from, to, {
        snapDeg: event.shiftKey ? 15 : undefined,
      });
      deps.patchImage(active.id, patch, true);
      scheduleHeavy();
      flat.redraw();
      return;
    }

    if (active.kind === 'motif-move') {
      const dx = to[0] - active.from[0];
      const dy = to[1] - active.from[1];
      const patch = dragMotif(active.start, [dx, dy]);
      deps.patchMotif(active.id, patch, true);
      scheduleHeavy();
      flat.redraw();
      return;
    }

    if (active.kind === 'motif-scale') {
      const g = stackGauge(design.dimensions, design.zones);
      const gz = motifGizmo(active.start, g);
      const cx = gz.tile.x + gz.tile.w / 2;
      const cy = gz.tile.y + gz.tile.h / 2;
      const startCorner: [number, number] = [gz.tile.x + gz.tile.w, gz.tile.y + gz.tile.h];
      const da = Math.hypot(startCorner[0] - cx, startCorner[1] - cy) || 1;
      const db = Math.hypot(to[0] - cx, to[1] - cy);
      const factor = db / da;
      const patch = scaleMotif(active.start, factor, g);
      deps.patchMotif(active.id, patch, true);
      scheduleHeavy();
      flat.redraw();
      return;
    }

    if (active.kind === 'motif-band') {
      const g = stackGauge(design.dimensions, design.zones);
      const row = Math.round(st.row);
      const next =
        active.edge === 'haut'
          ? setMotifBand(g.rows, { from: row, to: active.band.to })
          : setMotifBand(g.rows, { from: active.band.from, to: row });
      deps.setMotifBounds(active.id, next, true);
      scheduleHeavy();
      flat.redraw();
    }
  };

  const onPointerUp = (): void => {
    active = null;
    panning = false;
    flat.setPanMode(false);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    flat.setOverlayDrawer(null);
  };
}
