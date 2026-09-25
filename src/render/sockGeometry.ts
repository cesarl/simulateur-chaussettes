import * as THREE from 'three';
import { rowRanges } from '../core/grid';
import type { SockDimensions, ZoneSettings } from '../core/types';

/**
 * Chaussette portée, générée en grille (aiguilles + 1) × (rangs + 1).
 * Colonne 0 = côté intérieur. La moitié arrière descend en poche de talon ;
 * la moitié avant reste immobile pendant les rangs de talon.
 * Le pied part à l'horizontale, semelle plate, pointe refermée en un point.
 * 1 maille de large = 0,01 / maillesParCm mètres.
 */

export interface SockBuffers {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  needles: number;
  rows: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function bezier(a: number, b: number, c: number, t: number): number {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
}

/** Sommets de la chaussette, sans Three.js. */
export function sockPositions(dims: SockDimensions, zones: ZoneSettings): Float32Array {
  return buildSockBuffers(dims, zones).positions;
}

/** UV (colonne / aiguilles, rang / rangs), dans [0, 1]. */
export function sockUvs(dims: SockDimensions, zones: ZoneSettings): Float32Array {
  return buildSockBuffers(dims, zones).uvs;
}

export function buildSockBuffers(dims: SockDimensions, zones: ZoneSettings): SockBuffers {
  const ranges = rowRanges(dims, zones);
  const rows = ranges.toe.end;
  const needles = Math.max(1, dims.needles);
  const stride = needles + 1;
  const positions = new Float32Array(stride * (rows + 1) * 3);
  const uvs = new Float32Array(stride * (rows + 1) * 2);

  const stitchW = 0.01 / Math.max(dims.stitchesPerCm, 0.001);
  const stitchH = 0.01 / Math.max(dims.rowsPerCm, 0.001);
  const tubeRadius = (needles * stitchW) / (2 * Math.PI);
  const half = Math.floor(needles / 2);
  const legEnd = ranges.leg.end;
  const heelEnd = ranges.heel.end;
  const footEnd = ranges.foot.end;
  const cuffEnd = ranges.cuff.end;
  const yAnkle = -legEnd * stitchH;
  const soleDrop = tubeRadius * 1.35;
  const soleY = yAnkle - soleDrop;
  const footLength = Math.max(0, footEnd - heelEnd) * stitchH;
  const tipZ = tubeRadius * 0.25 + footLength + tubeRadius * 0.85;
  const tipY = yAnkle - soleDrop * 0.38;

  const backWeight = (col: number): number => {
    const wrapped = col >= needles ? 0 : col;
    if (wrapped >= half || half <= 0) return 0;
    const edge = Math.min(wrapped, half - wrapped);
    const taper = Math.max(1, half * 0.18);
    if (edge >= taper) return 1;
    return Math.sin((edge / taper) * Math.PI * 0.5);
  };

  const legPoint = (col: number, row: number): Vec3 => {
    const theta = (col / needles) * Math.PI * 2;
    const along = legEnd > 0 ? Math.min(1, row / legEnd) : 0;
    const calf = Math.sin(along * Math.PI);
    const cuff = cuffEnd > 0 && row < cuffEnd ? 0.9 + 0.1 * (row / cuffEnd) : 1;
    const radius = tubeRadius * (1 + 0.07 * calf) * cuff;
    return {
      x: Math.cos(theta) * radius,
      y: -row * stitchH,
      z: -Math.sin(theta) * radius,
    };
  };

  const footSection = (col: number): Vec3 => {
    const ankle = legPoint(col, legEnd);
    const weight = backWeight(col);
    if (weight === 0) return ankle;
    const flat = weight > 0.55 ? 1 : weight / 0.55;
    return {
      x: ankle.x * (1 - 0.18 * flat),
      y: ankle.y + (soleY - ankle.y) * flat,
      z: ankle.z * (1 - weight) + tubeRadius * 0.2 * weight,
    };
  };

  const pointAt = (col: number, row: number): Vec3 => {
    if (row <= legEnd) return legPoint(col, row);
    const section = footSection(col);
    if (row <= heelEnd) {
      const span = heelEnd - legEnd;
      const t = span === 0 ? 1 : (row - legEnd) / span;
      const ankle = legPoint(col, legEnd);
      const weight = backWeight(col);
      const controlZ = Math.min(ankle.z, section.z) - tubeRadius * 0.85 * weight;
      const controlY = (ankle.y + section.y) * 0.5;
      return {
        x: bezier(ankle.x, ankle.x, section.x, t),
        y: bezier(ankle.y, controlY, section.y, t),
        z: bezier(ankle.z, controlZ, section.z, t),
      };
    }
    const traveled = (Math.min(row, footEnd) - heelEnd) * stitchH;
    const foot = { x: section.x, y: section.y, z: section.z + traveled };
    if (row <= footEnd) return foot;
    const span = rows - footEnd;
    const t = span === 0 ? 1 : (row - footEnd) / span;
    const ease = Math.sin(t * Math.PI * 0.5);
    const bulge = Math.sin(t * Math.PI) * tubeRadius * 0.22 * backWeight(col);
    return {
      x: foot.x * (1 - ease),
      y: foot.y * (1 - ease) + tipY * ease - bulge * 0.2,
      z: foot.z * (1 - ease) + tipZ * ease + bulge,
    };
  };

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= needles; col++) {
      const point = pointAt(col, row);
      const position = (row * stride + col) * 3;
      positions[position] = point.x;
      positions[position + 1] = point.y;
      positions[position + 2] = point.z;
      const uv = (row * stride + col) * 2;
      uvs[uv] = col / needles;
      uvs[uv + 1] = rows === 0 ? 0 : row / rows;
    }
  }

  const triangles: number[] = [];
  const separated = (a: number, b: number): boolean => {
    const ax = positions[a * 3] ?? 0;
    const ay = positions[a * 3 + 1] ?? 0;
    const az = positions[a * 3 + 2] ?? 0;
    const bx = positions[b * 3] ?? 0;
    const by = positions[b * 3 + 1] ?? 0;
    const bz = positions[b * 3 + 2] ?? 0;
    const dx = ax - bx;
    const dy = ay - by;
    const dz = az - bz;
    return dx * dx + dy * dy + dz * dz > 1e-12;
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < needles; col++) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (!separated(a, b) && !separated(a, c) && !separated(a, d)) continue;
      triangles.push(a, c, d, a, d, b);
    }
  }

  return {
    positions,
    uvs,
    indices: Uint32Array.from(triangles),
    needles,
    rows,
  };
}

function sanitizeNormals(geometry: THREE.BufferGeometry): void {
  const attribute = geometry.getAttribute('normal');
  if (!(attribute instanceof THREE.BufferAttribute)) return;
  const array = attribute.array;
  for (let i = 0; i < array.length; i += 3) {
    const x = array[i] ?? 0;
    const y = array[i + 1] ?? 0;
    const z = array[i + 2] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      array[i] = 0;
      array[i + 1] = 1;
      array[i + 2] = 0;
    }
  }
  attribute.needsUpdate = true;
}

/** Maillage Three.js : 1 quad par maille, normales et tangentes pour le relief. */
export function createSockMesh(dims: SockDimensions, zones: ZoneSettings, material: THREE.Material): THREE.Mesh {
  const buffers = buildSockBuffers(dims, zones);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
  geometry.computeVertexNormals();
  sanitizeNormals(geometry);
  geometry.computeTangents();
  return new THREE.Mesh(geometry, material);
}
