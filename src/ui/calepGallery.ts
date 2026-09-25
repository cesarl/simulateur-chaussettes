/**
 * Galerie de calepinages : vignettes, filtre, personnalisation, nouveau tirage.
 */
import {
  GENERATED_PRESETS,
  normalizePresets,
  planPlacements,
  type CalepinageSpec,
  type GeneratedSpec,
  type ModeRotation,
  type Ordre,
  type Preset,
  type Rot,
} from '../core/calepinage';
import { BUILTIN_PRESETS, BUILTIN_PRESET_WARNINGS } from '../core/presets';
import type { TileAsset } from '../core/types';
import { getState, update } from '../state';
import { makeSelect } from './controls';

export type CalepFilter = 'tous' | 'le' | 'exact';

const FAMILLE_ORDER = [
  'Rosaces',
  'Compositions',
  'Damier',
  'Damier iflip',
  'Damier, rotation aléatoire',
  'Lianes',
  'Ophis',
  'Aléatoire',
];

function isRandomSpec(spec: CalepinageSpec, preset: Preset | null): boolean {
  if (spec.source === 'prereglage') return preset?.aleatoire ?? false;
  const g = spec.genere;
  return (
    g.ordre === 'aleatoire' ||
    g.ordre === 'aleatoire-sans-voisin' ||
    g.rotation === 'aleatoire-90' ||
    g.rotation === 'aleatoire-180'
  );
}

function matchesFilter(needed: number, tileCount: number, filter: CalepFilter): boolean {
  const n = Math.max(0, tileCount);
  if (filter === 'tous') return true;
  // Sans carreau : on affiche tout (aperçus numérotés).
  if (n === 0) return true;
  if (filter === 'exact') return needed === n;
  return needed <= n;
}

function specFromGenerated(id: string, current: CalepinageSpec): CalepinageSpec | null {
  const g = GENERATED_PRESETS.find((item) => item.id === id);
  if (!g) return null;
  return {
    source: 'genere',
    presetId: null,
    genere: { ...g.genere },
    appareil: g.appareil ?? current.appareil,
    rotationGlobale: current.rotationGlobale,
    graine: current.graine,
  };
}

function specFromPreset(preset: Preset, current: CalepinageSpec): CalepinageSpec {
  return {
    source: 'prereglage',
    presetId: preset.id,
    genere: { ...current.genere },
    appareil: current.appareil,
    rotationGlobale: current.rotationGlobale,
    graine: current.graine,
  };
}

function selectedId(spec: CalepinageSpec): string | null {
  if (spec.source === 'prereglage') return spec.presetId;
  const found = GENERATED_PRESETS.find(
    (g) =>
      g.genere.ordre === spec.genere.ordre &&
      g.genere.pasRangee === spec.genere.pasRangee &&
      g.genere.rotation === spec.genere.rotation &&
      g.genere.rotationFixe === spec.genere.rotationFixe &&
      (g.appareil ?? 'droit') === spec.appareil,
  );
  return found?.id ?? null;
}

