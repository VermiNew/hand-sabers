import { getSettings } from '../core/settings.ts';
import { MathUtils } from 'three';

// Base travel time at 1×. Presets scale approach time without modifying beat.t.
export const APPROACH_TIME_MS = 1800;
export const MAP_APPROACH_TIME_SEC = APPROACH_TIME_MS / 1000;

export function getEffectiveSpeed(mapTimeSec: number): number {
  const noteSpeed = MathUtils.clamp(Number(getSettings().noteSpeed) || 1, 0.75, 1.75);
  if (getSettings().gameMode === 'speed-trials') {
    const ramp = 1 + mapTimeSec * 0.008;
    return noteSpeed * Math.min(ramp, 3);
  }
  return noteSpeed;
}

export function getTrainingRate(): number {
  return getSettings().trainingMode ? 0.75 : 1;
}

export function getMapApproachTimeSec(mapTimeSec = 0): number {
  return MAP_APPROACH_TIME_SEC / getEffectiveSpeed(mapTimeSec);
}
