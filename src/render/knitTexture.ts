import * as THREE from 'three';
import { hexToRgb } from '../core/color';
import type { StitchGrid } from '../core/types';

/**
 * Texture de couleur de la grille (1 texel = 1 maille) et relief de jersey.
 * Le V est une carte de normales + une occlusion, répétées une fois par maille.
 * Le bord-côte remplace ce relief par des côtes verticales.
 */

const TILE = 128;

export interface KnitMaterial {
  material: THREE.MeshStandardMaterial;
  updateGrid: (grid: StitchGrid) => void;
  setLayout: (needles: number, rows: number, cuffRows: number) => void;
  dispose: () => void;
}

interface DetailMaps {
  jerseyNormal: THREE.DataTexture;
  jerseyAo: THREE.DataTexture;
  ribNormal: THREE.DataTexture;
  ribAo: THREE.DataTexture;
}

let detailMaps: DetailMaps | null = null;

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const length2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / length2));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.hypot(dx, dy);
}

function jerseyHeight(size: number): Float32Array {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = distToSegment(x, y, size * 0.08, size * 0.02, size * 0.5, size * 0.96);
      const right = distToSegment(x, y, size * 0.92, size * 0.02, size * 0.5, size * 0.96);
      const ridge = Math.exp(-(Math.min(left, right) ** 2) / (2 * 6.5 * 6.5));
      height[y * size + x] = 0.22 + 0.78 * ridge;
    }
  }
  return height;
}

function ribHeight(size: number): Float32Array {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin((x / size) * Math.PI * 2);
      height[y * size + x] = 0.5 + 0.5 * wave;
    }
  }
  return height;
}

function mapsFromHeight(height: Float32Array, size: number, strength: number): { normal: Uint8Array; ao: Uint8Array } {
  const normal = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = height[y * size + ((x + size - 1) % size)] ?? 0;
      const hR = height[y * size + ((x + 1) % size)] ?? 0;
      const hD = height[((y + size - 1) % size) * size + x] ?? 0;
      const hU = height[((y + 1) % size) * size + x] ?? 0;
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const index = (y * size + x) * 4;
      normal[index] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[index + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[index + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[index + 3] = 255;
      const occlusion = Math.round((0.35 + 0.65 * (height[y * size + x] ?? 0)) * 255);
      ao[index] = occlusion;
      ao[index + 1] = occlusion;
      ao[index + 2] = occlusion;
      ao[index + 3] = 255;
    }
  }
  return { normal, ao };
}

function linearTexture(data: Uint8Array, size: number, anisotropy: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function detailTextures(anisotropy: number): DetailMaps {
  if (detailMaps) {
    detailMaps.jerseyNormal.anisotropy = anisotropy;
    detailMaps.jerseyAo.anisotropy = anisotropy;
    detailMaps.ribNormal.anisotropy = anisotropy;
    detailMaps.ribAo.anisotropy = anisotropy;
    return detailMaps;
  }
  const jersey = mapsFromHeight(jerseyHeight(TILE), TILE, 7);
  const rib = mapsFromHeight(ribHeight(TILE), TILE, 5);
  detailMaps = {
    jerseyNormal: linearTexture(jersey.normal, TILE, anisotropy),
    jerseyAo: linearTexture(jersey.ao, TILE, anisotropy),
    ribNormal: linearTexture(rib.normal, TILE, anisotropy),
    ribAo: linearTexture(rib.ao, TILE, anisotropy),
  };
  return detailMaps;
}

function fillGrid(data: Uint8Array, grid: StitchGrid): void {
  const cells = grid.width * grid.height;
  for (let i = 0; i < cells; i++) {
    const paletteIndex = grid.colorIndex[i] ?? 0;
    const rgb = hexToRgb(grid.palette[paletteIndex] ?? '#d9d4cc');
    const offset = i * 4;
    data[offset] = rgb.r;
    data[offset + 1] = rgb.g;
    data[offset + 2] = rgb.b;
    data[offset + 3] = 255;
  }
}

function createGridTexture(grid: StitchGrid): THREE.DataTexture {
  const data = new Uint8Array(Math.max(1, grid.width) * Math.max(1, grid.height) * 4);
  fillGrid(data, grid);
  const texture = new THREE.DataTexture(data, Math.max(1, grid.width), Math.max(1, grid.height), THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

const NORMAL_FRAGMENT = /* glsl */`
#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	if (cuffEndV > 0.0 && vMapUv.y < cuffEndV) {
		vec3 ribN = texture2D( ribNormalMap, vec2(vMapUv.x * ribRepeat.x, 0.5) ).xyz * 2.0 - 1.0;
		mapN = ribN;
	}
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`;

const AO_FRAGMENT = /* glsl */`
#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	if (cuffEndV > 0.0 && vMapUv.y < cuffEndV) {
		float ribOcclusion = texture2D( ribAoMap, vec2(vMapUv.x * ribRepeat.x, 0.5) ).r;
		ambientOcclusion = mix(1.0, ribOcclusion, aoMapIntensity);
	}
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT )
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN )
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif
`;

/** Matériau tricot : grille au plus proche, relief de maille, intérieur assombri. */
export function createKnitMaterial(grid: StitchGrid, renderer: THREE.WebGLRenderer): KnitMaterial {
  const details = detailTextures(renderer.capabilities.getMaxAnisotropy());
  const gridTexture = createGridTexture(grid);
  const cuffEndV = { value: 0 };
  const ribRepeat = { value: new THREE.Vector2(1, 1) };
  const material = new THREE.MeshStandardMaterial({
    map: gridTexture,
    normalMap: details.jerseyNormal,
    aoMap: details.jerseyAo,
    aoMapIntensity: 1,
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  details.jerseyAo.channel = 0;
  material.customProgramCacheKey = () => 'knit-jersey-v2';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ribNormalMap = { value: details.ribNormal };
    shader.uniforms.ribAoMap = { value: details.ribAo };
    shader.uniforms.cuffEndV = cuffEndV;
    shader.uniforms.ribRepeat = ribRepeat;
    shader.fragmentShader = `uniform sampler2D ribNormalMap;\nuniform sampler2D ribAoMap;\nuniform float cuffEndV;\nuniform vec2 ribRepeat;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', NORMAL_FRAGMENT);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', AO_FRAGMENT);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#ifdef DOUBLE_SIDED
        outgoingLight *= gl_FrontFacing ? 1.0 : 0.38;
      #endif
      #include <opaque_fragment>`,
    );
  };

  const setLayout = (needles: number, rows: number, cuffRows: number): void => {
    details.jerseyNormal.repeat.set(Math.max(1, needles), Math.max(1, rows));
    details.jerseyAo.repeat.set(Math.max(1, needles), Math.max(1, rows));
    ribRepeat.value.set(Math.max(1, needles / 2), 1);
    cuffEndV.value = rows > 0 ? Math.max(0, cuffRows) / rows : 0;
  };

  return {
    material,
    updateGrid(next: StitchGrid): void {
      const image = gridTexture.image as { width: number; height: number; data: Uint8Array };
      if (image.width !== next.width || image.height !== next.height) return;
      fillGrid(image.data, next);
      gridTexture.needsUpdate = true;
    },
    setLayout,
    dispose(): void {
      gridTexture.dispose();
      material.dispose();
    },
  };
}
