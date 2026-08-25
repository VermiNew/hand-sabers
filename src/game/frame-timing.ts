import { MathUtils } from 'three';

const BASE_FRAME_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 250;
const MAX_SIM_DELTA_SCALE = 3;

let previousFrameNow: number | undefined;

export interface FrameTiming {
  deltaMs: number;
  deltaSec: number;
  deltaScale: number;
}

export function nextFrameTiming(now: number): FrameTiming {
  const previousNow = Number.isFinite(previousFrameNow) ? previousFrameNow! : now - BASE_FRAME_MS;
  const deltaMs = MathUtils.clamp(now - previousNow, 0, MAX_FRAME_DELTA_MS);
  previousFrameNow = now;
  return {
    deltaMs,
    deltaSec: deltaMs / 1000,
    deltaScale: Math.min(deltaMs / BASE_FRAME_MS, MAX_SIM_DELTA_SCALE),
  };
}

export function resetFrameTiming(): void {
  previousFrameNow = undefined;
}

export function smoothProfileValue(previous: number, sample: number): number {
  return previous === 0 ? sample : previous * 0.88 + sample * 0.12;
}
