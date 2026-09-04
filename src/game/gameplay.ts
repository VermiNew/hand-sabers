import { state } from '../core/state.ts';
import { getSettings } from '../core/settings.ts';
import { getPerformanceProfile } from '../core/performance.ts';
import { updateHUD, showComboMilestone } from '../ui/ui.ts';
import { THEME } from '../core/theme.ts';
import { playBeat, playHit, playMiss, playBomb, playMilestone } from './audio.ts';
import { noteZAtSongTime } from '../core/timing.ts';
import { classifyHitQuality, getSwingVector2, isCutDirectionMatch, normalizeCutDirection, registerComboHit, resetCombo, scoreForHit } from '../core/gameplay-rules.ts';
import { recordBombHit } from '../core/achievements.ts';
import { THREE, scene, lSaber, rSaber, lLight, rLight, triggerShake } from './scene.ts';
import { showHitFeedback } from './hit-feedback.ts';
import { MapSpawnQueue } from './map-spawn-queue.ts';
import { createSpatialBeatLayout, type SpatialBeatPosition } from './spatial-beat-layout.ts';
import { resetMusicVisualizer, triggerMusicVisualizerBeat } from './music-visualizer.ts';
import {
  APPROACH_TIME_MS,
  getEffectiveSpeed,
  getMapApproachTimeSec,
  getTrainingRate,
  MAP_APPROACH_TIME_SEC,
} from './gameplay-speed.ts';
import {
  BASE_HIT_RADIUS,
  bladeHits,
  captureBladeHitbox,
  centerDistanceToBlade,
  createBladeHitbox,
  getSwingSpeed,
  MIN_SWING_SPEED,
  type BladeHitbox,
} from './saber-hitbox.ts';
import type { CutDirection, Beat, SaberSide } from '../types/index.js';
import {
  acquireBlock,
  acquireBomb,
  configureBlockArrow,
  disposeBlockPool,
  getBlockPoolCounts,
  getCurrentBlockColor,
  getHeldMaterial,
  prewarmBlockPool,
  releaseBlock,
  type PoolMesh,
} from './gameplay-block-pool.ts';
import {
  clearHitEffects,
  disposeHitEffects,
  getHitEffectCounts,
  prewarmHitEffects,
  shatterBlock,
} from './gameplay-hit-effects.ts';
import {
  getDifficultyHitProfile,
  type DifficultyHitProfile,
} from './difficulty-hit-profile.ts';

interface ActiveBlock {
  mesh: PoolMesh;
  side: SaberSide;
  alive: boolean;
  isBomb: boolean;
  cut: CutDirection;
  mapBeat: boolean;
  hitTimeSec: number | null;
  approachSec: number;
  isHeld: boolean;
  heldDuration: number;
  heldProgress: number;
  heldMesh: THREE.Mesh | null;
  heldLen: number;
  heldDrainAccum: number;
}

declare global {
  interface Window {
    __activeBlockCount?: number;
    __activeSparkCount?: number;
    __prewarmedBlockPool?: number;
    __prewarmedBombPool?: number;
    __prewarmedShardPool?: number;
    __menuDemoTarget?: { side: SaberSide; x: number; y: number; z: number } | null;
    __songTimeSec?: number;
    __gameplayVisualPressure?: number;
  }
}

// ── Stałe ──────────────────────────────────────────────────────────────────
const BPM          = 120;
const BEAT_MS      = 60000 / BPM;
const BLOCK_CAP_MS = 1000 / 60;
const STARTING_LIVES      = 10;
const REGEN_EVERY_HITS    = 8;
const MENU_DEMO_BEAT_MS   = 540;
const COMBO_MILESTONES = new Set([10, 25, 50, 100, 200]);
const SPAWN_Z             = -22;
const HIT_Z               = 1.5;
const BLOCK_SPEED_PER_MS  = (HIT_Z - SPAWN_Z) / APPROACH_TIME_MS;
const MENU_DEMO_HIT_Z     = HIT_Z - 0.15;

let activeSabers: SaberSide | 'both' = 'both';
let activeHitProfile: DifficultyHitProfile = getDifficultyHitProfile(null);
let activeHeldRadius = activeHitProfile.heldRadius;

function isSaberActive(side: SaberSide): boolean {
  return activeSabers === 'both' || activeSabers === side;
}