/** Dessine un aperçu 2×2 blocs sur un canvas. */
export function paintCalepThumb(
  canvas: HTMLCanvasElement,
  spec: CalepinageSpec,
  preset: Preset | null,
  tiles: readonly TileAsset[],
  size = 72,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = size;
  canvas.height = size;
  const cell = Math.floor(size / 4);
  const nx = 4;
  const ny = 4;
  const tileCount = Math.max(1, tiles.length);
  const plan = planPlacements(spec, { tileCount, preset, tilesAround: nx }, nx, ny);
  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(0, 0, size, size);
  for (let cy = 0; cy < ny; cy++) {
    for (let cx = 0; cx < nx; cx++) {
      const p = plan[cy * nx + cx]!;
      const x = cx * cell;
      const y = cy * cell;
      const tile = tiles[p.tile % tileCount];
      if (tile && tile.width > 0) {
        // pastille couleur moyenne du carreau
        let r = 0, g = 0, b = 0, n = 0;
        const step = Math.max(1, Math.floor((tile.width * tile.height) / 64));
        for (let i = 0; i < tile.width * tile.height; i += step) {
          const o = i * 4;
          if ((tile.rgba[o + 3] ?? 0) < 128) continue;
          r += tile.rgba[o] ?? 0;
          g += tile.rgba[o + 1] ?? 0;
          b += tile.rgba[o + 2] ?? 0;
          n += 1;
        }
        if (n > 0) {
          ctx.fillStyle = `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`;
        } else {
          ctx.fillStyle = '#c8c3b8';
        }
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      } else {
        ctx.fillStyle = '#c8c3b8';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.fillStyle = '#5a564e';
        ctx.font = `${Math.max(9, cell - 6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.tile + 1), x + cell / 2, y + cell / 2);
      }
      if (p.rot !== 0 || p.flipX || p.flipY) {
        ctx.strokeStyle = 'rgba(29,29,27,0.35)';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 2);
        if (p.rot === 90) ctx.lineTo(x + cell - 2, y + 2);
        else if (p.rot === 180) ctx.lineTo(x + cell - 2, y + cell - 2);
        else if (p.rot === 270) ctx.lineTo(x + 2, y + cell - 2);
        else ctx.lineTo(x + cell - 2, y + cell / 2);
        ctx.stroke();
      }
    }
  }
}

export function mountCalepGallery(host: HTMLElement): {
  sync: (tiles: readonly TileAsset[], spec: CalepinageSpec, presets: readonly Preset[]) => void;
} {
  let filter: CalepFilter = 'le';
  let presets: readonly Preset[] = BUILTIN_PRESETS;
  let warnings: readonly string[] = BUILTIN_PRESET_WARNINGS;

  const root = document.createElement('div');
  root.dataset.testid = 'calep-gallery';
  root.className = 'calep-gallery';

  const filterSelect = makeSelect(
    'Nombre de motifs',
    'calep-filter',
    [
      { value: 'tous', label: 'tous' },
      { value: 'le', label: '≤ nombre importé' },
      { value: 'exact', label: 'exactement le nombre importé' },
    ],
    filter,
    (value) => {
      if (value === 'tous' || value === 'le' || value === 'exact') {
        filter = value;
        render();
      }
    },
  );

  const rapidesTitle = document.createElement('h3');
  rapidesTitle.className = 'calep-group-title';
  rapidesTitle.textContent = 'Rapides';
  const rapides = document.createElement('div');
  rapides.className = 'calep-thumbs';
  rapides.dataset.testid = 'calep-rapides';

  const presetsHost = document.createElement('div');
  presetsHost.dataset.testid = 'calep-presets';

  const reroll = document.createElement('button');
  reroll.type = 'button';
  reroll.dataset.testid = 'calep-reroll';
  reroll.textContent = 'Nouveau tirage';
  reroll.hidden = true;
  reroll.addEventListener('click', () => {
    const current = getState().design.layout.calepinage;
    update({ design: { layout: { calepinage: { graine: current.graine + 1 } } } });
  });

  const custom = document.createElement('details');
  custom.dataset.testid = 'calep-custom';
  custom.className = 'calep-custom';
  const customSummary = document.createElement('summary');
  customSummary.textContent = 'Personnaliser';
  custom.appendChild(customSummary);
  const customBody = document.createElement('div');
  custom.appendChild(customBody);

  const ordre = makeSelect(
    'Ordre',
    'calep-ordre',
    [
      { value: 'unique', label: 'Un seul motif' },
      { value: 'suite', label: 'À la suite' },
      { value: 'aleatoire', label: 'Aléatoire' },
      { value: 'aleatoire-sans-voisin', label: 'Aléatoire sans voisins' },
    ],
    'unique',
    (value) => patchGenere({ ordre: value as Ordre }),
  );
  const pas = makeSelect(
    'Pas de rangée',
    'calep-pas',
    [
      { value: '0', label: '0 (colonnes)' },
      { value: '1', label: '1 (diagonale)' },
    ],
    '1',
    (value) => patchGenere({ pasRangee: Number(value) }),
  );
  const rotation = makeSelect(
    'Rotation',
    'calep-mode-rot',
    [
      { value: 'aucune', label: 'Aucune' },
      { value: 'fixe', label: 'Fixe' },
      { value: 'suite-90', label: '+90° à chaque carreau' },
      { value: 'aleatoire-90', label: 'Aléatoire 90°' },
      { value: 'aleatoire-180', label: 'Aléatoire 180°' },
      { value: 'rosace', label: 'Rosace' },
      { value: 'miroir', label: 'Miroir' },
    ],
    'aucune',
    (value) => patchGenere({ rotation: value as ModeRotation }),
  );
  const rotFixe = makeSelect(
    'Angle fixe',
    'calep-rot-fixe',
    [
      { value: '0', label: '0°' },
      { value: '90', label: '90°' },
      { value: '180', label: '180°' },
      { value: '270', label: '270°' },
    ],
    '0',
    (value) => patchGenere({ rotationFixe: Number(value) as Rot }),
  );
  const appareil = makeSelect(
    'Appareillage',
    'calep-appareil',
    [
      { value: 'droit', label: 'Droit' },
      { value: 'quinconce-h', label: 'Quinconce horizontal' },
      { value: 'quinconce-v', label: 'Quinconce vertical' },
    ],
    'droit',
    (value) => {
      const current = getState().design.layout.calepinage;
      update({
        design: {
          layout: {
            calepinage: {
              source: 'genere',
              presetId: null,
              genere: { ...current.genere },
              appareil: value as CalepinageSpec['appareil'],
              rotationGlobale: current.rotationGlobale,
              graine: current.graine,
            },
          },
        },
      });
    },
  );
  const rotGlobale = makeSelect(
    'Rotation globale',
    'calep-rot-globale',
    [
      { value: '0', label: '0°' },
      { value: '90', label: '90°' },
      { value: '180', label: '180°' },
      { value: '270', label: '270°' },
    ],
    '0',
    (value) => {
      const current = getState().design.layout.calepinage;
      update({
        design: {
          layout: {
            calepinage: {
              ...current,
              source: 'genere',
              presetId: null,
              rotationGlobale: Number(value) as Rot,
            },
          },
        },
      });
    },
  );
  customBody.append(ordre.root, pas.root, rotation.root, rotFixe.root, appareil.root, rotGlobale.root);

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.dataset.testid = 'calep-import-presets';
  importBtn.textContent = 'Importer des préréglages (.json)';
  const importFile = document.createElement('input');
  importFile.type = 'file';
  importFile.accept = 'application/json,.json';
  importFile.hidden = true;
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      const result = normalizePresets(raw);
      if (result.presets.length === 0) {
        update({ error: 'Aucun préréglage lisible dans le fichier.' });
        return;
      }
      presets = result.presets;
      warnings = result.warnings;
      update({ calepPresets: [...result.presets], calepWarnings: [...result.warnings], error: null });
      render();
    } catch {
      update({ error: 'Fichier de préréglages illisible.' });
    }
  });

  const warnDetails = document.createElement('details');
  warnDetails.className = 'calep-warnings';
  warnDetails.dataset.testid = 'calep-warnings';
  const warnSummary = document.createElement('summary');
  warnSummary.textContent = 'Avertissements d’import';
  const warnBody = document.createElement('pre');
  warnBody.className = 'hint';
  warnDetails.append(warnSummary, warnBody);

  root.append(
    filterSelect.root,
    rapidesTitle,
    rapides,
    presetsHost,
    reroll,
    custom,
    importBtn,
    importFile,
    warnDetails,
  );
  host.appendChild(root);

  function patchGenere(partial: Partial<GeneratedSpec>): void {
    const current = getState().design.layout.calepinage;
    update({
      design: {
        layout: {
          calepinage: {
            source: 'genere',
            presetId: null,
            genere: { ...current.genere, ...partial },
            appareil: current.appareil,
            rotationGlobale: current.rotationGlobale,
            graine: current.graine,
          },
        },
      },
    });
  }

  function makeThumb(
    id: string,
    label: string,
    needed: number,
    tileCount: number,
    spec: CalepinageSpec,
    preset: Preset | null,
    tiles: readonly TileAsset[],
    selected: boolean,
    onClick: () => void,
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = selected ? 'calep-thumb selected' : 'calep-thumb';
    btn.dataset.testid = `calep-thumb-${id}`;
    btn.title = label;
    const canvas = document.createElement('canvas');
    paintCalepThumb(canvas, spec, preset, tiles);
    const name = document.createElement('span');
    name.className = 'calep-thumb-name';
    name.textContent = label;
    const badge = document.createElement('span');
    badge.className = tileCount > 0 && needed > tileCount ? 'calep-badge warn' : 'calep-badge';
    badge.textContent = tileCount > 0 && needed > tileCount ? 'motifs réutilisés' : `${needed} motif${needed > 1 ? 's' : ''}`;
    btn.append(canvas, name, badge);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function render(): void {
    const state = getState();
    const tiles = state.tiles;
    const spec = state.design.layout.calepinage;
    const tileCount = tiles.length;
    const currentId = selectedId(spec);
    const preset = spec.source === 'prereglage' ? presets.find((p) => p.id === spec.presetId) ?? null : null;

    rapides.replaceChildren();
    for (const g of GENERATED_PRESETS) {
      const needed = 1;
      if (!matchesFilter(needed, tileCount, filter)) continue;
      const gSpec = specFromGenerated(g.id, spec)!;
      rapides.appendChild(
        makeThumb(
          g.id,
          g.nom,
          needed,
          tileCount,
          gSpec,
          null,
          tiles,
          currentId === g.id,
          () => update({ design: { layout: { calepinage: gSpec } } }),
        ),
      );
    }

    presetsHost.replaceChildren();
    const byFamille = new Map<string, Preset[]>();
    for (const p of presets) {
      if (!matchesFilter(Math.max(1, p.tilesUsed || 1), tileCount, filter)) continue;
      const list = byFamille.get(p.famille) ?? [];
      list.push(p);
      byFamille.set(p.famille, list);
    }
    const families = [
      ...FAMILLE_ORDER.filter((f) => byFamille.has(f)),
      ...[...byFamille.keys()].filter((f) => !FAMILLE_ORDER.includes(f)).sort(),
    ];
    for (const famille of families) {
      const title = document.createElement('h3');
      title.className = 'calep-group-title';
      title.textContent = famille === 'Damier, rotation aléatoire' ? 'Damier rotation aléatoire' : famille;
      const row = document.createElement('div');
      row.className = 'calep-thumbs';
      for (const p of byFamille.get(famille) ?? []) {
        const needed = Math.max(1, p.tilesUsed || 1);
        const pSpec = specFromPreset(p, spec);
        row.appendChild(
          makeThumb(
            p.id,
            p.nom,
            needed,
            tileCount,
            pSpec,
            p,
            tiles,
            currentId === p.id,
            () => update({ design: { layout: { calepinage: pSpec } } }),
          ),
        );
      }
      presetsHost.append(title, row);
    }

    reroll.hidden = !isRandomSpec(spec, preset);
    ordre.input.value = spec.genere.ordre;
    pas.input.value = String(spec.genere.pasRangee);
    rotation.input.value = spec.genere.rotation;
    rotFixe.input.value = String(spec.genere.rotationFixe);
    appareil.input.value = spec.appareil;
    rotGlobale.input.value = String(spec.rotationGlobale);

    warnBody.textContent = warnings.join('\n');
    warnDetails.hidden = warnings.length === 0;
  }

  function sync(tiles: readonly TileAsset[], spec: CalepinageSpec, library: readonly Preset[]): void {
    void tiles;
    void spec;
    if (library.length) presets = library;
    const state = getState();
    if (state.calepWarnings) warnings = state.calepWarnings;
    render();
  }

  render();
  return { sync };
}
