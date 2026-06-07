import { state } from '../core/state.ts';
import { getSettings } from '../core/settings.ts';
import { getPerformanceProfile } from '../core/performance.js';
import { updateHUD, showComboMilestone } from '../ui/ui.js';
import { THEME } from '../core/theme.ts';
import { playBeat, playHit, playMiss, playBomb, playMilestone } from './audio.js';
import { getBeatHitTimeSec, isBeatTooLate, noteZAtSongTime, shouldSpawnBeat } from '../core/timing.ts';
import { classifyHitQuality, getSwingVector2, isCutDirectionMatch, normalizeCutDirection, registerComboHit, resetCombo, scoreForHit } from '../core/gameplay-rules.ts';
import { THREE, scene, lSaber, rSaber, lLight, rLight, triggerShake } from './scene.js';

// ── Stałe ──────────────────────────────────────────────────────────────────
const BPM          = 120;
const BEAT_MS      = 60000 / BPM;
const BLOCK_CAP_MS = 1000 / 60;
const HIT_RADIUS   = 0.50;
const MAX_SWING_BONUS     = 0.18;
const SWING_BONUS_FACTOR  = 0.36;
const MIN_SWING_SPEED     = 0.006;
const BLADE_LOCAL_START   = new THREE.Vector3(0, 0.03, 0);
const BLADE_LOCAL_END     = new THREE.Vector3(0, 1.18, 0);
const STARTING_LIVES      = 10;
const REGEN_EVERY_HITS    = 8;
// Jedyne źródło prawdy — zmień TU przy difficulty presets
export const APPROACH_TIME_MS = 1800;
export const MAP_APPROACH_TIME_SEC = APPROACH_TIME_MS / 1000;
const MENU_DEMO_BEAT_MS   = 540;

// Perfect hit: środek ostrza (25% długości od centrum)
const BLADE_CENTER = new THREE.Vector3();
const PERFECT_RADIUS = 0.22;
const COMBO_MILESTONES = new Set([10, 25, 50, 100, 200]);
const SPAWN_Z             = -22;
const HIT_Z               = 1.5;
const BLOCK_SPEED_PER_MS  = (HIT_Z - SPAWN_Z) / APPROACH_TIME_MS;
const MENU_DEMO_HIT_Z     = HIT_Z - 0.15;

// ── Geometrie (pre-ładowane) ────────────────────────────────────────────────
const BLOCK_GEO         = new THREE.BoxGeometry(0.38, 0.38, 0.38);
const BLOCK_OUTLINE_GEO = new THREE.BoxGeometry(0.5,  0.5,  0.5);
const BLOCK_ARROW_GEO   = new THREE.ConeGeometry(0.07, 0.16, 4);
const BOMB_GEO          = new THREE.IcosahedronGeometry(0.22, 1);
const BOMB_SPIKE_GEO    = new THREE.ConeGeometry(0.04, 0.14, 4);

