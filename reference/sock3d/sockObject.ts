/**
 * Objet Three.js de la chaussette : maillage + matériau « tricot ».
 *  - couleur : atlas (une colonne par aiguille, lecture au plus proche) → motif exact ;
 *  - relief : carte de normales + occlusion d'une maille, répétée une fois par maille (canal UV 1) ;
 *  - tissu : MeshPhysicalMaterial avec « sheen » (duvet du fil), très mat ;
 *  - intérieur de la chaussette plus sombre.
 * Mettre à jour les couleurs ne reconstruit pas la géométrie.
 */
import * as THREE from 'three';
import { buildSockMesh, type SockShapeInput } from './sockShape';
import { buildSockAtlas, type GridLike, type ZoneColorsLike } from './sockAtlas';
import { buildKnitMaps } from './knitMaps';

export interface SockObject {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  setShape(shape: SockShapeInput): void;
  setColors(grid: GridLike, zones: ZoneColorsLike): void;
  dispose(): void;
  geometryBuilds: number;
}

let knitCache: { normal: THREE.DataTexture; ao: THREE.DataTexture } | null = null;

function knitTextures() {
  if (knitCache) return knitCache;
  const maps = buildKnitMaps(64);
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, maps.size, maps.size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.channel = 1; // utilise l'attribut uv1 = (colonne, rang)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  knitCache = { normal: make(maps.normal, false), ao: make(maps.ao, false) };
  return knitCache;
}

function geometryFor(shape: SockShapeInput): THREE.BufferGeometry {
  const m = buildSockMesh(shape, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uvAtlas, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(m.uvStitch, 2));
  g.setAttribute('knitMask', new THREE.BufferAttribute(m.knitMask, 1));
  g.setAttribute('atlasPerRow', new THREE.BufferAttribute(m.atlasPerRow, 1));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function createSockObject(shape: SockShapeInput, grid: GridLike, zones: ZoneColorsLike): SockObject {
  const knit = knitTextures();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.93,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#6a6a6a'), // duvet discret : ne délave pas les couleurs
    normalMap: knit.normal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    aoMap: knit.ao,
    aoMapIntensity: 1,
    side: THREE.DoubleSide,
  });
  // Shader : (1) frontière des mailles en chevron (les « V » s'emboîtent au lieu de carrés),
  // (2) relief atténué à la pointe, (3) intérieur de la chaussette plus sombre.
  const uniforms = { uChevron: { value: 0.9 } };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uChevron = uniforms.uChevron;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float knitMask;
         attribute float atlasPerRow;
         varying float vKnitMask;
         varying float vAtlasPerRow;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vKnitMask = knitMask;
         vAtlasPerRow = atlasPerRow;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uChevron;
         varying float vKnitMask;
         varying float vAtlasPerRow;`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
           float fx = fract(vNormalMapUv.x);
           float chev = (0.25 - abs(fx - 0.5)) * uChevron * vKnitMask;
           vec4 sampledDiffuseColor = texture2D( map, vMapUv + vec2( 0.0, chev * vAtlasPerRow ) );
           diffuseColor *= sampledDiffuseColor;
         #endif
         if (!gl_FrontFacing) diffuseColor.rgb *= 0.45;`,
      )
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vKnitMask;');
  };
  material.customProgramCacheKey = () => 'sock-knit-v1';

  let shapeNow = shape;
  let atlasTex: THREE.DataTexture | null = null;
  const mesh = new THREE.Mesh(geometryFor(shape), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const obj: SockObject = {
    mesh,
    geometryBuilds: 1,
    setShape(next) {
      shapeNow = next;
      mesh.geometry.dispose();
      mesh.geometry = geometryFor(next);
      obj.geometryBuilds++;
    },
    setColors(g, z) {
      const a = buildSockAtlas(shapeNow, g, z, 3);
      if (!atlasTex || atlasTex.image.width !== a.width || atlasTex.image.height !== a.height) {
        atlasTex?.dispose();
        atlasTex = new THREE.DataTexture(a.data, a.width, a.height, THREE.RGBAFormat);
        atlasTex.colorSpace = THREE.SRGBColorSpace;
        atlasTex.magFilter = THREE.NearestFilter;
        atlasTex.minFilter = THREE.NearestFilter;
        atlasTex.generateMipmaps = false;
        atlasTex.wrapS = THREE.RepeatWrapping;
        atlasTex.wrapT = THREE.ClampToEdgeWrapping;
        material.map = atlasTex;
        material.needsUpdate = true;
      } else {
        (atlasTex.image.data as Uint8Array).set(a.data);
      }
      atlasTex.needsUpdate = true;
    },
    dispose() {
      mesh.geometry.dispose();
      atlasTex?.dispose();
      material.dispose();
    },
  };
  obj.setColors(grid, zones);
  return obj;
}
