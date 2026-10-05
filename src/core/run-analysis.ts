import type { SaberSide } from '../types/index.js';

/**
 * Per-run log of note outcomes, used to explain *how* a run went on the results
 * screen. Timing sign convention: positive `deltaMs` means the cut came late,
 * negative means early (song time minus the note's hit time).
 */
export interface RunLog {
  hits: Array<{ side: SaberSide; deltaMs: number }>;
  misses: Array<{ side: SaberSide; timeSec: number }>;
}

export interface SideSummary {
  hits: number;
  misses: number;
  /** Hit rate in percent, or null when the side had no notes. */
  accuracy: number | null;
}

export interface RunSummary {
  hits: number;
  misses: number;
  /** Mean timing error in ms over timed hits (positive = late), rounded. */
  meanDeltaMs: number;
  earlyPercent: number;
  latePercent: number;
  left: SideSummary;
  right: SideSummary;
  /** Song window with the most misses, or null when misses are too few to say. */
  worstSegment: { startSec: number; endSec: number; misses: number } | null;
}

/** Hits closer to the note than this count as on time for the early/late split. */
export const ON_TIME_WINDOW_MS = 15;
export const SEGMENT_LENGTH_SEC = 10;
/** Fewer misses than this are noise, not a pattern worth reporting. */
export const MIN_MISSES_FOR_SEGMENT = 3;
/** A summary built from fewer notes would mislead, so the UI hides it. */
export const MIN_NOTES_FOR_SUMMARY = 8;

export function createRunLog(): RunLog {
  return { hits: [], misses: [] };
}

/** Log of the run in progress; reset when gameplay starts. */
export const currentRunLog: RunLog = createRunLog();

export function resetRunLog(log: RunLog): void {
  log.hits.length = 0;
  log.misses.length = 0;
}

function summarizeSide(log: RunLog, side: SaberSide): SideSummary {
  const hits = log.hits.filter(entry => entry.side === side).length;
  const misses = log.misses.filter(entry => entry.side === side).length;
  const total = hits + misses;
  return { hits, misses, accuracy: total > 0 ? Math.round((hits / total) * 100) : null };
}

function findWorstSegment(misses: RunLog['misses']): RunSummary['worstSegment'] {
  const buckets = new Map<number, number>();
  for (const miss of misses) {
    if (!Number.isFinite(miss.timeSec)) continue;
    const bucket = Math.max(0, Math.floor(miss.timeSec / SEGMENT_LENGTH_SEC));
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  let best: { bucket: number; count: number } | null = null;
  for (const [bucket, count] of buckets) {
    // On ties prefer the earlier window so the result is deterministic.
    if (!best || count > best.count || (count === best.count && bucket < best.bucket)) best = { bucket, count };
  }
  if (!best || best.count < MIN_MISSES_FOR_SEGMENT) return null;
  return {
    startSec: best.bucket * SEGMENT_LENGTH_SEC,
    endSec: (best.bucket + 1) * SEGMENT_LENGTH_SEC,
    misses: best.count,
  };
}

export function summarizeRun(log: RunLog): RunSummary | null {
  const total = log.hits.length + log.misses.length;
  if (total < MIN_NOTES_FOR_SUMMARY) return null;

  const timed = log.hits.filter(entry => Number.isFinite(entry.deltaMs));
  const early = timed.filter(entry => entry.deltaMs < -ON_TIME_WINDOW_MS).length;
  const late = timed.filter(entry => entry.deltaMs > ON_TIME_WINDOW_MS).length;
  const meanDeltaMs = timed.length
    ? Math.round(timed.reduce((sum, entry) => sum + entry.deltaMs, 0) / timed.length)
    : 0;

  return {
    hits: log.hits.length,
    misses: log.misses.length,
    meanDeltaMs,
    earlyPercent: timed.length ? Math.round((early / timed.length) * 100) : 0,
    latePercent: timed.length ? Math.round((late / timed.length) * 100) : 0,
    left: summarizeSide(log, 'left'),
    right: summarizeSide(log, 'right'),
    worstSegment: findWorstSegment(log.misses),
  };
}