function effectiveOneHandMode(): SaberSide | null {
  return activeSabers === 'both' ? state.oneHandMode : null;
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
  return (PREWARM_TARGETS as Record<string, { blocks: number; bombs: number; shards: number }>)[perf.qualityMode] || PREWARM_TARGETS.medium;
}

export function prewarmGameplayResources(): void {
  const targets = poolTargetsForCurrentGraphicsMode();
  prewarmBlockPool(targets.blocks, targets.bombs);
  prewarmHitEffects(targets.shards);
  publishPoolStats();
}

function publishPoolStats(): void {
  const poolCounts = getBlockPoolCounts();
  const hitEffectCounts = getHitEffectCounts();
  window.__activeSparkCount = hitEffectCounts.active;
  window.__prewarmedBlockPool = poolCounts.blocks;
  window.__prewarmedBombPool = poolCounts.bombs;
  window.__prewarmedShardPool = hitEffectCounts.prewarmed;
}

// ── Stan gry ────────────────────────────────────────────────────────────────
const activeBlocks: ActiveBlock[] = [];
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
window.__gameplayVisualPressure = 0;

function swapRemoveActiveBlock(index: number): ActiveBlock | null {
  const last = activeBlocks.length - 1;
  if (index < 0 || index > last) return null;
  const entry = activeBlocks[index]!;
  if (index !== last) activeBlocks[index] = activeBlocks[last]!;
  activeBlocks.pop();
  return entry;
}

const bladeHitboxes = { left: createBladeHitbox(), right: createBladeHitbox() };

export function setGameOverHandler(fn: () => void): void { gameOverHandler = fn; }

function publishGameplayStats() {
  window.__activeBlockCount = activeBlocks.length;
  let nearestZ = -Infinity;
  for (const entry of activeBlocks) {
    if (entry.alive && entry.mesh.visible) nearestZ = Math.max(nearestZ, entry.mesh.position.z);
  }
  window.__gameplayVisualPressure = Number.isFinite(nearestZ)
    ? THREE.MathUtils.clamp((nearestZ + 5.5) / 7, 0, 1)
    : 0;
  publishPoolStats();
}

export function startGameplay(sabers: SaberSide | 'both' = 'both') {
  activeSabers = sabers;
  const settings = getSettings();
  activeHitProfile = getDifficultyHitProfile(state.map, settings);
  const hitboxSensitivity = THREE.MathUtils.clamp(Number(settings.hitboxSensitivity) || 1, 0.82, 1.2);
  activeHeldRadius = activeHitProfile.heldRadius * hitboxSensitivity;
  state.score       = 0;
  state.combo       = 0;
  state.maxCombo    = 0;
  state.hits        = 0;
  state.misses      = 0;
  state.perfectHits = 0;
  state.maxLives    = STARTING_LIVES;
  state.lives  = STARTING_LIVES;
  hitStreakForRegen = 0;
  lastHitMs = 0;
  const now = performance.now();
  nextBeatMs   = now + BEAT_MS / getTrainingRate();
  lastBlockMs  = now;
  nextSideLeft = true;
  resetMusicVisualizer();
  resetBladeHitboxes();
  publishGameplayStats();
  updateHUD(state);
}

function disposeHeldMesh(entry: ActiveBlock): void {
  if (!entry.heldMesh) return;
  scene.remove(entry.heldMesh);
  entry.heldMesh.geometry.dispose();
  entry.heldMesh = null;
}

export function clearGameplayEntities() {
  for (const b of activeBlocks) { disposeHeldMesh(b); releaseBlock(b.mesh); }
  activeBlocks.length = 0;
  window.__gameplayVisualPressure = 0;

  // Pool zostaje w pamięci między restartami. Dzięki temu restart nie powoduje
  // ponownej alokacji geometrii i nie próbuje użyć już zwolnionych shared geometry.

  clearHitEffects();
  hitStreakForRegen   = 0;
  for (const light of [lLight, rLight]) {
    if (light.userData.hitTimer) { clearTimeout(light.userData.hitTimer); light.userData.hitTimer = null; }
  }
  resetBladeHitboxes();
  publishGameplayStats();
}


export function resetMenuDemo() {
  for (const b of activeBlocks) { disposeHeldMesh(b); releaseBlock(b.mesh); }
  activeBlocks.length = 0;
  clearHitEffects();
  nextDemoBeatMs = performance.now() + 220;
  lastMenuDemoUpdateMs = 0;
  menuDemoSideLeft = true;
  window.__menuDemoTarget = null;
  publishGameplayStats();
}

