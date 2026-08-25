import { normalizeCutDirection } from '../core/gameplay-rules.ts';
import { THEME } from '../core/theme.ts';
import type { SaberSide } from '../types/index.js';
import { THREE, scene } from './scene.ts';

export type PoolMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material> & {
  __poolKind: 'block' | 'bomb';
  __inFreeList: boolean;
};

const BLOCK_GEO = new THREE.BoxGeometry(0.38, 0.38, 0.38);
const BLOCK_OUTLINE_GEO = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const BLOCK_ARROW_GEO = new THREE.ConeGeometry(0.07, 0.16, 4);
const BOMB_GEO = new THREE.IcosahedronGeometry(0.22, 1);
const BOMB_SPIKE_GEO = new THREE.ConeGeometry(0.04, 0.14, 4);

const materials = {
  blockL: new THREE.MeshStandardMaterial({ color: THEME.left, emissive: THEME.left, emissiveIntensity: 0.62, roughness: 0.28, metalness: 0.58 }),
  blockR: new THREE.MeshStandardMaterial({ color: THEME.right, emissive: THEME.right, emissiveIntensity: 0.62, roughness: 0.28, metalness: 0.58 }),
  outlineL: new THREE.MeshBasicMaterial({ color: THEME.left, transparent: true, opacity: 0.25, side: THREE.BackSide }),
  outlineR: new THREE.MeshBasicMaterial({ color: THEME.right, transparent: true, opacity: 0.25, side: THREE.BackSide }),
  arrow: new THREE.MeshBasicMaterial({ color: THEME.white, transparent: true, opacity: 0.9 }),
  bomb: new THREE.MeshStandardMaterial({ color: THEME.bomb, emissive: THEME.bomb, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6 }),
  bombSpike: new THREE.MeshBasicMaterial({ color: 0xff6060 }),
  heldL: new THREE.MeshStandardMaterial({ color: THEME.left, emissive: THEME.left, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.5, transparent: true, opacity: 0.75 }),
  heldR: new THREE.MeshStandardMaterial({ color: THEME.right, emissive: THEME.right, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.5, transparent: true, opacity: 0.75 }),
};

const CUT_ARROW_ROT_Z = {
  down: 0,
  up: Math.PI,
  left: -Math.PI / 2,
  right: Math.PI / 2,
  'down-left': -Math.PI / 4,
  'down-right': Math.PI / 4,
  'up-left': -Math.PI * 3 / 4,
  'up-right': Math.PI * 3 / 4,
  any: 0,
};

const blockPool: PoolMesh[] = [];
const bombPool: PoolMesh[] = [];
const freeBlocks: PoolMesh[] = [];
const freeBombs: PoolMesh[] = [];
let currentColorLeft: number = THEME.left;
let currentColorRight: number = THEME.right;

function createNewBlock(): PoolMesh {
  const mesh = new THREE.Mesh(BLOCK_GEO, materials.blockL) as unknown as PoolMesh;
  mesh.add(new THREE.Mesh(BLOCK_OUTLINE_GEO, materials.outlineL));
  const arrow = new THREE.Mesh(BLOCK_ARROW_GEO, materials.arrow);
  arrow.position.set(0, 0, 0.22);
  arrow.rotation.x = -Math.PI / 2;
  mesh.add(arrow);
  mesh.frustumCulled = false;
  mesh.__poolKind = 'block';
  mesh.__inFreeList = false;
  scene.add(mesh);
  blockPool.push(mesh);
  return mesh;
}

function createNewBomb(): PoolMesh {
  const mesh = new THREE.Mesh(BOMB_GEO, materials.bomb) as unknown as PoolMesh;
  for (let index = 0; index < 6; index++) {
    const spike = new THREE.Mesh(BOMB_SPIKE_GEO, materials.bombSpike);
    const angle = (index / 6) * Math.PI * 2;
    spike.position.set(Math.cos(angle) * 0.22, Math.sin(angle) * 0.22, 0);
    spike.rotation.z = angle + Math.PI / 2;
    mesh.add(spike);
  }
  mesh.frustumCulled = false;
  mesh.__poolKind = 'bomb';
  mesh.__inFreeList = false;
  scene.add(mesh);
  bombPool.push(mesh);
  return mesh;
}

export function configureBlockArrow(mesh: PoolMesh, cut = 'any'): void {
  const arrow = mesh.children[1];
  if (!arrow) return;
  const direction = normalizeCutDirection(cut);
  arrow.visible = direction !== 'any';
  arrow.rotation.x = -Math.PI / 2;
  arrow.rotation.y = 0;
  arrow.rotation.z = CUT_ARROW_ROT_Z[direction] ?? 0;
  arrow.userData.cut = direction;
}

export function acquireBlock(side: SaberSide): PoolMesh {
  const mesh = freeBlocks.pop() ?? createNewBlock();
  mesh.__inFreeList = false;
  mesh.material = side === 'left' ? materials.blockL : materials.blockR;
  (mesh.children[0] as THREE.Mesh).material = side === 'left' ? materials.outlineL : materials.outlineR;
  mesh.visible = true;
  configureBlockArrow(mesh, 'any');
  return mesh;
}

export function acquireBomb(): PoolMesh {
  const mesh = freeBombs.pop() ?? createNewBomb();
  mesh.__inFreeList = false;
  mesh.visible = true;
  return mesh;
}

export function releaseBlock(mesh: PoolMesh | null | undefined): void {
  if (!mesh || mesh.__inFreeList) return;
  mesh.visible = false;
  mesh.userData.alive = false;
  mesh.__inFreeList = true;
  if (mesh.__poolKind === 'bomb') freeBombs.push(mesh);
  else freeBlocks.push(mesh);
}

export function prewarmBlockPool(blocks: number, bombs: number): void {
  while (blockPool.length < blocks) releaseBlock(createNewBlock());
  while (bombPool.length < bombs) releaseBlock(createNewBomb());
}

export function getBlockPoolCounts(): { blocks: number; bombs: number } {
  return { blocks: blockPool.length, bombs: bombPool.length };
}

export function getHeldMaterial(side: SaberSide): THREE.MeshStandardMaterial {
  return side === 'left' ? materials.heldL : materials.heldR;
}

export function setBlockColor(side: SaberSide, hex: number): void {
  const material = side === 'left' ? materials.blockL : materials.blockR;
  const outline = side === 'left' ? materials.outlineL : materials.outlineR;
  const held = side === 'left' ? materials.heldL : materials.heldR;
  material.color.setHex(hex);
  material.emissive.setHex(hex);
  material.needsUpdate = true;
  held.color.setHex(hex);
  held.emissive.setHex(hex);
  held.needsUpdate = true;
  outline.color.setHex(hex);
  outline.needsUpdate = true;
  if (side === 'left') currentColorLeft = hex;
  else currentColorRight = hex;
}

export function getCurrentBlockColor(side: SaberSide): number {
  return side === 'left' ? currentColorLeft : currentColorRight;
}

export function disposeBlockPool(): void {
  for (const mesh of blockPool) scene.remove(mesh);
  for (const mesh of bombPool) scene.remove(mesh);
  blockPool.length = 0;
  bombPool.length = 0;
  freeBlocks.length = 0;
  freeBombs.length = 0;
  for (const geometry of [BLOCK_GEO, BLOCK_OUTLINE_GEO, BLOCK_ARROW_GEO, BOMB_GEO, BOMB_SPIKE_GEO]) {
    geometry.dispose();
  }
  for (const material of Object.values(materials)) material.dispose();
}
