import { layoutRaccord, seamMismatch } from './core/layout';
import { type RasterImage, assetKey } from './core/composition';
import { loadCompositionImages } from './io/compositionImages';
import { resolvePreset } from './core/presets';
import { quantize } from './core/quantize';
import { defaultDimensions, MACHINE_LIMITS, stitchAspect } from './core/sizes';
import { createMotifRgbCache, computeStackRgb, tilesForMotifLayer } from './core/stackCompute';
import {
  dirtyRowsForImage,
  effectiveZones,
  fondVisible,
  layerKeyColors,
  primaryMotifLayer,
  renderStack,
  stackGauge,
  imageGizmo,
  motifGizmo,
  layerAtStitch,
  motifYToGridY,
  type ImageLayer,
  type MotifLayer,
  type SockDesignV2,
  type StackLayer,
} from './core/layers';
import { yarnColors, isPngCollection } from './core/collections';
import { runExports, renderPair } from './io/exportPng';
import { loadCatalogue } from './io/catalogue';
import { tilesFromCollection, nuancierMap } from './io/collectionTiles';
import {
  loadLastProject,
  parseProject,
  saveLastProject,
  serializeProject,
  projectByteLength,
  PROJECT_SIZE_WARN_BYTES,
  AUTOSAVE_OMIT_ASSETS_BYTES,
  type ParsedProject,
  type ProjectCollectionMeta,
} from './io/project';
import { enterDevMode, leaveDevMode, resolveDevMode } from './io/shareLink';
import { buildShareUrl, decodeShareHash, type ParsedShare } from './io/shareState';
import { fixtureUrl, loadTileFromUrl, loadTileFromSvgText } from './io/tiles';
import { createScene } from './render/scene';
import { createSockObject, type SockObject } from './render/sock3d/sockObject';
import type { SockShapeInput } from './render/sock3d/sockShape';
import { capturePng, frameView, type ViewName } from './render/sock3d/studio';
import {
  editingCollection,
  editingLayoutSettings,
  getState,
  subscribe,
  update,
  undo,
  redo,
  selectLayer,
  patchImageLayer,
  patchLayerCoalesced,
  setMotifBounds,
  convertLayerToDessin,
  type DesignPatch,
} from './state';
import type { SimHook, StitchRead } from './testHook';
import type { SockDimensions, StitchGrid, ZoneSettings } from './core/types';
import { mountFlatView } from './ui/flatView';
import { mountFlatGizmos } from './ui/flatGizmos';
import { mountDessinTools } from './ui/dessinTools';
import { mountCompositionEditor } from './ui/compositionEditor';
import {
  mountPanel,
  renderChecks,
  renderStackPaletteGuard,
  renderStatus,
  setChecksAlertsActivator,
  type PanelApi,
} from './ui/panel';
import { yarnLegendLabels } from './ui/palettePanel';
import { mountViewerBar } from './ui/viewerBar';
import { mountSplitters } from './ui/splitters';
import { mountLayersDock } from './ui/layersDock';
import { mountLibrary } from './ui/library';
import { mountOptionsTabs } from './ui/optionsTabs';
import { mountProjectBar } from './ui/projectBar';
import { createDecorController } from './render/decorController';
import { checkFabrication } from './core/checks';
import { countIsolatedStitches, isolatedStitchMask } from './core/compositionAids';
import { composeGrid, gridFingerprint, rowRanges } from './core/grid';
import { motifRows } from './core/layout';
import {
  firstFloatLayerHint,
  firstIsolatedLayerHint,
  planStackPalette,
  reduceStackPaletteQuantize,
} from './core/stackPaletteGuard';
import * as THREE from 'three';

const panelEl = document.getElementById('panel');
const appEl = document.getElementById('app');
const view3dEl = document.getElementById('view3d');
const view2dEl = document.getElementById('view2d');
const projectBarEl = document.getElementById('project-bar');
const layersDockEl = document.getElementById('layers-dock');
const toolbar2dEl = document.querySelector('[data-testid="toolbar-2d"]');
const toolbar3dEl = document.querySelector('[data-testid="toolbar-3d"]');
if (
  !(panelEl instanceof HTMLElement) ||
  !(appEl instanceof HTMLElement) ||
  !(view3dEl instanceof HTMLElement) ||
  !(view2dEl instanceof HTMLElement) ||
  !(projectBarEl instanceof HTMLElement) ||
  !(layersDockEl instanceof HTMLElement)
) {
  throw new Error('Structure de page introuvable');
}
const panel = panelEl;
const app = appEl;
const view3d = view3dEl;
const view2d = view2dEl;
const projectBar = projectBarEl;
const layersDock = layersDockEl;
/** Zone 3D = viewport historique (visionneuse + e2e). */
void view3d;