function resetBladeHitboxes() {
  for (const k of ['left', 'right'] as const) {
    bladeHitboxes[k].hasCurrent = bladeHitboxes[k].hasPrevious = false;
    bladeHitboxes[k].radius = BASE_HIT_RADIUS;
  }
}

function laneForBeat(side: SaberSide, beat: Partial<Beat> = {}): { x: number; y: number } {
  const laneSide = side === 'right' ? 'right' : 'left';
  const x = Number.isFinite(beat.x) ? beat.x! : (laneSide === 'left' ? -1 : 1) * 0.82;
  const y = Number.isFinite(beat.y) ? beat.y! : 1.1;
  return { x, y };
}

interface SpawnOptions {
  x?: number; y?: number; z?: number;
  cut?: string;
  mapBeat?: boolean;
  hitTimeSec?: number;
  approachSec?: number;
  heldDuration?: number;
}

// ── Spawn ────────────────────────────────────────────────────────────────────
function spawnBlock(side: SaberSide | null = null, isBomb = false, options: SpawnOptions = {}): void {
  const oneHandMode = effectiveOneHandMode();
  if (!isBomb && oneHandMode) side = oneHandMode;
  if (!side) { side = nextSideLeft ? 'left' : 'right'; nextSideLeft = !nextSideLeft; }
  const cut  = isBomb ? 'any' : normalizeCutDirection(options.cut || 'any');
  const mesh = isBomb ? acquireBomb() : acquireBlock(side);
  const x    = Number.isFinite(options.x) ? options.x! : (isBomb ? (Math.random() * 2 - 1) * 1.2 : (side === 'left' ? -1 : 1) * (0.4 + Math.random() * 0.8));
  const y    = Number.isFinite(options.y) ? options.y! : 0.7 + Math.random() * 1.0;
  const z    = Number.isFinite(options.z) ? options.z! : SPAWN_Z;
  const heldDuration = (!isBomb && Number.isFinite(options.heldDuration) && options.heldDuration! > 0)
    ? options.heldDuration! : 0;
  const MAX_HELD_LEN = (HIT_Z - SPAWN_Z) * 0.85;
  const heldLen = heldDuration > 0 ? Math.min(heldDuration * BLOCK_SPEED_PER_MS * 1000, MAX_HELD_LEN) : 0;

  mesh.position.set(x, y, z);
  mesh.userData = { side, alive: true, isBomb, cut };
  if (!isBomb) configureBlockArrow(mesh, cut);

  let heldMesh: THREE.Mesh | null = null;
  if (heldLen > 0) {
    const geo = new THREE.BoxGeometry(0.38, 0.38, heldLen);
    const mat = getHeldMaterial(side);
    heldMesh = new THREE.Mesh(geo, mat);
    heldMesh.frustumCulled = false;
    heldMesh.position.set(x, y, z - (heldLen * 0.5 + 0.19));
    scene.add(heldMesh);
  }

  activeBlocks.push({
    mesh,
    side,
    alive: true,
    isBomb,
    cut,
    mapBeat: Boolean(options.mapBeat),
    hitTimeSec: Number.isFinite(options.hitTimeSec) ? options.hitTimeSec! : null,
    approachSec: Number.isFinite(options.approachSec) ? options.approachSec! : MAP_APPROACH_TIME_SEC,
    isHeld: heldLen > 0,
    heldDuration,
    heldProgress: 0,
    heldMesh,
    heldLen,
    heldDrainAccum: 0,
  });
  publishGameplayStats();
}

// ── Hit detection ─────────────────────────────────────────────────────────────
function getHitDeltaMs(entry: ActiveBlock): number {
  if (!entry.mapBeat || !Number.isFinite(entry.hitTimeSec) || !Number.isFinite(window.__songTimeSec)) return 0;
  return (window.__songTimeSec! - entry.hitTimeSec!) * 1000;
}

