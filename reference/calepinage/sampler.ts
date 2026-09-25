/**
 * Échantillonnage maille par maille d'un calepinage multi-motifs — PUR.
 * Exemple de branchement du moteur (`calepinage.ts`) sur des images de carreaux RGBA.
 * L'application a son propre échantillonneur (`src/core/layout.ts`) : c'est lui qu'il faut adapter
 * en reprenant cette logique (plan des cases → case de la maille → rotation/miroir → pixel du motif).
 */
import {
  cellAtStitch, planPlacements, raccord,
  type CalepinageSpec, type Preset, type TileGeometry,
} from './calepinage';

export interface TileImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray | Uint8Array;
}

export interface SampleOptions {
  /** Rangs à calculer (tige + pied si le motif continue). */
  rows: number;
  /** Sur-échantillonnage par maille (n × n). */
  supersample?: number;
  gapColor: [number, number, number];
  sampling: 'majoritaire' | 'moyenne';
}

/** Renvoie les couleurs RGB (width = aiguilles, height = rows) du motif calepiné. */
export function samplePattern(
  tiles: TileImage[],
  spec: CalepinageSpec,
  geo: TileGeometry,
  preset: Preset | null,
  opt: SampleOptions,
): Uint8ClampedArray {
  const W = geo.needles;
  const H = opt.rows;
  const out = new Uint8ClampedArray(W * H * 3);
  const r = raccord(geo, spec, tiles.length, preset);
  const pitchX = geo.tileStitches + geo.gapStitches;
  const pitchY = geo.tileRows + geo.gapRows;
  // plan : on boucle sur le tour quand c'est possible (aléatoire sans couture)
  const nx = r.tilesAround ?? Math.ceil(W / pitchX) + 2;
  const ny = Math.ceil((H + Math.abs(geo.offsetRows) + pitchY) / pitchY) + 2;
  const plan = planPlacements(spec, { tileCount: tiles.length, preset, tilesAround: r.tilesAround }, nx, ny);
  const n = Math.max(1, opt.supersample ?? 3);
  const votes = new Map<number, number>();

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      votes.clear();
      let sr = 0, sg = 0, sb = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const hit = cellAtStitch(geo, x + (i + 0.5) / n, y + (j + 0.5) / n);
          let c0: number, c1: number, c2: number;
          if (hit.gap) {
            [c0, c1, c2] = opt.gapColor;
          } else {
            const cx = ((hit.cx % nx) + nx) % nx;
            const cy = ((hit.cy % ny) + ny) % ny;
            const p = plan[cy * nx + cx]!;
            const t = tiles[p.tile % tiles.length]!;
            const [a, b] = tileUVLocal(p.rot, p.flipX, p.flipY, hit.u, hit.v);
            const px = Math.min(t.width - 1, Math.floor(a * t.width));
            const py = Math.min(t.height - 1, Math.floor(b * t.height));
            const o = (py * t.width + px) * 4;
            c0 = t.rgba[o]!;
            c1 = t.rgba[o + 1]!;
            c2 = t.rgba[o + 2]!;
          }
          sr += c0; sg += c1; sb += c2;
          const key = (c0 << 16) | (c1 << 8) | c2;
          votes.set(key, (votes.get(key) ?? 0) + 1);
        }
      }
      const o = (y * W + x) * 3;
      if (opt.sampling === 'moyenne') {
        const k = n * n;
        out[o] = sr / k; out[o + 1] = sg / k; out[o + 2] = sb / k;
      } else {
        let best = 0, bestN = -1;
        for (const [key, cnt] of votes) if (cnt > bestN) { best = key; bestN = cnt; }
        out[o] = (best >> 16) & 255; out[o + 1] = (best >> 8) & 255; out[o + 2] = best & 255;
      }
    }
  }
  return out;
}

// copie locale de tileUV (évite une allocation de tableau par échantillon dans la boucle chaude)
function tileUVLocal(rot: number, fx: boolean, fy: boolean, u: number, v: number): [number, number] {
  const a = fx ? 1 - u : u;
  const b = fy ? 1 - v : v;
  if (rot === 90) return [b, 1 - a];
  if (rot === 180) return [1 - a, 1 - b];
  if (rot === 270) return [1 - b, a];
  return [a, b];
}
