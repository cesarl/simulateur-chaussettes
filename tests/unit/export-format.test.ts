import { describe, expect, it } from 'vitest';
import { EXPORT_ASPECT, exportFrameSize } from '../../src/render/sock3d/studio';
import { PAIR_POSE } from '../../src/io/exportPng';

describe('format et pose des exports 3D', () => {
  it('images en 4:5 portrait (hauteur = taille choisie)', () => {
    expect(EXPORT_ASPECT).toBeCloseTo(0.8, 9);
    expect(exportFrameSize(1024)).toEqual({ width: 819, height: 1024 });
    expect(exportFrameSize(2048)).toEqual({ width: 1638, height: 2048 });
    expect(exportFrameSize(4096)).toEqual({ width: 3277, height: 4096 });
    expect(exportFrameSize(512, 1)).toEqual({ width: 512, height: 512 }); // vignettes de la planche
  });

  it('paire : une de face, une de profil, environ 80° entre les pieds', () => {
    const angle = PAIR_POSE.profile.rotationDeg - PAIR_POSE.front.rotationDeg;
    expect(angle).toBeGreaterThanOrEqual(75);
    expect(angle).toBeLessThanOrEqual(85);
    expect(Math.abs(PAIR_POSE.front.rotationDeg)).toBeLessThanOrEqual(15); // pointe vers l'objectif
    expect(PAIR_POSE.profile.position[2]).toBeLessThan(PAIR_POSE.front.position[2]); // profil en retrait
  });
});
