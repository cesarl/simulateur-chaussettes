/**
 * Cartes de détail d'UNE maille de jersey (le « V »), générées par calcul — PUR, sans DOM.
 * Elles sont répétées une fois par maille sur la chaussette (uvStitch = (colonne, rang)).
 *
 *  - hauteur : deux jambes de boucle inclinées, fil rond, légère torsion du fil (plis) ;
 *  - normales : dérivées de la hauteur ;
 *  - occlusion : creux entre les boucles plus sombres.
 * La tuile est raccordable dans les deux directions (calcul avec repliement).
 */

export interface KnitMaps {
  size: number;
  normal: Uint8Array; // RGBA
  ao: Uint8Array; // RGBA (canal R utilisé par Three.js)
  height: Float32Array;
}

/** Hauteur d'une jambe de boucle : capsule inclinée, section ronde, avec torsion du fil. */
function legHeight(u: number, v: number, cx: number, angle: number, halfLen: number, radius: number): number {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  let best = 0;
  // repliement : on teste les cellules voisines pour une tuile sans couture
  for (let du = -1; du <= 1; du++) {
    for (let dv = -1; dv <= 1; dv++) {
      const x = u + du - cx;
      const y = v + dv - 0.5;
      const along = x * sa + y * ca; // axe de la jambe
      const across = x * ca - y * sa;
      const t = Math.max(-halfLen, Math.min(halfLen, along));
      const dAlong = along - t;
      const d = Math.hypot(across, dAlong) / radius;
      if (d < 1) {
        const round = Math.sqrt(1 - d * d);
        const ply = 0.06 * Math.sin((along * 2.2 + across * 0.9) * 2 * Math.PI * 3.2);
        // la boucle plonge sous la maille voisine à ses extrémités
        const dip = 1 - 0.35 * Math.pow(Math.abs(t / halfLen), 3);
        best = Math.max(best, (round + ply * round) * dip);
      }
    }
  }
  return best;
}

export function buildKnitMaps(size = 64, strength = 2.2): KnitMaps {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // Le V pointe vers le haut de la chaussette (petits v). Deux jambes symétriques.
      const left = legHeight(u, v, 0.28, -0.52, 0.42, 0.25);
      const right = legHeight(u, v, 0.72, 0.52, 0.42, 0.25);
      height[y * size + x] = Math.max(left, right);
    }
  }
  const normal = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  const H = (x: number, y: number) => height[(((y + size) % size) * size + ((x + size) % size))]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 0.5 * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 0.5 * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (y * size + x) * 4;
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
      const h = H(x, y);
      const a = Math.round(255 * (0.42 + 0.58 * Math.min(1, h * 1.25)));
      ao[o] = a;
      ao[o + 1] = a;
      ao[o + 2] = a;
      ao[o + 3] = 255;
    }
  }
  return { size, normal, ao, height };
}