function tryLocalStorage(): Storage | null {
  try {
    const key = '__sim_storage_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = tryLocalStorage();
let devMode = resolveDevMode(
  { search: window.location.search, hash: window.location.hash, pathname: window.location.pathname },
  storage,
  (url) => window.history.replaceState(null, '', url),
);

mountSplitters(storage);

const handle = createScene(view3d);
const sockCanvas =
  handle.renderer.domElement instanceof HTMLCanvasElement ? handle.renderer.domElement : null;
const toolbar3d = toolbar3dEl instanceof HTMLElement ? toolbar3dEl : null;
const flat = mountFlatView(
  {
    canvasHost: view2d,
    toolsHost: toolbar2dEl instanceof HTMLElement ? toolbar2dEl : view2d,
    shortcutsHost: toolbar3d,
    sockCanvas,
    dualPane: true,
  },
  () => handle.requestRender(),
);
const flatCanvasEl = view2d.querySelector('[data-testid="flat-canvas"]');
if (!(flatCanvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Canvas vue 2D introuvable');
}
let dessinToolsApi: import('./ui/dessinTools').DessinToolsApi | null = null;
mountFlatGizmos(flat, flatCanvasEl, {
  getDesign: () => {
    const design = getState().design;
    if (!dragLive?.pending) return design;
    return {
      ...design,
      layers: design.layers.map((l) => (l.id === dragLive!.pending!.id ? dragLive!.pending! : l)),
    } as SockDesignV2;
  },
  getSelectedId: () => getState().selectedLayerId,
  getStackOwner: () => stackOwner,
  getImages: () => compositionImages,
  selectLayer: (id) => {
    if (dessinToolsApi?.isDrawingActive()) return;
    selectLayer(id);
  },
  patchImage: patchImageLayer,
  patchMotif: patchLayerCoalesced,
  setMotifBounds,
  onDragStart(kind, id, start) {
    motifRgbCache.resetStats();
    dragLive = {
      kind,
      id,
      beforeImage: kind === 'image' && start.kind === 'image' ? { ...start } : null,
      lastStack: null,
      raf: null,
      pending: start,
      frames: 0,
      computeMsSum: 0,
      last3dMs: 0,
    };
    dragStats.dragFrames = 0;
    dragStats.dragComputeMsAvg = 0;
  },
  onDragTick(_kind, _id, next) {
    if (!dragLive) return;
    dragLive.pending = next;
    scheduleDragFrame();
  },
  onDragEnd(kind, id, next) {
    if (dragLive?.raf !== null && dragLive) {
      cancelAnimationFrame(dragLive.raf);
      dragLive.raf = null;
    }
    const session = dragLive;
    dragLive = null;
    // Un seul commit historique au lâcher (coalesce).
    if (kind === 'image' && next.kind === 'image') {
      patchImageLayer(id, next, true);
    } else if (next.kind === 'motif') {
      patchLayerCoalesced(id, next);
    }
    syncMesh(grid);
    if (session) {
      dragStats.dragFrames = session.frames;
      dragStats.dragComputeMsAvg =
        session.frames > 0 ? session.computeMsSum / session.frames : 0;
    }
    publish();
  },
});
const compositionEditor = mountCompositionEditor(view3d);
const viewer = mountViewerBar(view3d, {
  onView: (view) => {
    frameCamera(view);
    publish();
  },
  onCopyLink: () => copyShareLink(),
  onFlat: (flatMode) => flat.setFlat(flatMode),
  isFlat: () => flat.isFlat(),
});

if (toolbar3dEl instanceof HTMLElement) {
  const label = document.createElement('span');
  label.className = 'zone-label';
  label.textContent = 'Vue 3D';
  toolbar3dEl.prepend(label);
}
if (toolbar2dEl instanceof HTMLElement) {
  const label = document.createElement('span');
  label.className = 'zone-label';
  label.textContent = 'Vue à plat';
  toolbar2dEl.prepend(label);
  const guidesBtn = document.createElement('button');
  guidesBtn.type = 'button';
  guidesBtn.dataset.testid = 'ctl-face-guides';
  guidesBtn.textContent = 'Repères';
  guidesBtn.setAttribute('aria-pressed', flat.getFaceGuides() ? 'true' : 'false');
  guidesBtn.classList.toggle('active', flat.getFaceGuides());
  guidesBtn.addEventListener('click', () => {
    const next = !flat.getFaceGuides();
    flat.setFaceGuides(next);
    guidesBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
    guidesBtn.classList.toggle('active', next);
  });
  toolbar2dEl.append(guidesBtn);

  const alertsBtn = document.createElement('button');
  alertsBtn.type = 'button';
  alertsBtn.dataset.testid = 'ctl-flat-alerts';
  alertsBtn.textContent = 'Alertes';
  const syncAlertsBtn = (): void => {
    const on = flat.getAlerts();
    alertsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    alertsBtn.classList.toggle('active', on);
  };
  syncAlertsBtn();
  alertsBtn.addEventListener('click', () => {
    flat.setAlerts(!flat.getAlerts());
    syncAlertsBtn();
  });
  toolbar2dEl.append(alertsBtn);

  setChecksAlertsActivator(() => {
    flat.setAlerts(true);
    syncAlertsBtn();
    if (!flat.isFlat()) flat.setFlat(true);
  });
}

/** Aperçu live d’un trait de dessin (T72). */
let dessinPreview = {
  active: false,
  last3d: 0,
  lastStack: null as { rgb: Uint8ClampedArray; owner: Int16Array } | null,
};

dessinToolsApi = mountDessinTools(
  toolbar2dEl instanceof HTMLElement ? toolbar2dEl : view2d,
  flat,
  {
    getDesign: () => getState().design,
    getSelectedId: () => getState().selectedLayerId,
    getStackRgb: () => lastStackRgb,
    commitDessin(layerId, next) {
      dessinPreview.active = false;
      dessinPreview.lastStack = null;
      update({
        design: {
          layers: getState().design.layers.map((l) => (l.id === layerId ? next : l)),
        },
      });
    },
    previewStack(layers, dirtyRows) {
      dessinPreview.active = true;
      const design = getState().design;
      const gauge = stackGauge(design.dimensions, design.zones);
      const stackResult = renderStack(
        {
          layers,
          gauge,
          motifRgb: lastMotifRgb,
          images: compositionImages,
          keyColors: lastKeyColors,
        },
        dirtyRows && dessinPreview.lastStack
          ? { rows: dirtyRows, into: dessinPreview.lastStack }
          : dirtyRows
            ? { rows: dirtyRows }
            : undefined,
      );
      dessinPreview.lastStack = stackResult;
      lastStackRgb = stackResult.rgb;
      stackOwner = stackResult.owner;
      flat.paintMotifRgbPreview(stackResult.rgb, gauge.needles, gauge.rows);
      const now = performance.now();
      if (now - dessinPreview.last3d >= 125) {
        dessinPreview.last3d = now;
        const palette =
          patternPalette.length > 0
            ? patternPalette
            : design.quantize.palette.length > 0
              ? design.quantize.palette
              : ['#f4f1ea', '#1d1d1b'];
        const reduced = quantize(stackResult.rgb, design.dimensions.needles, {
          ...design.quantize,
          paletteMode: 'manuelle',
          palette,
          maxColors: Math.max(2, Math.min(8, palette.length)),
          despeckle: false,
        });
        grid = composeGrid(
          design.dimensions,
          effectiveZones(design),
          reduced.indices,
          reduced.palette,
        );
        syncMesh(grid);
      }
    },
    endPreview() {
      dessinPreview.active = false;
      dessinPreview.lastStack = null;
      flat.setDessinPreview(null);
    },
  },
);

const shareHint = document.createElement('p');
shareHint.className = 'share-hint';
shareHint.dataset.testid = 'share-hint';
shareHint.hidden = true;
view3d.appendChild(shareHint);
function showShareHint(message: string | null): void {
  if (!message) {
    shareHint.hidden = true;
    shareHint.textContent = '';
    return;
  }
  shareHint.hidden = false;
  shareHint.textContent = message;
}

async function copyShareLink(): Promise<void> {
  const { design, embeddedAssets } = getState();
  const hasEmbedded = design.layers.some((l) => {
    if (l.kind !== 'image' || l.asset.kind !== 'embarquee') return false;
    const id = l.asset.assetId;
    return embeddedAssets.some((a) => a.id === id);
  });
  if (hasEmbedded) {
    showShareHint(
      'Ce projet contient des images importées : envoyez le fichier projet (.json)',
    );
    return;
  }
  const built = await buildShareUrl();
  try {
    await navigator.clipboard.writeText(built.url);
  } catch {
    /* presse-papiers indisponible */
  }
  window.history.replaceState(null, '', `${window.location.pathname}${built.hash}`);
  if (built.tilesOmitted) {
    showShareHint(
      'Les carreaux importés ne sont pas dans le lien : utilisez une collection ou envoyez le projet .json',
    );
  } else if (built.tooLong) {
    showShareHint('Lien long : certaines messageries peuvent le tronquer.');
  } else {
    showShareHint('Lien copié.');
    window.setTimeout(() => showShareHint(null), 2500);
  }
}

let view2dVisible = true;
let view3dVisible = true;
try {
  if (localStorage.getItem('sim-view-2d') === '0') view2dVisible = false;
  if (localStorage.getItem('sim-view-3d') === '0') view3dVisible = false;
} catch {
  /* ignore */
}

function applyViewVisibility(): void {
  app.classList.toggle('hide-2d', !view2dVisible);
  app.classList.toggle('hide-3d', !view3dVisible);
  try {
    localStorage.setItem('sim-view-2d', view2dVisible ? '1' : '0');
    localStorage.setItem('sim-view-3d', view3dVisible ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (view3dVisible) {
    window.dispatchEvent(new Event('resize'));
    handle.requestRender();
  }
}

mountProjectBar(projectBar, {
  copyShareLink,
  openLibrary: () => library.open('collections'),
  onToggleView: (which) => {
    if (which === '2d') view2dVisible = !view2dVisible;
    else view3dVisible = !view3dVisible;
    applyViewVisibility();
  },
  getViewVisibility: () => ({ view2d: view2dVisible, view3d: view3dVisible }),
});
applyViewVisibility();

function applyShellMode(dev: boolean): void {
  devMode = dev;
  app.classList.toggle('viewer-mode', !dev);
  panel.hidden = !dev;
  projectBar.hidden = !dev;
  layersDock.hidden = !dev;
  // Reparenter la vue à plat AVANT d’afficher la barre visionneuse
  // (sinon isFlat() est encore true et la case « À plat » reste cochée).
  if (dev) {
    flat.setHosts({
      canvasHost: view2d,
      toolsHost: toolbar2dEl instanceof HTMLElement ? toolbar2dEl : view2d,
      shortcutsHost: toolbar3d,
      sockCanvas,
      dualPane: true,
    });
  } else {
    flat.setHosts({
      canvasHost: view3d,
      toolsHost: view3d,
      shortcutsHost: toolbar3d,
      sockCanvas,
      dualPane: false,
    });
  }
  flat.setDevTools(dev);
  viewer.setVisible(!dev);
  handle.requestRender();
}

applyShellMode(devMode);

let grid: StitchGrid = composeGrid(
  getState().design.dimensions,
  effectiveZones(getState().design),
  null,
  [],
);
let patternPalette: string[] = [];
let patternCounts: number[] = [];
let computeId = 0;
let lastComputeMs = 0;
let textureUpdates = 0;
let surfaceKey = '';
let sock: SockObject | null = null;
const warnings: string[] = [];
/** Images pixelisées pour les calques Image (cache module). */
let compositionImages = new Map<string, RasterImage>();
let compositionLoadToken = 0;
let compositionImagesReadyKey = '';
const motifRgbCache = createMotifRgbCache();
/** Owner par maille de la zone motif (sélection 2D). */
let stackOwner: Int16Array | null = null; // sélection 2D (T56)
/** Dernier RVB empilé (zone motif) — Transformer en dessin (T71). */
let lastStackRgb: Uint8ClampedArray | null = null;
/** Derniers pixels par calque Motif et couleurs de fil : vignettes du dock. */
let lastMotifRgb = new Map<string, Uint8ClampedArray>();
let lastKeyColors = new Map<string, readonly string[]>();

/** Session de glisser fluide (T62) : recalcul partiel, pas d’autosave / lien / historique. */
type DragLive = {
  kind: 'image' | 'motif';
  id: string;
  beforeImage: ImageLayer | null;
  lastStack: { rgb: Uint8ClampedArray; owner: Int16Array } | null;
  raf: number | null;
  pending: ImageLayer | MotifLayer | null;
  frames: number;
  computeMsSum: number;
  last3dMs: number;
};
let dragLive: DragLive | null = null;
const dragStats = { dragFrames: 0, dragComputeMsAvg: 0 };

function suppressSideEffects(): boolean {
  return dragLive !== null;
}

function scheduleDragFrame(): void {
  if (!dragLive || dragLive.raf !== null) return;
  dragLive.raf = requestAnimationFrame(() => {
    if (!dragLive) return;
    dragLive.raf = null;
    runDragCompute();
  });
}

function runDragCompute(): void {
  if (!dragLive?.pending) return;
  const started = performance.now();
  const { design } = getState();
  const pending = dragLive.pending;
  const layers = design.layers.map((l) => (l.id === pending.id ? pending : l));
  const previewDesign = { ...design, layers } as SockDesignV2;
  const gauge = stackGauge(previewDesign.dimensions, previewDesign.zones);

  // Image : Motifs inchangés → lastMotifRgb, aucun motifLayerRgb.
  // Motif : le cache ne recalcule que le calque touché.
  let motifRgb = lastMotifRgb;
  if (dragLive.kind === 'motif') {
    const { tiles, calepPresets } = getState();
    motifRgb = motifRgbCache.getMotifRgb(
      previewDesign,
      (layer) => tilesForMotifLayer(layer, tiles),
      calepPresets,
    );
    lastMotifRgb = motifRgb;
  }

  let stackResult: { rgb: Uint8ClampedArray; owner: Int16Array };
  if (dragLive.kind === 'image' && pending.kind === 'image' && dragLive.beforeImage) {
    const img = compositionImages.get(assetKey(pending.asset));
    const rows = img
      ? dirtyRowsForImage(dragLive.beforeImage, pending, img, gauge)
      : ([0, gauge.rows] as [number, number]);
    stackResult = renderStack(
      {
        layers,
        gauge,
        motifRgb,
        images: compositionImages,
        keyColors: lastKeyColors,
      },
      dragLive.lastStack ? { rows, into: dragLive.lastStack } : { rows },
    );
  } else {
    stackResult = renderStack({
      layers,
      gauge,
      motifRgb,
      images: compositionImages,
      keyColors: lastKeyColors,
    });
  }
  dragLive.lastStack = stackResult;
  stackOwner = stackResult.owner;

  // Aperçu 2D immédiat depuis le RVB empilé (sans quantize).
  flat.paintMotifRgbPreview(stackResult.rgb, gauge.needles, gauge.rows);

  const now = performance.now();
  // 3D au plus 8×/s : quantize + compose + texture.
  if (now - dragLive.last3dMs >= 125) {
    const palette =
      patternPalette.length > 0
        ? patternPalette
        : design.quantize.palette.length > 0
          ? design.quantize.palette
          : ['#f4f1ea', '#1f3a5f'];
    const reduced = quantize(stackResult.rgb, design.dimensions.needles, {
      ...design.quantize,
      paletteMode: 'manuelle',
      palette,
      maxColors: Math.max(2, Math.min(8, palette.length)),
      despeckle: false,
    });
    grid = composeGrid(
      design.dimensions,
      effectiveZones(previewDesign),
      reduced.indices,
      reduced.palette,
    );
    syncMesh(grid);
    dragLive.last3dMs = now;
  }

  dragLive.frames += 1;
  dragLive.computeMsSum += now - started;
  dragStats.dragFrames = dragLive.frames;
  dragStats.dragComputeMsAvg = dragLive.computeMsSum / Math.max(1, dragLive.frames);
}

/** Clé de cache d’une vignette : rien ne change tant que le calque et la jauge sont identiques. */
function thumbKey(layer: StackLayer, design: SockDesignV2): string {
  const ready =
    layer.kind === 'motif'
      ? lastMotifRgb.has(layer.id)
      : layer.kind === 'image'
        ? compositionImages.has(assetKey(layer.asset))
        : true;
  const fond = design.layers[0];
  return JSON.stringify([
    layer,
    fond?.kind === 'fond' ? fond.color : '',
    design.dimensions,
    design.zones.patternOnFoot,
    design.zones.cuffEnabled,
    ready,
  ]);
}

/** Vignette d’un calque : rendu réel de ce calque seul, posé sur le Fond (Dessin = damier). */
function drawLayerThumb(layerId: string, canvas: HTMLCanvasElement): void {
  const { design } = getState();
  const layer = design.layers.find((l) => l.id === layerId);
  const fond = design.layers[0];
  if (!layer || !fond) return;
  const key = thumbKey(layer, design);
  if (canvas.dataset.thumbKey === key) return;
  const gauge = stackGauge(design.dimensions, design.zones);
  if (gauge.needles < 1 || gauge.rows < 1) return;
  const solo: StackLayer[] =
    layer.kind === 'fond'
      ? [fond]
      : layer.kind === 'dessin' && fond.kind === 'fond'
        ? [{ ...fond, color: '#ffffff' }, { ...layer, hidden: false }]
        : [fond, { ...layer, hidden: false }];
  const { rgb, owner } = renderStack({
    layers: solo,
    gauge,
    motifRgb: lastMotifRgb,
    images: compositionImages,
    keyColors: lastKeyColors,
    supersample: 1,
  });
  const source = document.createElement('canvas');
  source.width = gauge.needles;
  source.height = gauge.rows;
  const sourceContext = source.getContext('2d');
  const context = canvas.getContext('2d');
  if (!sourceContext || !context) return;
  const pixels = sourceContext.createImageData(gauge.needles, gauge.rows);
  for (let y = 0; y < gauge.rows; y++) {
    for (let x = 0; x < gauge.needles; x++) {
      const i = y * gauge.needles + x;
      const p = i * 4;
      const src = i * 3;
      if (layer.kind === 'dessin' && (owner[i] ?? 0) === 0) {
        // Damier clair sous le dessin seul.
        const light = ((x >> 2) + (y >> 2)) % 2 === 0;
        const v = light ? 235 : 210;
        pixels.data[p] = v;
        pixels.data[p + 1] = v;
        pixels.data[p + 2] = v;
        pixels.data[p + 3] = 255;
      } else {
        pixels.data[p] = rgb[src] ?? 0;
        pixels.data[p + 1] = rgb[src + 1] ?? 0;
        pixels.data[p + 2] = rgb[src + 2] ?? 0;
        pixels.data[p + 3] = 255;
      }
    }
  }
  sourceContext.putImageData(pixels, 0, 0);
  // Cadrage « couvrant » depuis le haut de la tige, en millimètres réels : pas de motif déformé.
  const mmPerStitch = 10 / design.dimensions.stitchesPerCm;
  const mmPerRow = 10 / design.dimensions.rowsPerCm;
  const boxRatio = canvas.width / Math.max(1, canvas.height);
  let cropW = gauge.needles;
  let cropH = gauge.rows;
  if ((gauge.needles * mmPerStitch) / (gauge.rows * mmPerRow) > boxRatio) {
    cropW = Math.max(1, Math.round((gauge.rows * mmPerRow * boxRatio) / mmPerStitch));
  } else {
    cropH = Math.max(1, Math.round(gauge.needles * mmPerStitch / boxRatio / mmPerRow));
  }
  const cropX = Math.max(0, Math.round((gauge.needles - cropW) / 2));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(source, cropX, 0, cropW, cropH, 0, 0, canvas.width, canvas.height);
  canvas.dataset.thumbKey = key;
}

/** Couleurs principales d’un calque : pastilles « rendre transparent » du panneau. */
function layerColorsOf(layerId: string): string[] {
  const layer = getState().design.layers.find((l) => l.id === layerId);
  if (!layer) return [];
  return layerKeyColors(layer, {
    motifRgb: lastMotifRgb,
    images: compositionImages,
    keyColors: lastKeyColors,
  });
}

/** Aperçu de l’image d’un calque Image, contenue dans le cadre (proportions gardées). */
function drawAssetPreview(layerId: string, canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const layer = getState().design.layers.find((l) => l.id === layerId);
  if (layer?.kind !== 'image') return;
  const image = compositionImages.get(assetKey(layer.asset));
  if (!image) return;
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) return;
  sourceContext.putImageData(
    new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
    0,
    0,
  );
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  context.imageSmoothingEnabled = true;
  context.drawImage(source, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height);
}

const optionsTabsEl = document.querySelector('[data-testid="options-tabs"]');
const optionsTabs = mountOptionsTabs(optionsTabsEl instanceof HTMLElement ? optionsTabsEl : panel);
const library = mountLibrary(document.body);
const dock = mountLayersDock(layersDock, {
  drawLayerThumb,
  openLayerTab: () => optionsTabs.open('calque'),
  openLibrary: (tab) => library.open(tab),
  convertToDessin: (layerId) => {
    if (!lastStackRgb || !stackOwner) return;
    const id = convertLayerToDessin(layerId, lastStackRgb, stackOwner);
    if (id) optionsTabs.open('calque');
  },
});

function imageLayersKey(design: SockDesignV2): string {
  return JSON.stringify(
    design.layers
      .filter((l): l is Extract<typeof l, { kind: 'image' }> => l.kind === 'image' && !l.hidden)
      .map((l) => l.asset),
  );
}

const decor = createDecorController(
  handle.scene,
  handle.renderer,
  handle.studio.ground,
  () => {
    if (sock) {
      const box = new THREE.Box3().setFromObject(sock.mesh);
      return box.getCenter(new THREE.Vector3());
    }
    return handle.controls.target.clone();
  },
  () => {
    handle.requestRender();
    publish();
  },
);
handle.setBeforeRender(() => {
  decor.faceCamera(handle.camera, handle.controls.target);
});

function surfaceKeyOf(dims: SockDimensions, zones: ZoneSettings, side: string): string {
  return [
    dims.size,
    dims.needles,
    dims.cuffRows,
    dims.legRows,
    dims.heelRows,
    dims.footRows,
    dims.toeRows,
    dims.rowsPerCm,
    zones.cuffEnabled ? 1 : 0,
    zones.heelHeightMm,
    zones.heelDepthMm,
    zones.heelSpread,
    side,
  ].join('|');
}

function shapeFromDesign(dims: SockDimensions, zones: ZoneSettings, side: 'droite' | 'gauche'): SockShapeInput {
  return {
    needles: dims.needles,
    cuffRows: zones.cuffEnabled ? dims.cuffRows : 0,
    legRows: dims.legRows,
    heelRows: dims.heelRows,
    footRows: dims.footRows,
    toeRows: dims.toeRows,
    rowsPerCm: dims.rowsPerCm,
    size: dims.size,
    side,
    heelHeight: zones.heelHeightMm,
    heelDepth: zones.heelDepthMm,
    heelSpread: zones.heelSpread / 100,
  };
}

function frameCamera(view: ViewName = 'trois-quarts'): void {
  if (!sock) return;
  const mirror = getState().footSide === 'gauche';
  const center = frameView(handle.camera, sock.mesh, view, 0.85, mirror);
  const box = new THREE.Box3().setFromObject(sock.mesh);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  handle.controls.target.copy(center);
  handle.controls.minDistance = Math.max(sphere.radius * 0.55, 0.05);
  handle.controls.maxDistance = Math.max(sphere.radius * 12, 0.5);
  handle.controls.update();
  handle.requestRender();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function syncMesh(next: StitchGrid): void {
  if (!view3dVisible) return;
  const { design, knitFidelity, footSide } = getState();
  const key = surfaceKeyOf(design.dimensions, design.zones, footSide);
  const shape = shapeFromDesign(design.dimensions, design.zones, footSide);
  const zones = {
    heel: design.zones.heelColor,
    toe: design.zones.toeColor,
    rim: design.zones.cuffEnabled ? design.zones.cuffColor : undefined,
  };
  const chevron = knitFidelity === 'fidele' ? 0.9 : 0;

  if (!sock) {
    sock = createSockObject(shape, next, zones);
    sock.setChevron(chevron);
    handle.root.add(sock.mesh);
    surfaceKey = key;
    frameCamera();
  } else if (key !== surfaceKey) {
    sock.setShape(shape);
    sock.setColors(next, zones);
    sock.setChevron(chevron);
    surfaceKey = key;
    frameCamera();
  } else {
    sock.setColors(next, zones);
    sock.setChevron(chevron);
  }
  textureUpdates += 1;
  handle.requestRender();
}

function readStitch(col: number, row: number): StitchRead | null {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
  const index = row * grid.width + col;
  const colorIndex = grid.colorIndex[index] ?? 0;
  return {
    col,
    row,
    zone: grid.zone[index] ?? 0,
    color: grid.palette[colorIndex] ?? '#000000',
  };
}

async function loadFixture(name: string): Promise<void> {
  try {
    const tile = await loadTileFromUrl(fixtureUrl(name));
    update({ tiles: [...getState().tiles, tile], error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impossible de charger l’exemple.';
    update({ error: message });
  }
}

function setDesign(partial: DesignPatch): void {
  if (partial.dimensions?.size) {
    const preset = defaultDimensions(partial.dimensions.size);
    update({ design: { ...partial, dimensions: { ...preset, ...partial.dimensions } } });
    return;
  }
  update({ design: partial });
}

async function captureView(view: ViewName, size: number, background: string | null = '#ecebe8'): Promise<string> {
  if (!sock) throw new Error('La chaussette n’est pas prête.');
  const mirror = getState().footSide === 'gauche';
  const blob = await capturePng(
    handle.renderer,
    handle.scene,
    sock.mesh,
    view,
    size,
    background,
    mirror,
    (cam, target) => decor.faceCamera(cam, target),
  );
  handle.requestRender();
  return blobToDataUrl(blob);
}

async function capturePair(size: number, background: string | null = '#ecebe8'): Promise<string> {
  const { design, footSide } = getState();
  const shape = shapeFromDesign(design.dimensions, design.zones, footSide);
  const blob = await renderPair(
    {
      renderer: handle.renderer,
      scene: handle.scene,
      mesh: sock?.mesh ?? null,
      grid,
      aspect: stitchAspect(design.dimensions),
      modelName: design.name,
      sizeId: design.dimensions.size,
      redraw: () => handle.requestRender(),
      pairShape: { ...shape, side: 'droite' },
      pairZones: {
        heel: design.zones.heelColor,
        toe: design.zones.toeColor,
        rim: design.zones.cuffEnabled ? design.zones.cuffColor : undefined,
      },
      mirrorView: false,
      beforeRender: (cam, target) => decor.faceCamera(cam, target),
    },
    size,
    background ?? '#ecebe8',
    background === null,
  );
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture capture impossible.'));
    reader.readAsDataURL(blob);
  });
}

function publish(): void {
  const state = getState();
  const layout = editingLayoutSettings(state.design, state.tiles, state.selectedLayerId);
  const design = {
    ...structuredClone(state.design),
    layout,
    pattern: { kind: 'carreaux' as const },
  };
  const hook: SimHook = {
    ready: true,
    computeId,
    lastComputeMs,
    design,
    grid: { width: grid.width, height: grid.height, palette: [...grid.palette] },
    gridHash: gridFingerprint(grid),
    patternPalette: [...patternPalette],
    geometryBuilds: sock?.geometryBuilds ?? 0,
    textureUpdates,
    knitFidelity: state.knitFidelity,
    cameraPosition: {
      x: handle.camera.position.x,
      y: handle.camera.position.y,
      z: handle.camera.position.z,
    },
    cameraTarget: {
      x: handle.controls.target.x,
      y: handle.controls.target.y,
      z: handle.controls.target.z,
    },
    get cameraAspect() {
      return handle.camera.aspect;
    },
    warnings: [...warnings],
    catalogue: state.catalogue,
    catalogueMissing: state.catalogueMissing,
    activeCollectionId: editingCollection(state.design, state.selectedLayerId)?.id ?? null,
    loadFixture,
    setDesign,
    getStitch: readStitch,
    flatCenter: flat.centerOf,
    captureView,
    capturePair,
    decorBuildId: decor.getBuildId(),
    stackOwnerLength: stackOwner?.length ?? 0,
    motifRowOrigin: rowRanges(state.design.dimensions, state.design.zones).leg.start,
    gizmoClient(layerId: string) {
      const layer = state.design.layers.find((l) => l.id === layerId);
      if (!layer || layer.kind === 'fond' || layer.kind === 'dessin' || layer.locked) return null;
      const g = stackGauge(state.design.dimensions, state.design.zones);
      if (layer.kind === 'image') {
        const img = compositionImages.get(assetKey(layer.asset));
        const gz = imageGizmo(layer, img ?? { width: 1, height: 1 }, g);
        const rotate = flat.clientAtMotifStitch(gz.rotate[0], gz.rotate[1]);
        const br = flat.clientAtMotifStitch(gz.corners[2]![0], gz.corners[2]![1]);
        const cx =
          gz.corners.reduce((s, c) => s + c[0], 0) / gz.corners.length;
        const cy =
          gz.corners.reduce((s, c) => s + c[1], 0) / gz.corners.length;
        const center = flat.clientAtMotifStitch(cx, cy);
        return {
          rotate: rotate ?? undefined,
          scaleCorner: br ?? undefined,
          imageCenter: center ?? undefined,
          motifCorners: gz.corners.map(([c, r]) => [c, r] as [number, number]),
        };
      }
      const gz = motifGizmo(layer, g);
      const move = flat.clientAtMotifStitch(gz.tile.x + gz.tile.w / 2, gz.tile.y + gz.tile.h / 2);
      const scale = flat.clientAtMotifStitch(gz.tile.x + gz.tile.w, gz.tile.y + gz.tile.h);
      const bandTop = flat.clientAtMotifStitch(Math.round(g.needles / 4), gz.band.from);
      const bandBottom = flat.clientAtMotifStitch(Math.round(g.needles / 4), gz.band.to - 0.01);
      return {
        motifMove: move ?? undefined,
        motifScale: scale ?? undefined,
        bandTop: bandTop ?? undefined,
        bandBottom: bandBottom ?? undefined,
      };
    },
    stackLayerAt(col: number, motifRow: number) {
      if (!stackOwner) return null;
      const g = stackGauge(state.design.dimensions, state.design.zones);
      return layerAtStitch(state.design.layers, stackOwner, g.needles, col + 0.5, motifRow + 0.5);
    },
    flatMotifCenter: (col, motifRow) => flat.clientAtMotifStitch(col, motifRow),
    flatRevealMotif: (col, motifRow) => flat.revealMotifStitch(col, motifRow),
    motifStitchFromLocal: (px, py) => flat.clientToMotifStitch(px, py),
    stats: {
      get dragFrames() {
        return dragStats.dragFrames;
      },
      get dragComputeMsAvg() {
        return dragStats.dragComputeMsAvg;
      },
      get motifRgbComputes() {
        return motifRgbCache.stats.motifRgbComputes;
      },
    },
  };
  window.__SIM__ = hook;
}

function recompute(): void {
  const started = performance.now();
  const { design, tiles, calepPresets, catalogue, embeddedAssets } = getState();
  let pattern: Uint8Array | null = null;
  patternPalette = [];
  patternCounts = [];
  warnings.length = 0;

  // Carreaux par calque Motif : collection → tiles projet (déjà rasterisés), importés → filtre.
  const keyColors = new Map<string, readonly string[]>();
  if (catalogue) {
    const nuancier = new Map(catalogue.nuancier.map((c) => [c.id, c]));
    for (const layer of design.layers) {
      if (layer.kind !== 'motif') continue;
      const src = layer.source;
      if (src.kind !== 'collection') continue;
      const collection = catalogue.collections.find((c) => c.id === src.collectionId);
      if (!collection || isPngCollection(collection)) continue;
      const yarns = yarnColors(collection, src.colors, nuancier);
      keyColors.set(
        layer.id,
        yarns.map((y) => y.hex),
      );
    }
  }

  const { rgb, owner, motifRgb } = computeStackRgb({
    design,
    tiles,
    presets: calepPresets,
    images: compositionImages,
    keyColors,
    cache: motifRgbCache,
  });
  stackOwner = owner;
  lastStackRgb = rgb ?? null;
  lastMotifRgb = motifRgb;
  lastKeyColors = keyColors;

  const zonesEff = effectiveZones(design);
  const fondLayer = design.layers[0];
  const fondColor = fondLayer?.kind === 'fond' ? fondLayer.color : design.zones.footColor;

  let primaryYarns: string[] | null = null;
  {
    const motif = primaryMotifLayer(design.layers);
    const motifSrc = motif?.source;
    if (motifSrc?.kind === 'collection' && catalogue) {
      const collection = catalogue.collections.find((c) => c.id === motifSrc.collectionId);
      if (collection && !isPngCollection(collection) && Object.keys(motifSrc.colors).length > 0) {
        primaryYarns = yarnColors(collection, motifSrc.colors, nuancierMap(catalogue)).map((y) => y.hex);
      }
    }
  }

  if (rgb) {
    const plan = planStackPalette({
      design,
      input: { motifRgb, images: compositionImages, keyColors },
      rendered: rgb,
      primaryYarns,
      fondColor,
      fondVisible: fondVisible(owner),
      limits: MACHINE_LIMITS,
    });
    const reduced = quantize(rgb, design.dimensions.needles, plan.quantizeSettings);
    pattern = reduced.indices;
    patternPalette = reduced.palette;
    patternCounts = reduced.counts;
    renderStackPaletteGuard(plan.guard, () => {
      const patch = reduceStackPaletteQuantize(rgb, MACHINE_LIMITS);
      update({ design: { quantize: { ...getState().design.quantize, ...patch } } });
    });
  } else {
    renderStackPaletteGuard(null, () => undefined);
  }

  grid = composeGrid(design.dimensions, zonesEff, pattern, patternPalette);
  flat.setGrid(grid, stitchAspect(design.dimensions));
  const layout = editingLayoutSettings(design, tiles);
  const report = checkFabrication(grid, layout, zonesEff, MACHINE_LIMITS, design.quantize.maxFloat);
  flat.setFloatMask(report.floatMask);

  const floatLayerHint =
    !report.floatsOk && stackOwner
      ? firstFloatLayerHint(report.floatMask, grid, zonesEff, stackOwner, design.layers)
      : null;

  let checkDetail: { tooFine: boolean; isolatedCount: number; layerHint?: string | null } | null = null;
  if (pattern) {
    const motifH = motifRows(design.dimensions, zonesEff);
    const isolated = countIsolatedStitches(pattern, design.dimensions.needles, motifH);
    const motifIso = isolatedStitchMask(pattern, design.dimensions.needles, motifH);
    const gridIso = new Uint8Array(grid.width * grid.height);
    for (let my = 0; my < motifH; my++) {
      const gy = Math.floor(motifYToGridY(design.dimensions, zonesEff, my));
      if (gy < 0 || gy >= grid.height) continue;
      for (let x = 0; x < design.dimensions.needles && x < grid.width; x++) {
        if (motifIso[my * design.dimensions.needles + x]) {
          gridIso[gy * grid.width + x] = 1;
        }
      }
    }
    flat.setIsolatedMask(gridIso);
    if (isolated.isolatedCount > 0) {
      const layerHint = stackOwner
        ? firstIsolatedLayerHint(pattern, design.dimensions.needles, motifH, stackOwner, design.layers)
        : null;
      checkDetail = { tooFine: isolated.tooFine, isolatedCount: isolated.isolatedCount, layerHint };
    }
  } else {
    flat.setIsolatedMask(null);
  }

  renderChecks(report, checkDetail, { floatLayerHint });

  syncMesh(grid);
  lastComputeMs = performance.now() - started;
  computeId += 1;
  compositionEditor.sync();
  // Vignettes du dock et pastilles du panneau : les pixels viennent d’être calculés.
  dock.sync();
  panelApi?.sync();
  publish();

  const tileCount = Math.max(1, layout.tileIds.length || tiles.length);
  const preset = resolvePreset(layout.calepinage, calepPresets);
  const mismatch = seamMismatch(layout, design.dimensions.needles, tileCount, preset);
  const raccordInfo = layoutRaccord(layout, design.dimensions.needles, tileCount, preset);
  const SEAM_LABEL: Record<string, string> = {
    dos: 'dos',
    interieur: 'intérieur',
    exterieur: 'extérieur',
    devant: 'devant',
  };
  renderStatus({
    ms: lastComputeMs,
    patternPalette,
    patternCounts,
    mismatch,
    raccordMessage: raccordInfo.message,
    seamLabel: SEAM_LABEL[layout.seam] ?? layout.seam,
    showFit: layout.tileSizeMode === 'free' && mismatch > 0,
  });

  // Précharge async des images des calques Image
  const imageLayers = design.layers.filter((l) => l.kind === 'image') as Array<{
    asset: { kind: string; collectionId?: string; variation?: string; assetId?: string };
    hidden: boolean;
  }>;
  if (imageLayers.some((l) => !l.hidden)) {
    const readyKey = imageLayersKey(design);
    if (readyKey !== compositionImagesReadyKey) {
      const token = ++compositionLoadToken;
      const col = editingCollection();
      void loadCompositionImages(
        design.layers
          .filter((l) => l.kind === 'image')
          .map((l) => ({
            id: l.id,
            asset: l.asset,
            x: l.x,
            y: l.y,
            widthStitches: l.widthStitches,
            rotation: l.rotation,
            flipX: l.flipX,
            flipY: l.flipY,
            repeatAroundGap: l.repeatAroundGap,
            hidden: l.hidden,
            locked: l.locked,
          })),
        {
          zoneColors: col?.colors ?? null,
          catalogue,
          assets: embeddedAssets,
        },
      )
        .then((imgs) => {
          if (token !== compositionLoadToken) return;
          compositionImages = imgs;
          compositionImagesReadyKey = readyKey;
          compositionEditor.setImages(imgs);
          recompute();
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Images de calque illisibles.';
          update({ error: message }, { skipHistory: true });
        });
    }
  } else {
    compositionImagesReadyKey = '';
  }
}

let panelApi: PanelApi | null = null;
let saveTimer = 0;

function currentCollectionMeta(): ProjectCollectionMeta | null {
  const col = editingCollection();
  const { catalogue } = getState();
  if (!col) return null;
  return {
    id: col.id,
    zoneColors: { ...col.colors },
    paletteOptionId: col.paletteId,
    syncCommit: catalogue?.source.commit ?? null,
  };
}

async function applyParsedProject(project: ParsedProject): Promise<void> {
  const catalogue = getState().catalogue;
  const meta = project.collection;
  const embeddedAssets = project.assets;
  const design = project.design;

  if (meta && catalogue) {
    const collection = catalogue.collections.find((c) => c.id === meta.id);
    if (collection) {
      try {
        const nuancier = nuancierMap(catalogue);
        const tiles = await tilesFromCollection(collection, meta.zoneColors, nuancier);
        const yarns = yarnColors(collection, meta.zoneColors, nuancier);
        // Assurer que le Motif primaire pointe sur cette collection.
        const motif = primaryMotifLayer(design.layers);
        let layers = design.layers;
        if (motif) {
          layers = design.layers.map((l) =>
            l.id === motif.id && l.kind === 'motif'
              ? {
                  ...l,
                  source: {
                    kind: 'collection' as const,
                    collectionId: meta.id,
                    colors: { ...meta.zoneColors },
                    paletteId: meta.paletteOptionId,
                  },
                }
              : l,
          );
        }
        update({
          design: {
            name: design.name,
            dimensions: design.dimensions,
            zones: design.zones,
            quantize: {
              ...design.quantize,
              paletteMode: 'manuelle',
              palette: yarns.map((y) => y.hex),
              maxColors: Math.max(2, Math.min(8, yarns.length)),
              paletteFromLayers: false,
            },
            decor: design.decor,
            layers,
          },
          tiles,
          embeddedAssets,
          selectedLayerId: motif?.id ?? design.layers.find((l) => l.kind === 'motif')?.id ?? 'fond',
          error: null,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Rechargement collection impossible.';
        update({
          design: {
            name: design.name,
            dimensions: design.dimensions,
            zones: design.zones,
            quantize: design.quantize,
            decor: design.decor,
            layers: design.layers,
          },
          tiles: project.tiles,
          embeddedAssets,
          error: `${message} Carreaux du projet utilisés.`,
        });
        return;
      }
    }
    update({
      design: {
        name: design.name,
        dimensions: design.dimensions,
        zones: design.zones,
        quantize: design.quantize,
        decor: design.decor,
        layers: design.layers,
      },
      tiles: project.tiles,
      embeddedAssets,
      error: `Collection « ${meta.id} » absente après synchronisation : carreaux du projet utilisés.`,
    });
    return;
  }
  update({
    design: {
      name: design.name,
      dimensions: design.dimensions,
      zones: design.zones,
      quantize: design.quantize,
      decor: design.decor,
      layers: design.layers,
    },
    tiles: project.tiles,
    embeddedAssets,
    error: null,
  });
}

let autosaveAssetsOmitted = false;

function scheduleSave(): void {
  if (suppressSideEffects()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const { design, tiles, embeddedAssets } = getState();
    void (async () => {
      try {
        let json = await serializeProject(design, tiles, {
          collection: currentCollectionMeta(),
          assets: embeddedAssets,
        });
        let omitAssets = false;
        if (projectByteLength(json) > AUTOSAVE_OMIT_ASSETS_BYTES && embeddedAssets.length > 0) {
          omitAssets = true;
          json = await serializeProject(design, tiles, {
            collection: currentCollectionMeta(),
            assets: embeddedAssets,
            omitAssets: true,
          });
        }
        await saveLastProject(json);
        if (omitAssets && !autosaveAssetsOmitted) {
          autosaveAssetsOmitted = true;
          update(
            {
              error:
                'Images non sauvegardées automatiquement (trop lourdes) : enregistrez le projet.',
            },
            { skipHistory: true },
          );
        }
        if (!omitAssets) autosaveAssetsOmitted = false;
      } catch {
        /* ignore autosave errors */
      }
    })();
  }, 200);
}

let shareTimer: number | undefined;
function scheduleShareHash(): void {
  if (suppressSideEffects()) return;
  window.clearTimeout(shareTimer);
  shareTimer = window.setTimeout(() => {
    const { design, embeddedAssets } = getState();
    const hasEmbedded = design.layers.some((l) => {
      if (l.kind !== 'image' || l.asset.kind !== 'embarquee') return false;
      const id = l.asset.assetId;
      return embeddedAssets.some((a) => a.id === id);
    });
    if (hasEmbedded) return;
    void buildShareUrl()
      .then((built) => {
        window.history.replaceState(null, '', `${window.location.pathname}${built.hash}`);
      })
      .catch(() => undefined);
  }, 500);
}

async function applyShare(parsed: ParsedShare): Promise<void> {
  const { catalogue } = getState();
  let design = parsed.designV2;

  if (parsed.activeCollectionId && catalogue) {
    const collection = catalogue.collections.find((c) => c.id === parsed.activeCollectionId);
    if (collection) {
      const colors = parsed.zoneColors ?? collection.couleursParDefaut;
      try {
        const tiles = await tilesFromCollection(collection, colors, nuancierMap(catalogue));
        const motif = primaryMotifLayer(design.layers);
        if (motif) {
          design = {
            ...design,
            layers: design.layers.map((l) =>
              l.id === motif.id && l.kind === 'motif'
                ? {
                    ...l,
                    source: {
                      kind: 'collection' as const,
                      collectionId: collection.id,
                      colors: { ...colors },
                      paletteId: parsed.paletteOptionId,
                    },
                  }
                : l,
            ),
          };
        }
        update(
          {
            design: {
              name: design.name,
              dimensions: design.dimensions,
              zones: design.zones,
              quantize: design.quantize,
              decor: design.decor,
              layers: design.layers,
            },
            tiles,
            selectedLayerId: motif?.id ?? 'fond',
            error: null,
          },
          { skipHistory: true },
        );
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Collection illisible.';
        update({ error: message }, { skipHistory: true });
      }
    } else {
      update(
        {
          error: `Collection « ${parsed.activeCollectionId} » absente : modèle par défaut.`,
        },
        { skipHistory: true },
      );
    }
  }
  if (parsed.tiles.length > 0) {
    const tiles: Awaited<ReturnType<typeof loadTileFromSvgText>>[] = [];
    for (const shared of parsed.tiles) {
      const tile = await loadTileFromSvgText(shared.svg, shared.name);
      if (shared.id) tile.id = shared.id;
      tiles.push(tile);
    }
    const motif = primaryMotifLayer(design.layers);
    if (motif?.source.kind === 'importes') {
      design = {
        ...design,
        layers: design.layers.map((l) =>
          l.id === motif.id && l.kind === 'motif'
            ? { ...l, source: { kind: 'importes' as const, tileIds: tiles.map((x) => x.id) } }
            : l,
        ),
      };
    }
    update(
      {
        design: {
          name: design.name,
          dimensions: design.dimensions,
          zones: design.zones,
          quantize: design.quantize,
          decor: design.decor,
          layers: design.layers,
        },
        tiles,
        selectedLayerId: motif?.id ?? 'fond',
        error: null,
      },
      { skipHistory: true },
    );
    return;
  }
  update(
    {
      design: {
        name: design.name,
        dimensions: design.dimensions,
        zones: design.zones,
        quantize: design.quantize,
        decor: design.decor,
        layers: design.layers,
      },
      tiles: [],
      error: null,
    },
    { skipHistory: true },
  );
}

async function boot(): Promise<void> {
  const bundle = await loadCatalogue();
  if (bundle.missing) {
    update({ catalogue: null, catalogueMissing: true }, { skipHistory: true });
  } else {
    const patch: Parameters<typeof update>[0] = {
      catalogue: bundle.catalogue,
      catalogueMissing: false,
    };
    if (bundle.presets && bundle.presets.length > 0) {
      patch.calepPresets = bundle.presets;
      patch.calepWarnings = bundle.warnings;
    }
    update(patch, { skipHistory: true });
  }

  const hashResult = await decodeShareHash(window.location.hash);
  if (hashResult.ok) {
    await applyShare(hashResult.parsed);
  } else {
    if (hashResult.reason === 'illisible' || hashResult.reason === 'version') {
      showShareHint(
        hashResult.reason === 'version'
          ? 'Lien d’une version plus récente : modèle par défaut.'
          : 'Lien illisible : modèle par défaut.',
      );
    }
    try {
      const saved = await loadLastProject();
      if (saved) await applyParsedProject(saved);
    } catch {
      // IndexedDB absent ou document illisible : le modèle par défaut reste en place.
    }
  }

  panelApi = mountPanel(panel, {
    tabs: optionsTabs,
    layerKeyColors: layerColorsOf,
    drawAssetPreview,
    sockPalette: () => patternPalette,
    exportImages: (request) => {
      const { design, footSide } = getState();
      const shape = shapeFromDesign(design.dimensions, design.zones, footSide);
      return runExports(
        {
          renderer: handle.renderer,
          scene: handle.scene,
          mesh: sock?.mesh ?? null,
          grid,
          aspect: stitchAspect(design.dimensions),
          modelName: design.name,
          sizeId: design.dimensions.size,
          redraw: () => handle.requestRender(),
          pairShape: { ...shape, side: 'droite' },
          pairZones: {
            heel: design.zones.heelColor,
            toe: design.zones.toeColor,
            rim: design.zones.cuffEnabled ? design.zones.cuffColor : undefined,
          },
          mirrorView: footSide === 'gauche',
          paletteLabels: yarnLegendLabels(),
          beforeRender: (cam, target) => decor.faceCamera(cam, target),
        },
        request,
      );
    },
    saveProject: async () => {
      const { design, tiles, embeddedAssets } = getState();
      const json = await serializeProject(design, tiles, {
        collection: currentCollectionMeta(),
        assets: embeddedAssets,
      });
      const bytes = projectByteLength(json);
      if (bytes > PROJECT_SIZE_WARN_BYTES) {
        const mo = (bytes / (1024 * 1024)).toFixed(1);
        const ok = window.confirm(
          `Le projet fait ${mo} Mo (seuil conseillé : 20 Mo). Enregistrer quand même ?`,
        );
        if (!ok) return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `${design.name || 'modele'}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    openProject: async (text) => {
      const project = await parseProject(text);
      await applyParsedProject(project);
    },
    leaveDev: () => {
      leaveDevMode(storage);
      applyShellMode(false);
    },
    copyShareLink: () => copyShareLink(),
  });
  subscribe(recompute);
  subscribe(scheduleSave);
  subscribe(scheduleShareHash);
  subscribe(() => {
    decor.sync();
  });
  subscribe(() => {
    dessinToolsApi?.sync();
  });
  recompute();
  scheduleShareHash();
  decor.sync();

  handle.controls.addEventListener('change', () => {
    const sim = window.__SIM__;
    if (!sim) return;
    sim.cameraPosition = {
      x: handle.camera.position.x,
      y: handle.camera.position.y,
      z: handle.camera.position.z,
    };
    sim.cameraTarget = {
      x: handle.controls.target.x,
      y: handle.controls.target.y,
      z: handle.controls.target.z,
    };
  });

  const viewKeyToName: Record<string, ViewName> = {
    f: 'face',
    t: 'trois-quarts',
    e: 'profil-exterieur',
    d: 'dos',
    i: 'profil-interieur',
  };

  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    const key = event.key.toLowerCase();
    if (event.shiftKey && !mod && !event.altKey && key === 'd' && !event.repeat) {
      event.preventDefault();
      const next = !devMode;
      if (next) enterDevMode(storage);
      else leaveDevMode(storage);
      applyShellMode(next);
      return;
    }
    if (key === 'r') {
      event.preventDefault();
      frameCamera('trois-quarts');
      publish();
      return;
    }
    const viewName = viewKeyToName[key];
    if (!viewName) return;
    event.preventDefault();
    frameCamera(viewName);
    publish();
  });
}

void boot();
