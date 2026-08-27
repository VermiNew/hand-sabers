import * as THREE from 'three';
import { getSettings } from '../core/settings.ts';

export const BASE_HIT_RADIUS = 0.50;
export const MIN_SWING_SPEED = 0.006;

const MAX_SWING_BONUS = 0.18;
const SWING_BONUS_FACTOR = 0.36;
const BLADE_LOCAL_START = new THREE.Vector3(0, 0.03, 0);
const BLADE_LOCAL_END = new THREE.Vector3(0, 1.18, 0);
const bladeCenter = new THREE.Vector3();
const tmpBlade = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpClosest = new THREE.Vector3();

export interface BladeHitbox {
  hasCurrent: boolean;
  hasPrevious: boolean;
  radius: number;
  currentStart: THREE.Vector3;
  currentEnd: THREE.Vector3;
  previousStart: THREE.Vector3;
  previousEnd: THREE.Vector3;
}

export function createBladeHitbox(): BladeHitbox {
  return {
    hasCurrent: false,
    hasPrevious: false,
    radius: BASE_HIT_RADIUS,
    currentStart: new THREE.Vector3(),
    currentEnd: new THREE.Vector3(),
    previousStart: new THREE.Vector3(),
    previousEnd: new THREE.Vector3(),
  };
}

export function captureBladeHitbox(saber: THREE.Object3D, cache: BladeHitbox): void {
  if (cache.hasCurrent) {
    cache.previousStart.copy(cache.currentStart);
    cache.previousEnd.copy(cache.currentEnd);
    cache.hasPrevious = true;
  }
  saber.updateMatrixWorld(true);
  cache.currentStart.copy(BLADE_LOCAL_START).applyMatrix4(saber.matrixWorld);
  cache.currentEnd.copy(BLADE_LOCAL_END).applyMatrix4(saber.matrixWorld);

  const hitboxSensitivity = THREE.MathUtils.clamp(Number(getSettings().hitboxSensitivity) || 1, 0.82, 1.2);
  const baseRadius = BASE_HIT_RADIUS * hitboxSensitivity;
  if (!cache.hasPrevious) {
    cache.radius = baseRadius;
    cache.hasCurrent = true;
    return;
  }
  const swing = Math.max(
    cache.currentStart.distanceTo(cache.previousStart),
    cache.currentEnd.distanceTo(cache.previousEnd),
  );
  cache.radius = baseRadius + Math.min(MAX_SWING_BONUS, swing * SWING_BONUS_FACTOR);
  cache.hasCurrent = true;
}

function distanceToSegmentSquared(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
  tmpBlade.subVectors(end, start);
  const lengthSquared = tmpBlade.lengthSq();
  if (lengthSquared <= 0.000001) return point.distanceToSquared(start);
  const position = THREE.MathUtils.clamp(tmpPoint.subVectors(point, start).dot(tmpBlade) / lengthSquared, 0, 1);
  tmpClosest.copy(start).addScaledVector(tmpBlade, position);
  return point.distanceToSquared(tmpClosest);
}

function bladeDistanceSquared(point: THREE.Vector3, cache: BladeHitbox): number {
  let best = distanceToSegmentSquared(point, cache.currentStart, cache.currentEnd);
  if (cache.hasPrevious) {
    best = Math.min(best, distanceToSegmentSquared(point, cache.previousStart, cache.previousEnd));
    best = Math.min(best, distanceToSegmentSquared(point, cache.previousStart, cache.currentStart));
    best = Math.min(best, distanceToSegmentSquared(point, cache.previousEnd, cache.currentEnd));
  }
  return best;
}

export function bladeHits(mesh: THREE.Object3D, cache: BladeHitbox, radiusMultiplier = 1): boolean {
  if (!cache.hasCurrent) return false;
  const safeMultiplier = Number.isFinite(radiusMultiplier)
    ? THREE.MathUtils.clamp(radiusMultiplier, 0.5, 1.5)
    : 1;
  const radius = cache.radius * safeMultiplier;
  return bladeDistanceSquared(mesh.position, cache) <= radius * radius;
}

export function getSwingSpeed(cache: BladeHitbox): number {
  if (!cache.hasPrevious) return 0;
  return Math.max(
    cache.currentStart.distanceTo(cache.previousStart),
    cache.currentEnd.distanceTo(cache.previousEnd),
  );
}

export function centerDistanceToBlade(mesh: THREE.Object3D, cache: BladeHitbox): number {
  bladeCenter.lerpVectors(cache.currentStart, cache.currentEnd, 0.5);
  return mesh.position.distanceTo(bladeCenter);
}
