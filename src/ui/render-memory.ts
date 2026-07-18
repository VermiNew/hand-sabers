import * as THREE from 'three';
import { reflectTarget, scene } from '../game/scene.ts';

const THREE_RT = THREE;

const BYTES_PER_MB = 1024 * 1024;
const drawingBufferSize = new THREE_RT.Vector2();

function mb(bytes: number): number {
  return +(Math.max(0, bytes) / BYTES_PER_MB).toFixed(2);
}

interface BufferAttr {
  isInterleavedBufferAttribute?: boolean;
  data?: { array?: { byteLength?: number } };
  array?: { byteLength?: number };
}

function attributeBytes(attr: BufferAttr | null | undefined, seenArrays: Set<object>): number {
  if (!attr) return 0;
  const array = attr.isInterleavedBufferAttribute ? attr.data?.array : attr.array;
  if (!array || seenArrays.has(array)) return 0;
  seenArrays.add(array);
  return array.byteLength || 0;
}

function geometryBytes(geometry: THREE.BufferGeometry | null | undefined): number {
  if (!geometry) return 0;
  const seenArrays = new Set<object>();
  let bytes = attributeBytes(geometry.index as unknown as BufferAttr, seenArrays);
  for (const attr of Object.values(geometry.attributes)) {
    bytes += attributeBytes(attr as unknown as BufferAttr, seenArrays);
  }
  for (const attrs of Object.values(geometry.morphAttributes)) {
    for (const attr of (attrs as unknown[])) bytes += attributeBytes(attr as BufferAttr, seenArrays);
  }
  return bytes;
}

function collectSceneTextures(root: THREE.Scene): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();
  const addTexture = (value: unknown) => {
    if (value instanceof THREE_RT.Texture) textures.add(value);
  };
  if (root.background instanceof THREE_RT.Texture) textures.add(root.background);
  if (root.environment instanceof THREE_RT.Texture) textures.add(root.environment);
  root.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const value of Object.values(mat as object)) addTexture(value);
    }
  });
  return textures;
}

function textureChannelCount(format: number): number {
  if (format === THREE_RT.RGBAFormat) return 4;
  if (format === THREE_RT.RGBFormat)  return 3;
  if (format === 1024 /* LuminanceAlphaFormat, removed in r152 */ || format === THREE_RT.RGFormat) return 2;
  return 1;
}

function textureBytesPerChannel(type: number): number {
  if (type === THREE_RT.FloatType || type === THREE_RT.UnsignedIntType || type === THREE_RT.IntType) return 4;
  if (type === THREE_RT.HalfFloatType || type === THREE_RT.ShortType || type === THREE_RT.UnsignedShortType) return 2;
  return 1;
}

function texturePixelBytes(texture: THREE.Texture): number {
  const packed16Bit =
    texture.type === THREE_RT.UnsignedShort4444Type ||
    texture.type === THREE_RT.UnsignedShort5551Type ||
    (texture.type as number) === 35633; /* UnsignedShort565Type, removed in r152 */
  if (packed16Bit) return 2;
  return textureChannelCount(texture.format) * textureBytesPerChannel(texture.type);
}

interface ImageLike { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; }

function textureDimensions(texture: THREE.Texture): { width: number; height: number; faces: number } {
  const image = texture.image as ImageLike | ImageLike[] | null | undefined;
  if (Array.isArray(image) && image.length) {
    const first = image[0] ?? {};
    return {
      width:  first.width ?? first.videoWidth ?? first.naturalWidth  ?? 0,
      height: first.height ?? first.videoHeight ?? first.naturalHeight ?? 0,
      faces:  image.length,
    };
  }
  const img = image as ImageLike | null | undefined;
  return {
    width:  img?.width ?? img?.videoWidth ?? img?.naturalWidth  ?? 0,
    height: img?.height ?? img?.videoHeight ?? img?.naturalHeight ?? 0,
    faces:  1,
  };
}

function usesMipmaps(texture: THREE.Texture): boolean {
  return texture.generateMipmaps !== false && ([
    THREE_RT.NearestMipmapNearestFilter,
    THREE_RT.NearestMipmapLinearFilter,
    THREE_RT.LinearMipmapNearestFilter,
    THREE_RT.LinearMipmapLinearFilter,
  ] as number[]).includes(texture.minFilter);
}

function textureBytes(texture: THREE.Texture): number {
  const { width, height, faces } = textureDimensions(texture);
  if (!width || !height) return 0;
  const baseBytes = width * height * faces * texturePixelBytes(texture);
  return usesMipmaps(texture) ? baseBytes * 1.333 : baseBytes;
}

function estimateRenderBufferBytes(renderer: THREE.WebGLRenderer): number {
  renderer.getDrawingBufferSize(drawingBufferSize);
  const defaultFramebufferBytes = drawingBufferSize.x * drawingBufferSize.y * 8;
  const reflectDepthBytes = reflectTarget.depthBuffer ? reflectTarget.width * reflectTarget.height * 4 : 0;
  return defaultFramebufferBytes + reflectDepthBytes;
}

export function sampleGpuMemory(renderer: THREE.WebGLRenderer): { geoMem: number; texMem: number; vramMem: number } {
  const geometries = new Set<THREE.BufferGeometry>();
  scene.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
  });

  let geoBytes = 0;
  for (const geometry of geometries) geoBytes += geometryBytes(geometry);

  const textures = collectSceneTextures(scene);
  textures.add(reflectTarget.texture);
  let texBytes = 0;
  for (const texture of textures) texBytes += textureBytes(texture);

  const bufferBytes = estimateRenderBufferBytes(renderer);
  return { geoMem: mb(geoBytes), texMem: mb(texBytes), vramMem: mb(geoBytes + texBytes + bufferBytes) };
}
