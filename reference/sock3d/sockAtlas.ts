/**
 * Atlas couleur de la chaussette 3D — calcul PUR.
 *
 * L'atlas a une colonne par aiguille (largeur = W, lecture « au plus proche » : une maille = un texel en
 * largeur) et une hauteur qui échantillonne finement l'abscisse s de la forme. Chaque texel va chercher
 * la couleur de la maille correspondante dans la grille, via `fabricAt`. C'est ce qui garantit que le
 * motif 3D est EXACTEMENT la grille, y compris autour du talon.
 */
import { fabricAt, sockLayout, ZONE_HEEL, ZONE_RIM, ZONE_TOE, type SockShapeInput } from './sockShape';

export interface GridLike {
  width: number;
  height: number;
  palette: string[]; // '#rrggbb'
  colorIndex: Uint8Array; // width × height, rang 0 = haut
}

export interface ZoneColorsLike {
  heel: string;
  toe: string;
  /** Couleur de l'intérieur de l'ourlet (par défaut : couleur du rang 0). */
  rim?: string;
}

export interface Atlas {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, ligne 0 = BAS de l'image (convention WebGL / DataTexture flipY=false)
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * @param texelsPerRow finesse verticale de l'atlas (texels par rang de tricot) ; 3 suffit.
 */
export function buildSockAtlas(shape: SockShapeInput, grid: GridLike, zones: ZoneColorsLike, texelsPerRow = 3): Atlas {
  const L = sockLayout(shape);
  const W = grid.width;
  const span = L.sTip - L.sMin;
  const height = Math.min(8192, Math.ceil((span / L.rowH) * texelsPerRow));
  const data = new Uint8Array(W * height * 4);
  const pal = grid.palette.map(hexToRgb);
  const heel = hexToRgb(zones.heel);
  const toe = hexToRgb(zones.toe);
  const rimIdx = grid.colorIndex[0] ?? 0;
  const rim = zones.rim ? hexToRgb(zones.rim) : (pal[rimIdx] ?? [200, 200, 200]);
  const maxRow = grid.height - 1;

  for (let y = 0; y < height; y++) {
    // y = 0 en bas de la texture ⇒ v = 0 ⇒ s = sTip
    const v = (y + 0.5) / height;
    const s = L.sMin + (1 - v) * span;
    for (let col = 0; col < W; col++) {
      const phi = ((col + 0.5) / W) * Math.PI * 2;
      const f = fabricAt(L, phi, s);
      let rgb: [number, number, number];
      if (f.zone === ZONE_RIM) rgb = zones.rim ? rim : (pal[grid.colorIndex[col] ?? 0] ?? rim); // prolonge la colonne
      else if (f.zone === ZONE_HEEL) rgb = heel;
      else if (f.zone === ZONE_TOE) rgb = toe;
      else {
        const row = Math.min(maxRow, Math.max(0, Math.floor(f.row)));
        const idx = grid.colorIndex[row * W + col] ?? 0;
        rgb = pal[idx] ?? [255, 0, 255];
      }
      const o = (y * W + col) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
  }
  return { width: W, height, data };
}
