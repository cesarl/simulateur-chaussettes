/** Séparateurs déplaçables entre zones, mémorisés en localStorage. */

const STORAGE_KEY = 'sim-layout-splits';

export interface SplitState {
  /** Part de la colonne 2D dans (2D+3D), 0.2–0.8 */
  viewsRatio: number;
  /** Largeur du panneau d'options en px */
  optsWidth: number;
}

const DEFAULTS: SplitState = { viewsRatio: 0.5, optsWidth: 360 };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readStored(storage: Storage | null): SplitState {
  if (!storage) return { ...DEFAULTS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
    const o = parsed as Record<string, unknown>;
    return {
      viewsRatio:
        typeof o.viewsRatio === 'number' ? clamp(o.viewsRatio, 0.2, 0.8) : DEFAULTS.viewsRatio,
      optsWidth:
        typeof o.optsWidth === 'number' ? clamp(o.optsWidth, 240, 560) : DEFAULTS.optsWidth,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeStored(storage: Storage | null, state: SplitState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / privé */
  }
}

function applyCss(state: SplitState): void {
  const app = document.getElementById('app');
  if (!(app instanceof HTMLElement)) return;
  const left = state.viewsRatio;
  const right = 1 - left;
  app.style.setProperty('--col-views-left', `${left}fr`);
  app.style.setProperty('--col-views-right', `${right}fr`);
  app.style.setProperty('--col-opts', `${Math.round(state.optsWidth)}px`);
}

/**
 * Branche les séparateurs verticaux (2D|3D et vues|options).
 * Ne fait rien si les éléments sont absents.
 */
export function mountSplitters(storage: Storage | null): void {
  const splitV = document.getElementById('split-v');
  const splitH = document.getElementById('split-h');
  const app = document.getElementById('app');
  if (
    !(splitV instanceof HTMLElement) ||
    !(splitH instanceof HTMLElement) ||
    !(app instanceof HTMLElement)
  ) {
    return;
  }

  let state = readStored(storage);
  applyCss(state);

  function persist(): void {
    writeStored(storage, state);
    applyCss(state);
  }

  function drag(
    el: HTMLElement,
    onMove: (clientX: number) => void,
  ): void {
    const onPointerMove = (event: PointerEvent) => {
      onMove(event.clientX);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      persist();
    };
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      onMove(event.clientX);
    });
  }

  drag(splitV, (clientX) => {
    const wrap2 = document.getElementById('view2d-wrap');
    const wrap3 = document.getElementById('view3d-wrap');
    if (!(wrap2 instanceof HTMLElement) || !(wrap3 instanceof HTMLElement)) return;
    const left = wrap2.getBoundingClientRect().left;
    const right = wrap3.getBoundingClientRect().right;
    const total = right - left;
    if (total < 40) return;
    state = { ...state, viewsRatio: clamp((clientX - left) / total, 0.2, 0.8) };
    applyCss(state);
  });

  drag(splitH, (clientX) => {
    const rect = app.getBoundingClientRect();
    const fromRight = rect.right - clientX;
    state = { ...state, optsWidth: clamp(fromRight, 240, Math.min(560, rect.width * 0.45)) };
    applyCss(state);
  });
}