function hitBlock(entry: ActiveBlock, color: number, light: THREE.PointLight, cache: BladeHitbox): void {
  entry.alive = false;
  entry.mesh.userData.alive = false;

  const gameMode = getSettings().gameMode;
  const swingVector = getSwingVector2(cache);
  const cutOk = gameMode === 'no-arrows' ? true : isCutDirectionMatch(entry.cut, swingVector);
  const deltaMs = getHitDeltaMs(entry);
  const centerDistance = centerDistanceToBlade(entry.mesh, cache);
  const quality = classifyHitQuality({
    deltaMs,
    centerDistance,
    perfectRadius: activeHitProfile.perfectRadius,
    perfectTimingMs: activeHitProfile.perfectTimingMs,
    goodTimingMs: activeHitProfile.goodTimingMs,
    cutOk,
    gameMode,
  });
  const comboBefore = state.combo;
  const points = scoreForHit(quality.basePoints, comboBefore);

  shatterBlock(entry.mesh, color, cache, { strong: quality.strong });
  showHitFeedback(entry.mesh.position, quality.label, quality.label === 'PERFECT', quality.reason, deltaMs, entry.cut);
  releaseBlock(entry.mesh);

  state.score += points;
  state.hits++;
  if (quality.label === 'PERFECT') state.perfectHits++;
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
    if (state.combo >= 50 && typeof window.__narratorCombo === 'function') {
      window.__narratorCombo(state.combo);
    }
  }

  light.intensity = quality.strong ? 12 : 9;
  if (light.userData.hitTimer) clearTimeout(light.userData.hitTimer);
  light.userData.hitTimer = setTimeout(() => {
    light.intensity = 4;
    light.userData.hitTimer = null;
  }, 120);
}

function hitBomb(entry: ActiveBlock): void {
  entry.alive = false;
  entry.mesh.userData.alive = false;
  shatterBlock(entry.mesh, THEME.bomb, null, { strong: true });
  releaseBlock(entry.mesh);
  recordBombHit();

  ({ combo: state.combo, maxCombo: state.maxCombo } = resetCombo(state));
  state.lives = Math.max(0, state.lives - 2);
  hitStreakForRegen = 0;
  updateHUD(state);
  playBomb();
  triggerShake(0.10);
  if (state.lives <= 0 && !state.noFail) gameOverHandler();
}

function bladeInsideHeld(entry: ActiveBlock, cache: BladeHitbox): boolean {
  if (!cache.hasCurrent) return false;
  const bx = entry.mesh.position.x;
  const by = entry.mesh.position.y;
  const zFront = entry.mesh.position.z + 0.19;
  const zBack  = entry.mesh.position.z - entry.heldLen - 0.19;
  const hitRadius = activeHeldRadius;

  const checkPoint = (start: THREE.Vector3, end: THREE.Vector3): boolean => {
    // Project blade segment onto XY plane to find closest point in XY,
    // then verify that point's Z falls within the hold bar range.
    const lx = end.x - start.x, ly = end.y - start.y;
    const lenSq2 = lx * lx + ly * ly;
    const t = lenSq2 > 1e-10
      ? Math.max(0, Math.min(1, ((bx - start.x) * lx + (by - start.y) * ly) / lenSq2))
      : 0;
    const cx = start.x + t * lx, cy = start.y + t * ly;
    const cz = start.z + t * (end.z - start.z);
    const dx = cx - bx, dy = cy - by;
    return dx * dx + dy * dy <= hitRadius * hitRadius && cz >= zBack && cz <= zFront;
  };

  if (checkPoint(cache.currentStart, cache.currentEnd)) return true;
  if (cache.hasPrevious && checkPoint(cache.previousStart, cache.previousEnd)) return true;
  return false;
}

function isPastRemovalPoint(entry: ActiveBlock, mapTimeSec: number): boolean {
  if (!entry.isHeld) return entry.mesh.position.z > 4.5;
  if (entry.mapBeat && Number.isFinite(entry.hitTimeSec) && Number.isFinite(mapTimeSec)) {
    return mapTimeSec > entry.hitTimeSec! + entry.heldDuration + activeHitProfile.heldMissGraceSec;
  }
  return entry.mesh.position.z - entry.heldLen - 0.19 > 4.5;
}

