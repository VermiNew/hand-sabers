import type { Settings } from '../types/index.js';

/**
 * Practice mode: replay one section of a map, optionally at a slower tempo that
 * rises after each clean run. Like modifiers, the setup is snapshotted when a
 * round starts, a practice run is never ranked, and it is single-player only.
 */
export interface PracticeSegment {
  startSec: number;
  endSec: number;
}

export interface ActivePractice extends PracticeSegment {
  /** Tempo multiplier for this run (1 = original speed). */
  rate: number;
  autoTempo: boolean;
}

export const PRACTICE_START_RATE = 0.6;
export const PRACTICE_RATE_STEP = 0.1;
export const PRACTICE_MAX_RATE = 1;
/** Accuracy (percent of notes hit) a run needs to unlock the next tempo step. */
export const PRACTICE_PASS_ACCURACY = 90;
/** A segment shorter than this is not worth looping. */
export const PRACTICE_MIN_LENGTH_SEC = 4;
/** Time after the segment end during which the last notes can still be hit. */
export const PRACTICE_TAIL_SEC = 1;

/**
 * Validates the configured range against the map. Returns null when practice is
 * off or the range is unusable. The end is clamped to the map length so a range
 * that overshoots still practices the real tail of the song.
 */
export function resolvePracticeSegment(
  startSec: unknown,
  endSec: unknown,
  mapDurationSec: number,
): PracticeSegment | null {
  const start = Number(startSec);
  const end = Number(endSec);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const clampedStart = Math.max(0, start);
  const clampedEnd = mapDurationSec > 0 ? Math.min(end, mapDurationSec) : end;
  if (clampedEnd - clampedStart < PRACTICE_MIN_LENGTH_SEC) return null;
  return { startSec: clampedStart, endSec: clampedEnd };
}

/** Next tempo after a run: one step up when the run was clean, otherwise unchanged. */
export function nextPracticeRate(rate: number, accuracyPercent: number): number {
  if (!(accuracyPercent >= PRACTICE_PASS_ACCURACY)) return rate;
  // Round to one decimal so repeated 0.1 steps never drift (0.7000000000000001).
  return Math.min(PRACTICE_MAX_RATE, Math.round((rate + PRACTICE_RATE_STEP) * 10) / 10);
}

let progressKey = '';
let progressRate = PRACTICE_START_RATE;
let active: ActivePractice | null = null;
let lastRun: { rate: number; nextRate: number; passed: boolean } | null = null;

/**
 * Builds the practice setup for a new round, or null when practice is off.
 * Tempo carries over between runs of the same map and range, and starts again
 * from the lowest step when either changes.
 */
export function beginPractice(
  settings: Pick<Settings, 'practiceEnabled' | 'practiceStartSec' | 'practiceEndSec' | 'practiceAutoTempo'>,
  mapId: string,
  mapDurationSec: number,
): ActivePractice | null {
  active = null;
  lastRun = null;
  if (!settings.practiceEnabled) return null;
  const segment = resolvePracticeSegment(settings.practiceStartSec, settings.practiceEndSec, mapDurationSec);
  if (!segment) return null;

  const key = `${mapId}:${segment.startSec}:${segment.endSec}:${settings.practiceAutoTempo}`;
  if (key !== progressKey) {
    progressKey = key;
    progressRate = settings.practiceAutoTempo ? PRACTICE_START_RATE : PRACTICE_MAX_RATE;
  }
  active = { ...segment, rate: progressRate, autoTempo: settings.practiceAutoTempo };
  return active;
}

export function getActivePractice(): Readonly<ActivePractice> | null {
  return active;
}

export function clearPractice(): void {
  active = null;
}

/** Records a finished run and returns the tempo used for the next one. */
export function finishPracticeRun(accuracyPercent: number): number {
  if (!active || !active.autoTempo) return progressRate;
  progressRate = nextPracticeRate(active.rate, accuracyPercent);
  lastRun = { rate: active.rate, nextRate: progressRate, passed: progressRate > active.rate };
  return progressRate;
}

/** Outcome of the latest finished practice run, for the results screen. */
export function getLastPracticeRun(): Readonly<{ rate: number; nextRate: number; passed: boolean }> | null {
  return lastRun;
}
