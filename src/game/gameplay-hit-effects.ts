import { getPerformanceProfile } from '../core/performance.ts';
import { getSettings } from '../core/settings.ts';
import { THEME } from '../core/theme.ts';
import { getCurrentMusicIntensity } from './music-visualizer.ts';
import type { BladeHitbox } from './saber-hitbox.ts';
import { THREE, scene } from './scene.ts';

type ShardMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> & { __inFreeList: boolean };

const ENABLE_SPARK_DUST = false;
const MAX_BURSTS = 1;
const SPARKS_PER_BURST = 0;
const TOTAL_SPARKS = MAX_BURSTS * SPARKS_PER_BURST;
const SPARK_GRAVITY = 0.004;
const SHARDS_PER_HIT_MAX = 8;
const MAX_SHARDS = 28;
const SHARD_GRAVITY = 0.0075;

const sparkPositions = new Float32Array(TOTAL_SPARKS * 3);
const sparkVelocities = new Float32Array(TOTAL_SPARKS * 3);
const sparkColors = new Float32Array(TOTAL_SPARKS * 3);
const sparkLives = new Float32Array(MAX_BURSTS);
const sparkGeometry = new THREE.BufferGeometry();
sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
const sparkMaterial = new THREE.PointsMaterial({
  size: 0.048,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const sparkSystem = new THREE.Points(sparkGeometry, sparkMaterial);
sparkSystem.frustumCulled = false;
if (ENABLE_SPARK_DUST) scene.add(sparkSystem);
let burstHead = 0;

const shardGeometry = new THREE.BoxGeometry(1, 1, 1);
const shardPool: ShardMesh[] = [];
const freeShards: ShardMesh[] = [];
const activeShards: ShardMesh[] = [];
const tmpSliceDir = new THREE.Vector3();
const tmpPushDir = new THREE.Vector3();
const tmpRandomDir = new THREE.Vector3();
const tmpShardScale = new THREE.Vector3();
const tmpShardCenter = new THREE.Vector3();
const tmpShardQuaternion = new THREE.Quaternion();
const tmpPushSnapshot = new THREE.Vector3();
const AXIS_Z = Object.freeze(new THREE.Vector3(0, 0, 1));
const AXIS_X = Object.freeze(new THREE.Vector3(1, 0, 0));

function burst(position: THREE.Vector3, colorHex: number, pushDirection: THREE.Vector3 | null = null): void {
  if (!ENABLE_SPARK_DUST || SPARKS_PER_BURST <= 0) return;
  const slot = burstHead % MAX_BURSTS;
  burstHead++;
  sparkLives[slot] = 1;
  const color = new THREE.Color(colorHex);
  const base = slot * SPARKS_PER_BURST * 3;
  const direction = pushDirection && pushDirection.lengthSq() > 0.0001
    ? pushDirection.clone().normalize()
    : null;
  for (let index = 0; index < SPARKS_PER_BURST; index++) {
    const offset = base + index * 3;
    sparkPositions[offset] = position.x;
    sparkPositions[offset + 1] = position.y;
    sparkPositions[offset + 2] = position.z;
    const speed = 0.045 + Math.random() * 0.075;
    const phi = Math.random() * Math.PI * 2;
    const theta = Math.random() * Math.PI;
    sparkVelocities[offset] = speed * Math.sin(theta) * Math.cos(phi);
    sparkVelocities[offset + 1] = speed * Math.sin(theta) * Math.sin(phi);
    sparkVelocities[offset + 2] = speed * Math.cos(theta);
    if (direction) {
      const impulse = 0.035 + Math.random() * 0.055;
      sparkVelocities[offset] = (sparkVelocities[offset] ?? 0) + direction.x * impulse;
      sparkVelocities[offset + 1] = (sparkVelocities[offset + 1] ?? 0) + direction.y * impulse;
      sparkVelocities[offset + 2] = (sparkVelocities[offset + 2] ?? 0) + direction.z * impulse;
    }
    sparkColors[offset] = color.r;
    sparkColors[offset + 1] = color.g;
    sparkColors[offset + 2] = color.b;
  }
}

function createNewShard(colorHex: number): ShardMesh {
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.9,
    roughness: 0.34,
    metalness: 0.34,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const shard = new THREE.Mesh(shardGeometry, material) as unknown as ShardMesh;
  shard.frustumCulled = false;
  shard.renderOrder = 12;
  shard.userData.velocity = new THREE.Vector3();
  shard.userData.rotVelocity = new THREE.Vector3();
  shard.userData.baseScale = new THREE.Vector3();
  shard.__inFreeList = false;
  scene.add(shard);
  shardPool.push(shard);
  return shard;
}

function acquireShard(colorHex: number): ShardMesh {
  const shard = freeShards.pop() ?? createNewShard(colorHex);
  shard.__inFreeList = false;
  shard.material.color.setHex(colorHex);
  shard.material.emissive.setHex(colorHex);
  shard.material.opacity = 1;
  shard.visible = true;
  activeShards.push(shard);
  return shard;
}

function releaseShardAt(index: number): void {
  const last = activeShards.length - 1;
  if (index < 0 || index > last) return;
  const shard = activeShards[index]!;
  if (index !== last) activeShards[index] = activeShards[last]!;
  activeShards.pop();
  if (shard.__inFreeList) return;
  shard.visible = false;
  shard.__inFreeList = true;
  freeShards.push(shard);
}

function computeSlicePush(hitbox: BladeHitbox | null | undefined): THREE.Vector3 {
  if (!hitbox?.hasCurrent) return tmpPushDir.set(0, 0.18, 0.45).normalize();
  tmpSliceDir.subVectors(hitbox.currentEnd, hitbox.currentStart);
  if (tmpSliceDir.lengthSq() < 0.0001) return tmpPushDir.set(0, 0.18, 0.45).normalize();
  tmpSliceDir.normalize();
  tmpPushDir.crossVectors(tmpSliceDir, AXIS_Z);
  if (tmpPushDir.lengthSq() < 0.0001) tmpPushDir.crossVectors(tmpSliceDir, AXIS_X);
  return tmpPushDir.normalize();
}

export function shatterBlock(
  mesh: THREE.Object3D,
  colorHex: number,
  hitbox: BladeHitbox | null | undefined,
  { strong = false, demo = false } = {},
): void {
  tmpShardCenter.copy(mesh.position);
  tmpShardQuaternion.copy(mesh.quaternion);
  tmpPushSnapshot.copy(computeSlicePush(hitbox));
  const freeSlots = Math.max(0, MAX_SHARDS - activeShards.length);
  const performanceProfile = getPerformanceProfile(getSettings());
  const profileShardCount = Math.max(
    0,
    Math.min(SHARDS_PER_HIT_MAX, Number(performanceProfile.hitShards) || SHARDS_PER_HIT_MAX),
  );
  const baseCount = demo ? Math.min(2, profileShardCount) : profileShardCount;
  const musicBonus = !demo && performanceProfile.musicReactive && getSettings().musicReactiveEnabled
    ? Math.round(baseCount * getCurrentMusicIntensity() * 0.18)
    : 0;
  const count = Math.min(
    baseCount + musicBonus + (strong && !demo && profileShardCount >= 4 ? 1 : 0),
    SHARDS_PER_HIT_MAX,
    freeSlots,
  );

  for (let index = 0; index < count; index++) {
    const shard = acquireShard(colorHex);
    const isHalf = index < 2;
    const sign = index % 2 === 0 ? 1 : -1;
    tmpRandomDir.set(
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.1) * 0.22,
      (Math.random() - 0.15) * 0.32,
    );
    shard.position.copy(tmpShardCenter)
      .addScaledVector(tmpPushSnapshot, sign * (isHalf ? 0.08 : 0.04))
      .add(tmpRandomDir);
    shard.quaternion.copy(tmpShardQuaternion);

    if (isHalf) {
      tmpShardScale.set(0.13 + Math.random() * 0.035, 0.035 + Math.random() * 0.014, 0.11 + Math.random() * 0.035);
    } else {
      const size = 0.035 + Math.random() * 0.045;
      tmpShardScale.set(
        size * (0.75 + Math.random() * 0.75),
        size * (0.75 + Math.random() * 0.75),
        size * (0.75 + Math.random() * 0.75),
      );
    }
    shard.scale.copy(tmpShardScale);
    shard.userData.baseScale.copy(tmpShardScale);
    const speed = strong ? 0.075 : 0.055;
    shard.userData.velocity.set(
      tmpPushSnapshot.x * sign * (0.035 + Math.random() * speed) + (Math.random() - 0.5) * 0.035,
      0.035 + Math.random() * 0.065,
      tmpPushSnapshot.z * sign * (0.028 + Math.random() * speed) + 0.02 + Math.random() * 0.035,
    );
    shard.userData.rotVelocity.set(
      (Math.random() - 0.5) * 0.11,
      (Math.random() - 0.5) * 0.14,
      (Math.random() - 0.5) * 0.11,
    );
    shard.userData.life = 0.42 + Math.random() * 0.22;
  }
  burst(tmpShardCenter, colorHex, tmpPushSnapshot);
}

function updateShards(deltaScale: number): void {
  const scale = THREE.MathUtils.clamp(deltaScale, 0, 3);
  const damping = Math.pow(0.986, scale);
  for (let index = activeShards.length - 1; index >= 0; index--) {
    const shard = activeShards[index]!;
    shard.userData.life -= 0.045 * scale;
    if (shard.userData.life <= 0) {
      releaseShardAt(index);
      continue;
    }
    shard.position.addScaledVector(shard.userData.velocity, scale);
    shard.userData.velocity.y -= SHARD_GRAVITY * scale;
    shard.userData.velocity.multiplyScalar(damping);
    shard.rotation.x += shard.userData.rotVelocity.x * scale;
    shard.rotation.y += shard.userData.rotVelocity.y * scale;
    shard.rotation.z += shard.userData.rotVelocity.z * scale;
    const life = THREE.MathUtils.clamp(shard.userData.life, 0, 1);
    const pulse = 0.68 + life * 0.34;
    shard.scale.copy(shard.userData.baseScale).multiplyScalar(pulse);
    shard.material.opacity = Math.min(0.92, life * 1.15);
    shard.material.emissiveIntensity = 0.18 + life * 0.55;
  }
}

export function updateSparks(deltaScale = 1): void {
  const scale = THREE.MathUtils.clamp(deltaScale, 0, 3);
  const damping = Math.pow(0.985, scale);
  let any = false;
  if (ENABLE_SPARK_DUST) for (let slot = 0; slot < MAX_BURSTS; slot++) {
    if ((sparkLives[slot] ?? 0) <= 0) continue;
    any = true;
    sparkLives[slot] = (sparkLives[slot] ?? 0) - 0.04 * scale;
    const base = slot * SPARKS_PER_BURST * 3;
    for (let index = 0; index < SPARKS_PER_BURST; index++) {
      const offset = base + index * 3;
      sparkPositions[offset] = (sparkPositions[offset] ?? 0) + (sparkVelocities[offset] ?? 0) * scale;
      sparkPositions[offset + 1] = (sparkPositions[offset + 1] ?? 0) + (sparkVelocities[offset + 1] ?? 0) * scale;
      sparkPositions[offset + 2] = (sparkPositions[offset + 2] ?? 0) + (sparkVelocities[offset + 2] ?? 0) * scale;
      sparkVelocities[offset + 1] = (sparkVelocities[offset + 1] ?? 0) - SPARK_GRAVITY * scale;
      sparkVelocities[offset] = (sparkVelocities[offset] ?? 0) * damping;
      sparkVelocities[offset + 2] = (sparkVelocities[offset + 2] ?? 0) * damping;
    }
  }
  updateShards(scale);
  if (ENABLE_SPARK_DUST) {
    sparkGeometry.attributes['position']!.needsUpdate = any;
    sparkGeometry.attributes['color']!.needsUpdate = any;
    sparkSystem.visible = any;
  } else {
    sparkSystem.visible = false;
  }
  window.__activeSparkCount = activeShards.length;
}

export function prewarmHitEffects(targetCount: number): void {
  while (shardPool.length < targetCount) {
    const color = shardPool.length % 2 ? THEME.right : THEME.left;
    const shard = createNewShard(color);
    shard.visible = false;
    shard.__inFreeList = true;
    freeShards.push(shard);
  }
}

export function clearHitEffects(): void {
  for (let slot = 0; slot < MAX_BURSTS; slot++) sparkLives[slot] = 0;
  sparkSystem.visible = false;
  while (activeShards.length) releaseShardAt(activeShards.length - 1);
}

export function getHitEffectCounts(): { active: number; prewarmed: number } {
  return { active: activeShards.length, prewarmed: shardPool.length };
}

export function disposeHitEffects(): void {
  clearHitEffects();
  shardGeometry.dispose();
  sparkGeometry.dispose();
  sparkMaterial.dispose();
  for (const shard of shardPool) {
    scene.remove(shard);
    shard.material.dispose();
  }
  shardPool.length = 0;
  freeShards.length = 0;
}
