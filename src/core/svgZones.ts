/**
 * Zones automatiques pour SVG (T44) — PUR, sans DOM.
 * Regroupe les formes par couleur de remplissage dans des `<g id="zone-N">`
 * et propose le code nuancier le plus proche (redmean).
 */
import { colorDistance, hexToRgb, normalizeHex } from './color';

export interface NuancierEntry {
  id: string;
  hex: string;
}

export interface SvgZoneDraft {
  id: string;
  fillHex: string;
  suggestedColorId: string | null;
  shapeCount: number;
  areaHint: number;
}

export interface SvgZonesResult {
  original: string;
  zoned: string;
  zones: SvgZoneDraft[];
  alreadyZoned: boolean;
}

const FILL_ATTR = /\bfill\s*=\s*["']([^"']+)["']/i;
const STYLE_FILL = /fill\s*:\s*([^;}"']+)/i;
const CLASS_ATTR = /\bclass\s*=\s*["']([^"']+)["']/i;
const SHAPE_TAG = /<(path|rect|circle|ellipse|polygon|polyline)\b([^>]*)(\/>|>[\s\S]*?<\/\1>)/gi;

function parseCssClassFills(svg: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of svg.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const fill = STYLE_FILL.exec(m[2] ?? '')?.[1]?.trim();
    const hex = fill ? tryHex(fill) : null;
    if (hex) map.set(m[1]!, hex);
  }
  return map;
}

function tryHex(value: string): string | null {
  const v = value.trim();
  if (/^none$/i.test(v) || /^url\(/i.test(v)) return null;
  try {
    return normalizeHex(v.startsWith('#') ? v : `#${v}`);
  } catch {
    return null;
  }
}

function shapeFill(attrs: string, classFills: Map<string, string>): string | null {
  const fromAttr = FILL_ATTR.exec(attrs)?.[1];
  if (fromAttr) {
    const hex = tryHex(fromAttr);
    if (hex) return hex;
  }
  const fromStyle = STYLE_FILL.exec(attrs)?.[1];
  if (fromStyle) {
    const hex = tryHex(fromStyle);
    if (hex) return hex;
  }
  const cls = CLASS_ATTR.exec(attrs)?.[1]?.split(/\s+/).find((c) => classFills.has(c));
  if (cls) return classFills.get(cls) ?? null;
  return null;
}

function nearestNuancier(hex: string, nuancier: readonly NuancierEntry[]): string | null {
  if (!nuancier.length) return null;
  const target = hexToRgb(hex);
  let best: string | null = null;
  let bestD = Infinity;
  for (const entry of nuancier) {
    let entryHex: string;
    try {
      entryHex = normalizeHex(entry.hex);
    } catch {
      continue;
    }
    const d = colorDistance(target, hexToRgb(entryHex));
    if (d < bestD) {
      bestD = d;
      best = entry.id;
    }
  }
  return best;
}

function hasZoneGroups(svg: string): boolean {
  return /<g\b[^>]*\bid\s*=\s*["']zone-\d+["']/i.test(svg);
}

/**
 * Si le SVG a déjà des `zone-N`, on les lit ; sinon on regroupe les formes par fill
 * (surface décroissante → zone-1, zone-2…).
 */
export function autoZoneSvg(
  svg: string,
  nuancier: readonly NuancierEntry[],
  lockedColors: ReadonlyMap<string, string> = new Map(),
): SvgZonesResult {
  if (hasZoneGroups(svg)) {
    return readExistingZones(svg, nuancier);
  }
  const classFills = parseCssClassFills(svg);
  const groups = new Map<string, { shapes: string[]; area: number }>();
  const matches: string[] = [];
  SHAPE_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SHAPE_TAG.exec(svg))) {
    const full = m[0]!;
    const attrs = m[2] ?? '';
    const fill = shapeFill(attrs, classFills);
    if (!fill) continue;
    matches.push(full);
    const area = Math.max(1, full.length);
    const g = groups.get(fill) ?? { shapes: [], area: 0 };
    g.shapes.push(full);
    g.area += area;
    groups.set(fill, g);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].area - a[1].area);
  const zones: SvgZoneDraft[] = sorted.map(([fill, g], index) => {
    const id = `zone-${index + 1}`;
    const suggested = lockedColors.get(fill) ?? nearestNuancier(fill, nuancier);
    return {
      id,
      fillHex: fill,
      suggestedColorId: suggested,
      shapeCount: g.shapes.length,
      areaHint: g.area,
    };
  });

  let rebuilt = svg;
  for (const full of matches) {
    rebuilt = rebuilt.replace(full, '');
  }
  const groupsXml = zones
    .map((z) => {
      const g = groups.get(z.fillHex)!;
      return `<g id="${z.id}" data-color-id="${z.suggestedColorId ?? ''}">${g.shapes.join('')}</g>`;
    })
    .join('');
  const close = rebuilt.lastIndexOf('</svg>');
  rebuilt =
    close >= 0 ? rebuilt.slice(0, close) + groupsXml + rebuilt.slice(close) : rebuilt + groupsXml;

  return { original: svg, zoned: rebuilt, zones, alreadyZoned: false };
}

function readExistingZones(svg: string, nuancier: readonly NuancierEntry[]): SvgZonesResult {
  const zones: SvgZoneDraft[] = [];
  const re = /<g\b([^>]*)>([\s\S]*?)<\/g>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const idm = /\bid\s*=\s*["'](zone-\d+)["']/i.exec(attrs);
    if (!idm) continue;
    const id = idm[1]!;
    const dataId = (/\bdata-color-id\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '').trim().toUpperCase() || null;
    const classFills = parseCssClassFills(svg);
    const fillGuess = shapeFill(body, classFills);
    const fromNuancier = dataId ? nuancier.find((n) => n.id === dataId)?.hex : undefined;
    const fillHex = tryHex(fillGuess ?? fromNuancier ?? '#000000') ?? '#000000';
    zones.push({
      id,
      fillHex,
      suggestedColorId: dataId ?? nearestNuancier(fillHex, nuancier),
      shapeCount: (body.match(/<(path|rect|circle|ellipse|polygon|polyline)\b/gi) ?? []).length,
      areaHint: body.length,
    });
  }
  zones.sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
  return { original: svg, zoned: svg, zones, alreadyZoned: true };
}

/** Identifiant collection : majuscules, sans accents, alphanumérique. */
export function collectionIdFromName(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 32);
  return ascii || 'COLLECTION';
}

/** Harmonise fillHex → colorId (première occurrence gagne). */
export function lockColorsAcrossVariations(results: SvgZonesResult[]): Map<string, string> {
  const locked = new Map<string, string>();
  for (const r of results) {
    for (const z of r.zones) {
      if (z.suggestedColorId && !locked.has(z.fillHex)) {
        locked.set(z.fillHex, z.suggestedColorId);
      }
    }
  }
  return locked;
}
