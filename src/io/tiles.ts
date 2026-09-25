import type { TileAsset } from '../core/types';

/** Erreur d'import affichée telle quelle dans le panneau. */
export class TileImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TileImportError';
  }
}

const SVG_MIN_SIDE = 512;
const PNG_MAX_SIDE = 1024;

let sequence = 0;

function nextTileId(): string {
  sequence += 1;
  return `tile-${sequence}`;
}

function detectSource(name: string, mime: string): TileAsset['source'] | null {
  const lowerName = name.toLowerCase();
  const lowerMime = mime.toLowerCase();
  if (lowerMime === 'image/png' || lowerName.endsWith('.png')) return 'png';
  if (lowerMime === 'image/svg+xml' || lowerName.endsWith('.svg')) return 'svg';
  return null;
}

function unsupported(name: string): TileImportError {
  return new TileImportError(`« ${name} » : format non pris en charge. Importez un PNG ou un SVG.`);
}

function loadImage(src: string, name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new TileImportError(`Impossible de lire « ${name} ».`));
    image.src = src;
  });
}

/**
 * SVG : le plus petit côté fait au moins 512 px, proportions conservées.
 * PNG : taille native, réduite pour que le plus grand côté fasse au plus 1024 px.
 */
function targetSize(width: number, height: number, source: TileAsset['source']): { width: number; height: number } {
  if (source === 'svg') {
    const minSide = Math.min(width, height);
    if (minSide < SVG_MIN_SIDE) {
      const scale = SVG_MIN_SIDE / minSide;
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
    }
  } else if (Math.max(width, height) > PNG_MAX_SIDE) {
    const scale = PNG_MAX_SIDE / Math.max(width, height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }
  return { width, height };
}

async function rasterize(
  src: string,
  name: string,
  source: TileAsset['source'],
  svgText?: string,
): Promise<TileAsset> {
  const image = await loadImage(src, name);
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (naturalWidth < 1 || naturalHeight < 1) {
    throw new TileImportError(`Impossible de lire « ${name} ».`);
  }
  const size = targetSize(naturalWidth, naturalHeight, source);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new TileImportError(`Impossible de lire « ${name} ».`);
  context.drawImage(image, 0, 0, size.width, size.height);
  const pixels = context.getImageData(0, 0, size.width, size.height);
  const tile: TileAsset = {
    id: nextTileId(),
    name,
    source,
    width: size.width,
    height: size.height,
    rgba: pixels.data,
  };
  if (svgText !== undefined) tile.svgText = svgText;
  return tile;
}

/** Importe un fichier choisi par l'utilisateur. */
export async function loadTileFromFile(file: File): Promise<TileAsset> {
  const source = detectSource(file.name, file.type);
  if (!source) throw unsupported(file.name);
  if (source === 'svg') {
    const svgText = await file.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      return await rasterize(url, file.name, source, svgText);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await rasterize(url, file.name, source);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Charge un carreau déjà servi par l'application (fixture ou URL locale). */
export async function loadTileFromUrl(url: string): Promise<TileAsset> {
  const name = decodeURIComponent(url.split('/').pop() || 'carreau');
  const source = detectSource(name, '');
  if (!source) throw unsupported(name);
  return rasterize(url, name, source);
}

/**
 * Rasterise un SVG déjà en mémoire (après recoloration).
 * Même règle de taille minimale que les imports SVG.
 */
export async function loadTileFromSvgText(svgText: string, name: string): Promise<TileAsset> {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    return await rasterize(url, name, 'svg', svgText);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Résout le nom passé à `loadFixture` vers l'URL d'une fixture. */
export function fixtureUrl(name: string): string {
  const trimmed = name.trim().replace(/^\/+/, '');
  const file = /\.(png|svg)$/i.test(trimmed) ? trimmed : `${trimmed}.svg`;
  const path = file.startsWith('fixtures/') ? file : `fixtures/${file}`;
  return `/${path}`;
}