function checkHits(deltaSec: number, mapTimeSec: number) {
  captureBladeHitbox(lSaber, bladeHitboxes.left);
  captureBladeHitbox(rSaber, bladeHitboxes.right);
  const lSpeed = getSwingSpeed(bladeHitboxes.left);
  const rSpeed = getSwingSpeed(bladeHitboxes.right);
  const minimumSwingSpeed = MIN_SWING_SPEED * activeHitProfile.minimumSwingMultiplier;

  for (let i = activeBlocks.length - 1; i >= 0; i--) {
    const entry = activeBlocks[i]!;
    if (!entry.alive) { swapRemoveActiveBlock(i); continue; }

    if (isPastRemovalPoint(entry, mapTimeSec)) {
      disposeHeldMesh(entry);
      releaseBlock(entry.mesh);
      swapRemoveActiveBlock(i);
      if (!entry.isBomb && isSaberActive(entry.side)) {
        ({ combo: state.combo, maxCombo: state.maxCombo } = resetCombo(state));
        state.lives = Math.max(0, state.lives - 1);
        hitStreakForRegen = 0;
        state.misses++;
        updateHUD(state);
        playMiss();
        triggerShake(0.07);
        if (state.lives <= 0 && !state.noFail) gameOverHandler();
      }
      continue;
    }

    const oneHandMode = effectiveOneHandMode();
    const useLeft  = isSaberActive('left') && oneHandMode !== 'right';
    const useRight = isSaberActive('right') && oneHandMode !== 'left';

    if (entry.isBomb) {
      if (useLeft && bladeHits(entry.mesh, bladeHitboxes.left)  && lSpeed > MIN_SWING_SPEED) { hitBomb(entry); swapRemoveActiveBlock(i); }
      else if (useRight && bladeHits(entry.mesh, bladeHitboxes.right) && rSpeed > MIN_SWING_SPEED) { hitBomb(entry); swapRemoveActiveBlock(i); }
      continue;
    }

    if (entry.isHeld) {
      const touchingLeft  = (oneHandMode === 'left'  || entry.side === 'left')  && useLeft  && bladeInsideHeld(entry, bladeHitboxes.left);
      const touchingRight = (oneHandMode === 'right' || entry.side === 'right') && useRight && bladeInsideHeld(entry, bladeHitboxes.right);
      const touching = touchingLeft || touchingRight;

      // Accumulate progress once the head reaches the player
      if (touching && entry.mesh.position.z >= HIT_Z) {
        entry.heldProgress += deltaSec;
        entry.heldDrainAccum = 0;
        if (entry.heldProgress >= entry.heldDuration) {
          const pos = entry.mesh.position.clone();
          const light = entry.side === 'left' ? lLight : rLight;
          disposeHeldMesh(entry);
          releaseBlock(entry.mesh);
          swapRemoveActiveBlock(i);
          state.lives = Math.min(state.maxLives, state.lives + 3);
          state.score += 300;
          state.hits++;
          const next = registerComboHit(state);
          state.combo = next.combo;
          state.maxCombo = next.maxCombo;
          hitStreakForRegen++;
          lastHitMs = performance.now();
          updateHUD(state);
          playHit(Math.max(1, state.combo));
          showHitFeedback(pos, 'HOLD', true, '', 0);
          light.intensity = 12;
          if (light.userData.hitTimer) clearTimeout(light.userData.hitTimer);
          light.userData.hitTimer = setTimeout(() => { light.intensity = 4; light.userData.hitTimer = null; }, 120);
          continue;
        }
      } else if (!touching && isSaberActive(entry.side) && entry.mesh.position.z >= HIT_Z) {
        entry.heldDrainAccum += deltaSec;
        if (entry.heldDrainAccum >= 1.0) {
          entry.heldDrainAccum -= 1.0;
          ({ combo: state.combo, maxCombo: state.maxCombo } = resetCombo(state));
          state.lives = Math.max(0, state.lives - 1);
          hitStreakForRegen = 0;
          updateHUD(state);
          triggerShake(0.04);
          if (state.lives <= 0 && !state.noFail) gameOverHandler();
        }
      }
      continue;
    }

    if ((oneHandMode === 'left' || entry.side === 'left') && useLeft && bladeHits(entry.mesh, bladeHitboxes.left, activeHitProfile.hitRadiusMultiplier) && lSpeed > minimumSwingSpeed) {
      hitBlock(entry, getCurrentBlockColor('left'),  lLight, bladeHitboxes.left);  swapRemoveActiveBlock(i);
    } else if ((oneHandMode === 'right' || entry.side === 'right') && useRight && bladeHits(entry.mesh, bladeHitboxes.right, activeHitProfile.hitRadiusMultiplier) && rSpeed > minimumSwingSpeed) {
      hitBlock(entry, getCurrentBlockColor('right'), rLight, bladeHitboxes.right); swapRemoveActiveBlock(i);
    }
  }
}