const MATS = {
  blockL: new THREE.MeshStandardMaterial({ color: THEME.left,  emissive: THEME.left,  emissiveIntensity: 0.62, roughness: 0.28, metalness: 0.58 }),
  blockR: new THREE.MeshStandardMaterial({ color: THEME.right, emissive: THEME.right, emissiveIntensity: 0.62, roughness: 0.28, metalness: 0.58 }),
  outlineL: new THREE.MeshBasicMaterial({ color: THEME.left,  transparent: true, opacity: 0.25, side: THREE.BackSide }),
  outlineR: new THREE.MeshBasicMaterial({ color: THEME.right, transparent: true, opacity: 0.25, side: THREE.BackSide }),
  arrow: new THREE.MeshBasicMaterial({ color: THEME.white, transparent: true, opacity: 0.9 }),
  bomb: new THREE.MeshStandardMaterial({ color: THEME.bomb, emissive: THEME.bomb, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6 }),
  bombSpike: new THREE.MeshBasicMaterial({ color: 0xff6060 }),
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

function configureBlockArrow(mesh, cut = 'any') {
  const arrow = mesh?.children?.[1];
  if (!arrow) return;
  const dir = normalizeCutDirection(cut);
  arrow.visible = dir !== 'any';
  arrow.rotation.x = -Math.PI / 2;
  arrow.rotation.y = 0;
  arrow.rotation.z = CUT_ARROW_ROT_Z[dir] ?? 0;
  arrow.userData.cut = dir;
}

// ── Object Pool ─────────────────────────────────────────────────────────────
const blockPool = [];
const bombPool  = [];
const freeBlocks = [];
const freeBombs  = [];

function createNewBlock() {
  const mesh = new THREE.Mesh(BLOCK_GEO, MATS.blockL);
  mesh.add(new THREE.Mesh(BLOCK_OUTLINE_GEO, MATS.outlineL));
  const arrow = new THREE.Mesh(BLOCK_ARROW_GEO, MATS.arrow);
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

function createNewBomb() {
  const mesh = new THREE.Mesh(BOMB_GEO, MATS.bomb);
  for (let i = 0; i < 6; i++) {
    const spike = new THREE.Mesh(BOMB_SPIKE_GEO, MATS.bombSpike);
    const angle = (i / 6) * Math.PI * 2;
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

function acquireBlock(side) {
  const mesh = freeBlocks.pop() ?? createNewBlock();
  mesh.__inFreeList = false;
  mesh.material = side === 'left' ? MATS.blockL : MATS.blockR;
  mesh.children[0].material = side === 'left' ? MATS.outlineL : MATS.outlineR;
  mesh.visible = true;
  configureBlockArrow(mesh, 'any');
  return mesh;
}

function acquireBomb() {
  const mesh = freeBombs.pop() ?? createNewBomb();
  mesh.__inFreeList = false;
  mesh.visible = true;
  return mesh;
}

function releaseBlock(mesh) {
  if (!mesh || mesh.__inFreeList) return;
  mesh.visible = false;
  mesh.userData.alive = false;
  mesh.__inFreeList = true;
  if (mesh.__poolKind === 'bomb') freeBombs.push(mesh);
  else freeBlocks.push(mesh);
}

const PREWARM_TARGETS = {
  lowest:  { blocks: 3,  bombs: 1, shards: 0 },
  'very-low': { blocks: 4,  bombs: 1, shards: 6 },
  low:     { blocks: 6,  bombs: 2, shards: 10 },
  medium:  { blocks: 10, bombs: 3, shards: 16 },
  high:    { blocks: 14, bombs: 4, shards: 22 },
  ultra:   { blocks: 18, bombs: 5, shards: 28 },
  maximum: { blocks: 24, bombs: 6, shards: 28 },
};

function poolTargetsForCurrentGraphicsMode() {
  const perf = getPerformanceProfile(getSettings());
  return PREWARM_TARGETS[perf.qualityMode] || PREWARM_TARGETS.medium;
}

// ── Efekt rozpadu bloku ──────────────────────────────────────────────────────
// Stary system drobnego pyłu (THREE.Points) był wizualnie statyczny i potrafił
// zostawiać na ekranie irytujące kwadraciki. Zostawiamy go technicznie jako
// wyłączony fallback, ale efekt trafienia opiera się teraz tylko na kilku
// lekkich, ruchomych fragmentach bloku.
const ENABLE_SPARK_DUST = false;
const MAX_BURSTS       = 1;
const SPARKS_PER_BURST = 0;
const TOTAL_SPARKS     = MAX_BURSTS * SPARKS_PER_BURST;
const SPARK_GRAVITY    = 0.004;

const sparkPositions = new Float32Array(TOTAL_SPARKS * 3);
const sparkVelocities= new Float32Array(TOTAL_SPARKS * 3);
const sparkColors    = new Float32Array(TOTAL_SPARKS * 3);
const sparkLives     = new Float32Array(MAX_BURSTS);

const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
sparkGeo.setAttribute('color',    new THREE.BufferAttribute(sparkColors,    3));
const sparkMat = new THREE.PointsMaterial({
  size: 0.048, sizeAttenuation: true,
  vertexColors: true, transparent: true, opacity: 0.85,
  depthWrite: false, blending: THREE.AdditiveBlending,
});
const sparkSystem = new THREE.Points(sparkGeo, sparkMat);
sparkSystem.frustumCulled = false;
if (ENABLE_SPARK_DUST) scene.add(sparkSystem);
let burstHead = 0;

function burst(pos, colorHex, pushDir = null) {
  if (!ENABLE_SPARK_DUST || SPARKS_PER_BURST <= 0) return;
  const slot = burstHead % MAX_BURSTS;
  burstHead++;
  sparkLives[slot] = 1.0;
  const col  = new THREE.Color(colorHex);
  const base = slot * SPARKS_PER_BURST * 3;
  const dir  = pushDir?.lengthSq?.() > 0.0001 ? pushDir.clone().normalize() : null;
  for (let i = 0; i < SPARKS_PER_BURST; i++) {
    const o = base + i * 3;
    sparkPositions[o] = pos.x; sparkPositions[o+1] = pos.y; sparkPositions[o+2] = pos.z;
    const spd = 0.045 + Math.random() * 0.075;
    const phi = Math.random() * Math.PI * 2;
    const th  = Math.random() * Math.PI;
    sparkVelocities[o]   = spd * Math.sin(th) * Math.cos(phi);
    sparkVelocities[o+1] = spd * Math.sin(th) * Math.sin(phi);
    sparkVelocities[o+2] = spd * Math.cos(th);
    if (dir) {
      const impulse = 0.035 + Math.random() * 0.055;
      sparkVelocities[o]   += dir.x * impulse;
      sparkVelocities[o+1] += dir.y * impulse;
      sparkVelocities[o+2] += dir.z * impulse;
    }
    sparkColors[o] = col.r; sparkColors[o+1] = col.g; sparkColors[o+2] = col.b;
  }
}

const SHARDS_PER_HIT = 5;
const MAX_SHARDS     = 28;
const SHARD_GRAVITY  = 0.0075;
const shardGeo       = new THREE.BoxGeometry(1, 1, 1);
const shardPool      = [];
const freeShards     = [];
const activeShards   = [];
const tmpSliceDir    = new THREE.Vector3();
const tmpPushDir     = new THREE.Vector3();
const tmpRandomDir   = new THREE.Vector3();
const tmpShardScale  = new THREE.Vector3();
const tmpShardCenter = new THREE.Vector3();
const tmpShardQuat   = new THREE.Quaternion();
const tmpPushSnapshot= new THREE.Vector3();
const AXIS_Z         = Object.freeze(new THREE.Vector3(0, 0, 1));
const AXIS_X         = Object.freeze(new THREE.Vector3(1, 0, 0));

function createNewShard(colorHex) {
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.9,
    roughness: 0.34,
    metalness: 0.34,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const shard = new THREE.Mesh(shardGeo, mat);
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

function acquireShard(colorHex) {
  const shard = freeShards.pop() ?? createNewShard(colorHex);
  shard.__inFreeList = false;
  shard.material.color.setHex(colorHex);
  shard.material.emissive.setHex(colorHex);
  shard.material.opacity = 1;
  shard.visible = true;
  activeShards.push(shard);
  return shard;
}

function swapRemoveActiveShard(index) {
  const last = activeShards.length - 1;
  if (index < 0 || index > last) return null;
  const shard = activeShards[index];
  if (index !== last) activeShards[index] = activeShards[last];
  activeShards.pop();
  return shard;
}

function releaseShardAt(index) {
  const shard = swapRemoveActiveShard(index);
  if (!shard || shard.__inFreeList) return;
  shard.visible = false;
  shard.__inFreeList = true;
  freeShards.push(shard);
}

export function prewarmGameplayResources() {
  const targets = poolTargetsForCurrentGraphicsMode();
  while (blockPool.length < targets.blocks) releaseBlock(createNewBlock());
  while (bombPool.length < targets.bombs) releaseBlock(createNewBomb());
  while (shardPool.length < targets.shards) {
    const color = shardPool.length % 2 ? THEME.right : THEME.left;
    const shard = createNewShard(color);
    shard.visible = false;
    shard.__inFreeList = true;
    freeShards.push(shard);
  }
  window.__prewarmedBlockPool = blockPool.length;
  window.__prewarmedBombPool = bombPool.length;
  window.__prewarmedShardPool = shardPool.length;
}

function computeSlicePush(cache) {
  if (!cache?.hasCurrent) return tmpPushDir.set(0, 0.18, 0.45).normalize();
  tmpSliceDir.subVectors(cache.currentEnd, cache.currentStart);
  if (tmpSliceDir.lengthSq() < 0.0001) return tmpPushDir.set(0, 0.18, 0.45).normalize();
  tmpSliceDir.normalize();
  tmpPushDir.crossVectors(tmpSliceDir, AXIS_Z);
  if (tmpPushDir.lengthSq() < 0.0001) tmpPushDir.crossVectors(tmpSliceDir, AXIS_X);
  return tmpPushDir.normalize();
}

function shatterBlock(mesh, colorHex, cache, { strong = false, demo = false } = {}) {
  tmpShardCenter.copy(mesh.position);
  tmpShardQuat.copy(mesh.quaternion);
  tmpPushSnapshot.copy(computeSlicePush(cache));
  const freeSlots = Math.max(0, MAX_SHARDS - activeShards.length);
  const perf = getPerformanceProfile(getSettings());
  const perfShardCount = Math.max(0, Math.min(SHARDS_PER_HIT, Number(perf.hitShards) || SHARDS_PER_HIT));
  const baseCount = demo ? Math.min(2, perfShardCount) : perfShardCount;
  const count = Math.min(baseCount + (strong && !demo && perfShardCount >= 4 ? 1 : 0), freeSlots);

  for (let i = 0; i < count; i++) {
    const shard = acquireShard(colorHex);
    const isHalf = i < 2;
    const sign = i % 2 === 0 ? 1 : -1;

    tmpRandomDir.set(
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.1) * 0.22,
      (Math.random() - 0.15) * 0.32
    );

    shard.position.copy(tmpShardCenter)
      .addScaledVector(tmpPushSnapshot, sign * (isHalf ? 0.08 : 0.04))
      .add(tmpRandomDir);
    shard.quaternion.copy(tmpShardQuat);

    if (isHalf) {
      tmpShardScale.set(0.13 + Math.random() * 0.035, 0.035 + Math.random() * 0.014, 0.11 + Math.random() * 0.035);
    } else {
      const size = 0.035 + Math.random() * 0.045;
      tmpShardScale.set(size * (0.75 + Math.random() * 0.75), size * (0.75 + Math.random() * 0.75), size * (0.75 + Math.random() * 0.75));
    }
    shard.scale.copy(tmpShardScale);
    shard.userData.baseScale.copy(tmpShardScale);

    const speed = strong ? 0.075 : 0.055;
    shard.userData.velocity.set(
      tmpPushSnapshot.x * sign * (0.035 + Math.random() * speed) + (Math.random() - 0.5) * 0.035,
      0.035 + Math.random() * 0.065,
      tmpPushSnapshot.z * sign * (0.028 + Math.random() * speed) + 0.02 + Math.random() * 0.035
    );
    shard.userData.rotVelocity.set(
      (Math.random() - 0.5) * 0.11,
      (Math.random() - 0.5) * 0.14,
      (Math.random() - 0.5) * 0.11
    );
    shard.userData.life = 0.42 + Math.random() * 0.22;
  }

  // Stary punktowy pył jest domyślnie wyłączony, bo robił statyczne kwadraty
  // na ekranie. W razie potrzeby można go przywrócić przez ENABLE_SPARK_DUST.
  burst(tmpShardCenter, colorHex, tmpPushSnapshot);
}

function updateShards(deltaScale = 1) {
  const scale = THREE.MathUtils.clamp(deltaScale, 0, 3);
  const damping = Math.pow(0.986, scale);
  for (let i = activeShards.length - 1; i >= 0; i--) {
    const shard = activeShards[i];
    shard.userData.life -= 0.045 * scale;
    if (shard.userData.life <= 0) {
      releaseShardAt(i);
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
  return activeShards.length > 0;
}

export function updateSparks(deltaScale = 1) {
  const scale = THREE.MathUtils.clamp(deltaScale, 0, 3);
  const damping = Math.pow(0.985, scale);
  let any = false;
  if (ENABLE_SPARK_DUST) for (let s = 0; s < MAX_BURSTS; s++) {
    if (sparkLives[s] <= 0) continue;
    any = true;
    sparkLives[s] -= 0.04 * scale;
    const base = s * SPARKS_PER_BURST * 3;
    for (let i = 0; i < SPARKS_PER_BURST; i++) {
      const o = base + i * 3;
      sparkPositions[o]   += sparkVelocities[o] * scale;
      sparkPositions[o+1] += sparkVelocities[o+1] * scale;
      sparkPositions[o+2] += sparkVelocities[o+2] * scale;
      sparkVelocities[o+1]-= SPARK_GRAVITY * scale;
      sparkVelocities[o]  *= damping;
      sparkVelocities[o+2]*= damping;
    }
  }
  updateShards(scale);
  if (ENABLE_SPARK_DUST) {
    sparkGeo.attributes.position.needsUpdate = any;
    sparkGeo.attributes.color.needsUpdate    = any;
    sparkSystem.visible = any;
  } else {
    sparkSystem.visible = false;
  }
  window.__activeSparkCount = activeShards.length;
}

// ── Stan gry ────────────────────────────────────────────────────────────────
const activeBlocks  = []; // { mesh, side, alive, isBomb, spawnZ }
let nextBeatMs      = 0;
let lastBlockMs     = 0;
let nextSideLeft    = true;
let nextDemoBeatMs   = 0;
let lastMenuDemoUpdateMs = 0;
let menuDemoSideLeft = true;
let hitStreakForRegen= 0;
let gameOverHandler = () => {};
let lastHitMs       = 0;
window.__activeBlockCount = 0;
window.__activeSparkCount = 0;
window.__prewarmedBlockPool = 0;
window.__prewarmedBombPool = 0;
window.__prewarmedShardPool = 0;
window.__menuDemoTarget = null;

const tmpBlade   = new THREE.Vector3();
const tmpPoint   = new THREE.Vector3();
const tmpClosest = new THREE.Vector3();

function swapRemoveActiveBlock(index) {
  const last = activeBlocks.length - 1;
  if (index < 0 || index > last) return null;
  const entry = activeBlocks[index];
  if (index !== last) activeBlocks[index] = activeBlocks[last];
  activeBlocks.pop();
  return entry;
}

function createBladeCache() {
  return {
    hasCurrent: false, hasPrevious: false,
    radius: HIT_RADIUS,
    currentStart:  new THREE.Vector3(),
    currentEnd:    new THREE.Vector3(),
    previousStart: new THREE.Vector3(),
    previousEnd:   new THREE.Vector3(),
  };
}
const bladeHitboxes = { left: createBladeCache(), right: createBladeCache() };

export function setGameOverHandler(fn) { gameOverHandler = fn; }

function publishGameplayStats() {
  window.__activeBlockCount = activeBlocks.length;
  window.__activeSparkCount = activeShards.length;
  window.__prewarmedBlockPool = blockPool.length;
  window.__prewarmedBombPool = bombPool.length;
  window.__prewarmedShardPool = shardPool.length;
}

export function startGameplay() {
  state.score  = 0;
  state.combo  = 0;
  state.maxCombo = 0;
  state.maxLives = STARTING_LIVES;
  state.lives  = STARTING_LIVES;
  hitStreakForRegen = 0;
  lastHitMs = 0;
  const now = performance.now();
  nextBeatMs   = now + BEAT_MS;
  lastBlockMs  = now;
  nextSideLeft = true;
  resetBladeHitboxes();
  publishGameplayStats();
  updateHUD(state);
}

export function clearGameplayEntities() {
  for (const b of activeBlocks) releaseBlock(b.mesh);
  activeBlocks.length = 0;

  // Pool zostaje w pamięci między restartami. Dzięki temu restart nie powoduje
  // ponownej alokacji geometrii i nie próbuje użyć już zwolnionych shared geometry.

  for (let s = 0; s < MAX_BURSTS; s++) sparkLives[s] = 0;
  sparkSystem.visible = false;
  while (activeShards.length) releaseShardAt(activeShards.length - 1);
  hitStreakForRegen   = 0;
  resetBladeHitboxes();
  publishGameplayStats();
}


export function resetMenuDemo() {
  for (const b of activeBlocks) releaseBlock(b.mesh);
  activeBlocks.length = 0;
  for (let s = 0; s < MAX_BURSTS; s++) sparkLives[s] = 0;
  sparkSystem.visible = false;
  while (activeShards.length) releaseShardAt(activeShards.length - 1);
  nextDemoBeatMs = performance.now() + 220;
  lastMenuDemoUpdateMs = 0;
  menuDemoSideLeft = true;
  window.__menuDemoTarget = null;
  publishGameplayStats();
}

function resetBladeHitboxes() {
  for (const k of ['left', 'right']) {
    bladeHitboxes[k].hasCurrent = bladeHitboxes[k].hasPrevious = false;
    bladeHitboxes[k].radius = HIT_RADIUS;
  }
}

function laneForBeat(side, beat = {}) {
  const laneSide = side === 'right' ? 'right' : 'left';
  const x = Number.isFinite(beat.x) ? beat.x : (laneSide === 'left' ? -1 : 1) * 0.82;
  const y = Number.isFinite(beat.y) ? beat.y : 1.1;
  return { x, y };
}

// ── Spawn ────────────────────────────────────────────────────────────────────
function spawnBlock(side = null, isBomb = false, options = {}) {
  if (!isBomb && state.oneHandMode) side = state.oneHandMode;
  if (!side) { side = nextSideLeft ? 'left' : 'right'; nextSideLeft = !nextSideLeft; }
  const cut  = isBomb ? 'any' : normalizeCutDirection(options.cut || 'any');
  const mesh = isBomb ? acquireBomb() : acquireBlock(side);
  const x    = Number.isFinite(options.x) ? options.x : (isBomb ? (Math.random() * 2 - 1) * 1.2 : (side === 'left' ? -1 : 1) * (0.4 + Math.random() * 0.8));
  const y    = Number.isFinite(options.y) ? options.y : 0.7 + Math.random() * 1.0;
  const z    = Number.isFinite(options.z) ? options.z : SPAWN_Z;
  mesh.position.set(x, y, z);
  mesh.userData = { side, alive: true, isBomb, cut };
  if (!isBomb) configureBlockArrow(mesh, cut);
  activeBlocks.push({
    mesh,
    side,
    alive: true,
    isBomb,
    cut,
    mapBeat: Boolean(options.mapBeat),
    hitTimeSec: Number.isFinite(options.hitTimeSec) ? options.hitTimeSec : null,
    approachSec: Number.isFinite(options.approachSec) ? options.approachSec : MAP_APPROACH_TIME_SEC,
  });
  publishGameplayStats();
}

// ── Hit detection ─────────────────────────────────────────────────────────────
function captureBladeHitbox(saber, cache) {
  if (cache.hasCurrent) {
    cache.previousStart.copy(cache.currentStart);
    cache.previousEnd.copy(cache.currentEnd);
    cache.hasPrevious = true;
  }
  saber.updateMatrixWorld(true);
  cache.currentStart.copy(BLADE_LOCAL_START).applyMatrix4(saber.matrixWorld);
  cache.currentEnd.copy(BLADE_LOCAL_END).applyMatrix4(saber.matrixWorld);

  if (!cache.hasPrevious) { cache.radius = HIT_RADIUS; cache.hasCurrent = true; return; }
  const swing = Math.max(
    cache.currentStart.distanceTo(cache.previousStart),
    cache.currentEnd.distanceTo(cache.previousEnd)
  );
  cache.radius = HIT_RADIUS + Math.min(MAX_SWING_BONUS, swing * SWING_BONUS_FACTOR);
  cache.hasCurrent = true;
}

function distPtSegSq(point, a, b) {
  tmpBlade.subVectors(b, a);
  const lenSq = tmpBlade.lengthSq();
  if (lenSq <= 0.000001) return point.distanceToSquared(a);
  const t = THREE.MathUtils.clamp(tmpPoint.subVectors(point, a).dot(tmpBlade) / lenSq, 0, 1);
  tmpClosest.copy(a).addScaledVector(tmpBlade, t);
  return point.distanceToSquared(tmpClosest);
}

function bladeDistSq(point, cache) {
  let best = distPtSegSq(point, cache.currentStart, cache.currentEnd);
  if (cache.hasPrevious) {
    best = Math.min(best, distPtSegSq(point, cache.previousStart, cache.previousEnd));
    best = Math.min(best, distPtSegSq(point, cache.previousStart, cache.currentStart));
    best = Math.min(best, distPtSegSq(point, cache.previousEnd, cache.currentEnd));
  }
  return best;
}

function bladeHits(mesh, cache) {
  if (!cache.hasCurrent) return false;
  return bladeDistSq(mesh.position, cache) <= cache.radius * cache.radius;
}

function getSwingSpeed(cache) {
  if (!cache.hasPrevious) return 0;
  return Math.max(
    cache.currentStart.distanceTo(cache.previousStart),
    cache.currentEnd.distanceTo(cache.previousEnd)
  );
}

function centerDistanceToBlade(mesh, cache) {
  BLADE_CENTER.lerpVectors(cache.currentStart, cache.currentEnd, 0.5);
  return mesh.position.distanceTo(BLADE_CENTER);
}

function getHitDeltaMs(entry) {
  if (!entry.mapBeat || !Number.isFinite(entry.hitTimeSec) || !Number.isFinite(window.__songTimeSec)) return 0;
  return (window.__songTimeSec - entry.hitTimeSec) * 1000;
}

function hitBlock(entry, color, light, cache) {
  entry.alive = false;
  entry.mesh.userData.alive = false;

  const swingVector = getSwingVector2(cache);
  const cutOk = isCutDirectionMatch(entry.cut, swingVector);
  const deltaMs = getHitDeltaMs(entry);
  const centerDistance = centerDistanceToBlade(entry.mesh, cache);
  const quality = classifyHitQuality({ deltaMs, centerDistance, perfectRadius: PERFECT_RADIUS, cutOk });
  const comboBefore = state.combo;
  const points = scoreForHit(quality.basePoints, comboBefore);

  shatterBlock(entry.mesh, color, cache, { strong: quality.strong });
  showHitLabel(entry.mesh.position, quality.label, quality.label === 'PERFECT', quality.reason);
  releaseBlock(entry.mesh);

  state.score += points;
  if (quality.advancesCombo) {
    const next = registerComboHit(state);
    state.combo = next.combo;
    state.maxCombo = next.maxCombo;
    hitStreakForRegen++;
  } else {
    const next = resetCombo(state);
    state.combo = next.combo;
    state.maxCombo = next.maxCombo;
    hitStreakForRegen = 0;
  }
  lastHitMs = performance.now();

  if (hitStreakForRegen >= REGEN_EVERY_HITS && state.lives < state.maxLives) {
    state.lives = Math.min(state.maxLives, state.lives + 1);
    hitStreakForRegen = 0;
  }
  updateHUD(state);
  playHit(Math.max(1, state.combo));

  if (quality.advancesCombo && COMBO_MILESTONES.has(state.combo)) {
    playMilestone(state.combo);
    showComboMilestone(state.combo);
  }

  light.intensity = quality.strong ? 12 : 9;
  if (light.userData.hitTimer) clearTimeout(light.userData.hitTimer);
  light.userData.hitTimer = setTimeout(() => {
    light.intensity = 4;
    light.userData.hitTimer = null;
  }, 120);
}

function hitBomb(entry) {
  entry.alive = false;
  entry.mesh.userData.alive = false;
  shatterBlock(entry.mesh, THEME.bomb, null, { strong: true });
  releaseBlock(entry.mesh);

  ({ combo: state.combo, maxCombo: state.maxCombo } = resetCombo(state));
  state.lives = Math.max(0, state.lives - 2);
  hitStreakForRegen = 0;
  updateHUD(state);
  playBomb();
  triggerShake(0.10);
  if (state.lives <= 0 && !state.noFail) gameOverHandler();
}

// Floating hit label (DOM overlay)
const hitLabelContainer = document.createElement('div');
hitLabelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;overflow:hidden;';
document.body.appendChild(hitLabelContainer);

function showHitLabel(pos3d, label, perfect, reason = '') {
  const el  = document.createElement('div');
  const isBad = label === 'BAD';
  const col = isBad ? '#ffaa44' : perfect ? '#36f2a1' : '#8ec8ff';
  el.textContent = label;
  el.style.cssText = `
    position:absolute;
    font-family:'Oxanium',sans-serif;
    font-size:${perfect ? 22 : isBad ? 18 : 16}px;
    font-weight:900;
    letter-spacing:4px;
    color:${col};
    text-shadow:0 0 20px ${col};
    opacity:1;
    transition:opacity 0.35s, transform 0.35s;
    pointer-events:none;
    white-space:nowrap;
  `;
  // Przybliżona projekcja 3D → ekran (uproszczona, wystarczy dla feel)
  const sx = window.innerWidth  * (0.5 - pos3d.x * 0.08);
  const sy = window.innerHeight * (0.42 - pos3d.y * 0.06);
  el.style.left      = `${sx}px`;
  el.style.top       = `${sy}px`;
  el.style.transform = 'translate(-50%, -50%)';
  hitLabelContainer.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity   = '0';
    el.style.transform = 'translate(-50%, -120%)';
  });
  setTimeout(() => el.remove(), 380);
}

function checkHits() {
  captureBladeHitbox(lSaber, bladeHitboxes.left);
  captureBladeHitbox(rSaber, bladeHitboxes.right);
  const lSpeed = getSwingSpeed(bladeHitboxes.left);
  const rSpeed = getSwingSpeed(bladeHitboxes.right);

  for (let i = activeBlocks.length - 1; i >= 0; i--) {
    const entry = activeBlocks[i];
    if (!entry.alive) { swapRemoveActiveBlock(i); continue; }

    if (entry.mesh.position.z > 4.5) {
      releaseBlock(entry.mesh);
      swapRemoveActiveBlock(i);
      if (!entry.isBomb) {
        ({ combo: state.combo, maxCombo: state.maxCombo } = resetCombo(state));
        state.lives = Math.max(0, state.lives - 1);
        hitStreakForRegen = 0;
        updateHUD(state);
        playMiss();
        triggerShake(0.07);
        if (state.lives <= 0 && !state.noFail) gameOverHandler();
      }
      continue;
    }

    const useLeft  = state.oneHandMode !== 'right';
    const useRight = state.oneHandMode !== 'left';

    if (entry.isBomb) {
      if (useLeft && bladeHits(entry.mesh, bladeHitboxes.left)  && lSpeed > MIN_SWING_SPEED) { hitBomb(entry); swapRemoveActiveBlock(i); }
      else if (useRight && bladeHits(entry.mesh, bladeHitboxes.right) && rSpeed > MIN_SWING_SPEED) { hitBomb(entry); swapRemoveActiveBlock(i); }
      continue;
    }

    if ((state.oneHandMode === 'left' || entry.side === 'left') && useLeft && bladeHits(entry.mesh, bladeHitboxes.left) && lSpeed > MIN_SWING_SPEED) {
      hitBlock(entry, THEME.left,  lLight, bladeHitboxes.left);  swapRemoveActiveBlock(i);
    } else if ((state.oneHandMode === 'right' || entry.side === 'right') && useRight && bladeHits(entry.mesh, bladeHitboxes.right) && rSpeed > MIN_SWING_SPEED) {
      hitBlock(entry, THEME.right, rLight, bladeHitboxes.right); swapRemoveActiveBlock(i);
    }
  }
}


// ── Main menu autoplay demo ──────────────────────────────────────────────────
export function updateMenuDemo(now, t) {
  if (lastMenuDemoUpdateMs && now - lastMenuDemoUpdateMs < 1000 / 30) return;
  const dtScale = lastMenuDemoUpdateMs
    ? Math.min((now - lastMenuDemoUpdateMs) / (1000 / 60), 2.5)
    : 1.0;
  lastMenuDemoUpdateMs = now;

  if (!nextDemoBeatMs) nextDemoBeatMs = now + 180;
  if (now >= nextDemoBeatMs) {
    nextDemoBeatMs = now + MENU_DEMO_BEAT_MS + Math.sin(t * 1.7) * 70;
    const side = menuDemoSideLeft ? 'left' : 'right';
    menuDemoSideLeft = !menuDemoSideLeft;
    spawnBlock(side, false);
  }

  let target = null;
  for (let i = activeBlocks.length - 1; i >= 0; i--) {
    const entry = activeBlocks[i];
    if (!entry.alive) { swapRemoveActiveBlock(i); continue; }
    entry.mesh.position.z += 0.105 * dtScale;
    entry.mesh.rotation.y += 0.032 * dtScale;
    entry.mesh.rotation.x += 0.012 * dtScale;

    if (!target && entry.mesh.position.z > -2.8 && entry.mesh.position.z < 3.0) {
      target = entry;
    }

    if (entry.mesh.position.z >= MENU_DEMO_HIT_Z) {
      const color = entry.side === 'left' ? THEME.left : THEME.right;
      shatterBlock(entry.mesh, color, null, { demo: true });
      releaseBlock(entry.mesh);
      swapRemoveActiveBlock(i);
    }
  }

  if (target) {
    window.__menuDemoTarget = {
      side: target.side,
      x: target.mesh.position.x,
      y: target.mesh.position.y,
      z: target.mesh.position.z,
    };
  } else {
    window.__menuDemoTarget = null;
  }
  publishGameplayStats();
}

// ── Map mode ─────────────────────────────────────────────────────────────────
let mapSpawnSource = null;
let mapSpawnQueue = [];
let nextMapSpawnIndex = 0;
let lastMapSpawnTimeSec = 0;

function ensureMapSpawnQueue(beats) {
  if (beats === mapSpawnSource) return;
  mapSpawnSource = beats;
  mapSpawnQueue = Array.isArray(beats)
    ? beats.map((beat, index) => ({ beat, index, hitTime: getBeatHitTimeSec(beat) })).sort((a, b) => a.hitTime - b.hitTime || a.index - b.index)
    : [];
  nextMapSpawnIndex = 0;
  lastMapSpawnTimeSec = 0;
}

export function spawnMapBeats(beats, currentTimeSec) {
  if (!beats) return;
  ensureMapSpawnQueue(beats);
  const LOOKAHEAD = 0.12;
  const DROP_LATE_BY = 0.45;

  if (currentTimeSec < lastMapSpawnTimeSec - 0.35) {
    nextMapSpawnIndex = 0;
  }
  lastMapSpawnTimeSec = currentTimeSec;

  while (nextMapSpawnIndex < mapSpawnQueue.length) {
    const { beat: b, hitTime } = mapSpawnQueue[nextMapSpawnIndex];
    if (!shouldSpawnBeat(b, currentTimeSec, MAP_APPROACH_TIME_SEC, LOOKAHEAD)) break;
    nextMapSpawnIndex++;
    if (isBeatTooLate(b, currentTimeSec, DROP_LATE_BY)) continue;

    const side = state.oneHandMode || (b.side === 'random' ? (Math.random() < 0.5 ? 'left' : 'right') : b.side);
    const lane = laneForBeat(side, b);
    spawnBlock(side, b.type === 'bomb', {
      mapBeat: true,
      hitTimeSec: hitTime,
      approachSec: MAP_APPROACH_TIME_SEC,
      x: lane.x,
      y: lane.y,
      z: SPAWN_Z,
      cut: b.cut,
    });
  }
}

export function resetMapSpawn() {
  mapSpawnSource = null;
  mapSpawnQueue = [];
  nextMapSpawnIndex = 0;
  lastMapSpawnTimeSec = 0;
}

// ── Update loop ───────────────────────────────────────────────────────────────
export function updateBlocks(now, mapBeats = null, mapTimeSec = 0) {
  const elapsed = now - lastBlockMs;
  if (elapsed < BLOCK_CAP_MS) return;
  const dtScale = Math.min(elapsed / BLOCK_CAP_MS, 3.0);
  lastBlockMs = now;

  if (mapBeats) {
    spawnMapBeats(mapBeats, mapTimeSec);
  } else {
    // Tryb losowy
    if (now >= nextBeatMs) {
      nextBeatMs = now + BEAT_MS;
      playBeat();
      const bombChance = 0.12;
      if (Math.random() < bombChance) spawnBlock(null, true);
      else spawnBlock();
    }
  }

  const spd = BLOCK_SPEED_PER_MS * elapsed;
  for (const entry of activeBlocks) {
    if (!entry.alive) continue;
    if (entry.mapBeat && Number.isFinite(entry.hitTimeSec)) {
      entry.mesh.position.z = noteZAtSongTime({
        hitTimeSec: entry.hitTimeSec,
        songTimeSec: mapTimeSec,
        spawnZ: SPAWN_Z,
        hitZ: HIT_Z,
        approachSec: entry.approachSec || MAP_APPROACH_TIME_SEC,
      });
    } else {
      entry.mesh.position.z += spd;
    }
    entry.mesh.rotation.y += 0.025 * dtScale;
  }

  checkHits();
  publishGameplayStats();
}


export function disposeGameplayResources() {
  clearGameplayEntities();
  for (const mesh of blockPool) scene.remove(mesh);
  for (const mesh of bombPool) scene.remove(mesh);
  blockPool.length = 0;
  bombPool.length = 0;
  freeBlocks.length = 0;
  freeBombs.length = 0;
  for (const geom of [BLOCK_GEO, BLOCK_OUTLINE_GEO, BLOCK_ARROW_GEO, BOMB_GEO, BOMB_SPIKE_GEO, shardGeo, sparkGeo]) geom.dispose?.();
  for (const mat of Object.values(MATS)) mat.dispose?.();
  sparkMat.dispose?.();
  for (const shard of shardPool) {
    scene.remove(shard);
    shard.material?.dispose?.();
  }
  shardPool.length = 0;
  freeShards.length = 0;
}

export function getLastHitMs() { return lastHitMs; }