// ── Main menu autoplay demo ──────────────────────────────────────────────────
export function updateMenuDemo(now: number, t: number): void {
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
    const entry = activeBlocks[i]!;
    if (!entry.alive) { swapRemoveActiveBlock(i); continue; }
    entry.mesh.position.z += 0.105 * dtScale;
    entry.mesh.rotation.y += 0.032 * dtScale;
    entry.mesh.rotation.x += 0.012 * dtScale;

    if (!target && entry.mesh.position.z > -2.8 && entry.mesh.position.z < 3.0) {
      target = entry;
    }

    if (entry.mesh.position.z >= MENU_DEMO_HIT_Z) {
      const color = getCurrentBlockColor(entry.side);
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
const mapSpawnQueue = new MapSpawnQueue();
let spatialLayoutSource: Beat[] | null = null;
let spatialLayout: SpatialBeatPosition[] = [];

function spatialLaneForBeat(beats: Beat[], index: number): SpatialBeatPosition {
  if (spatialLayoutSource !== beats) {
    spatialLayoutSource = beats;
    spatialLayout = createSpatialBeatLayout(beats);
  }
  return spatialLayout[index] ?? { x: 0, y: 1.1, grouped: false };
}

export function spawnMapBeats(beats: Beat[] | null | undefined, currentTimeSec: number): void {
  if (!beats) return;
  const approachSec = getMapApproachTimeSec(currentTimeSec);
  const spatialMode = getSettings().gameMode === 'spatial';
  for (const { beat: b, index, hitTime } of mapSpawnQueue.takeDue(beats, currentTimeSec, approachSec)) {
    const deterministicSide = ((index * 0x9e37_79b1) >>> 0) % 2 === 0 ? 'left' : 'right';
    const side = effectiveOneHandMode() || (b.side === 'random' ? deterministicSide : b.side);
    const lane = spatialMode ? spatialLaneForBeat(beats, index) : laneForBeat(side, b);
    spawnBlock(side, b.type === 'bomb', {
      mapBeat: true,
      hitTimeSec: hitTime,
      approachSec,
      x: lane.x,
      y: lane.y,
      z: SPAWN_Z,
      cut: b.cut,
      heldDuration: b.type === 'held' ? (b.duration ?? 0.05) : 0,
    });
  }
}

export function resetMapSpawn() {
  mapSpawnQueue.reset();
  spatialLayoutSource = null;
  spatialLayout = [];
}

// ── Update loop ───────────────────────────────────────────────────────────────
export function updateBlocks(now: number, mapBeats: Beat[] | null = null, mapTimeSec = 0): void {
  const elapsed = now - lastBlockMs;
  if (elapsed < BLOCK_CAP_MS) return;
  const dtScale = Math.min(elapsed / BLOCK_CAP_MS, 3.0);
  lastBlockMs = now;

  if (mapBeats) {
    spawnMapBeats(mapBeats, mapTimeSec);
  } else {
    // Tryb losowy
    if (now >= nextBeatMs) {
      nextBeatMs = now + BEAT_MS / getTrainingRate();
      playBeat();
      triggerMusicVisualizerBeat();
      const bombChance = 0.12;
      if (Math.random() < bombChance) spawnBlock(null, true);
      else spawnBlock();
    }
  }

  const spd = BLOCK_SPEED_PER_MS * getEffectiveSpeed(mapTimeSec) * getTrainingRate() * elapsed;
  const deltaSec = elapsed / 1000;
  for (const entry of activeBlocks) {
    if (!entry.alive) continue;
    if (entry.mapBeat && Number.isFinite(entry.hitTimeSec)) {
      const newZ = noteZAtSongTime({
        hitTimeSec: entry.hitTimeSec!,
        songTimeSec: mapTimeSec,
        spawnZ: SPAWN_Z,
        hitZ: HIT_Z,
        approachSec: entry.approachSec || MAP_APPROACH_TIME_SEC,
      });
      entry.mesh.position.z = newZ;
      if (entry.heldMesh) entry.heldMesh.position.z = newZ - (entry.heldLen * 0.5 + 0.19);
    } else {
      entry.mesh.position.z += spd;
      if (entry.heldMesh) entry.heldMesh.position.z += spd;
    }
    if (!entry.isHeld) entry.mesh.rotation.y += 0.025 * dtScale;
  }

  checkHits(deltaSec, mapTimeSec);
  publishGameplayStats();
}


export function disposeGameplayResources() {
  clearGameplayEntities();
  disposeBlockPool();
  disposeHitEffects();
}

export function getLastHitMs() { return lastHitMs; }

export { getCurrentBlockColor, setBlockColor } from './gameplay-block-pool.ts';
export { updateSparks } from './gameplay-hit-effects.ts';
