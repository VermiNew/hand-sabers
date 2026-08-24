/**
 * Pure math for metronome-based audio calibration.
 *
 * The metronome plays beats at a fixed interval and accents every fifth beat.
 * The user taps Space in sync with every click. We compute the phase error of
 * each tap relative to the nearest beat, discard warm-up taps and outliers,
 * then return a robust central estimate (trimmed mean).
 */

/** Beat interval in ms (120 BPM). */
export const BEAT_INTERVAL = 500;

/** Accent period in ms — accent every 5 beats. */
export const ACCENT_PERIOD = BEAT_INTERVAL * 5; // 2500

/** Minimum taps before we start evaluating stability. */
export const MIN_TAPS = 8;

/** Number of warm-up taps to discard (user is still getting into rhythm). */
export const WARMUP_TAPS = 2;

/** Fraction of remaining taps to trim from each end before averaging. */
export const TRIM_FRACTION = 0.2;

/** Maximum allowed offset magnitude in ms. */
export const MAX_OFFSET = 500;

/**
 * Wrap a raw phase error into [-halfPeriod, +halfPeriod].
 *
 * A tap that is 490 ms after an accent beat is equivalent to -10 ms
 * before the next accent beat. This matters when the user taps slightly
 * ahead of or behind the beat.
 */
export function wrapPhaseError(rawMs: number, period = ACCENT_PERIOD): number {
  const half = period / 2;
  let v = rawMs % period;
  if (v > half) v -= period;
  if (v < -half) v += period;
  return v;
}

/**
 * Compute the phase error of a single tap relative to the nearest beat.
 *
 * @param tapMs     Tap timestamp (performance.now baseline).
 * @param startTimeMs  Metronome start timestamp.
 * @param period    Reference beat period in ms.
 * @returns Signed offset in ms, wrapped to [-period/2, +period/2].
 */
export function phaseError(
  tapMs: number,
  startTimeMs: number,
  period = BEAT_INTERVAL,
): number {
  const elapsed = tapMs - startTimeMs;
  const beatIndex = Math.round(elapsed / period);
  const nearestBeat = startTimeMs + beatIndex * period;
  return wrapPhaseError(tapMs - nearestBeat, period);
}

/**
 * Compute a trimmed mean of an array of values.
 *
 * Discards 'fraction' of values from each end (rounded down, at least 0),
 * then returns the arithmetic mean of what remains. If the array is empty
 * after trimming, returns the median of the original.
 */
export function trimmedMean(values: number[], fraction = TRIM_FRACTION): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * fraction);
  const kept = sorted.slice(trimCount, sorted.length - trimCount);
  if (kept.length === 0) return sorted[Math.floor(sorted.length / 2)] ?? 0;
  return kept.reduce((s, v) => s + v, 0) / kept.length;
}

/**
 * Median absolute deviation — a robust measure of spread.
 */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)]!;
  const deviations = sorted.map(v => Math.abs(v - med));
  deviations.sort((a, b) => a - b);
  return deviations[Math.floor(deviations.length / 2)]!;
}

/**
 * Compute calibration offset from an array of tap timestamps.
 *
 * Steps:
 * 1. Discard the first WARMUP_TAPS taps.
 * 2. Compute phase errors relative to the nearest beats.
 * 3. Reject outliers whose phase error exceeds 2x the MAD.
 * 4. Return the trimmed mean of surviving errors, clamped to [-MAX_OFFSET, +MAX_OFFSET].
 *
 * @returns offsetMs, stable, taps, spread
 */
export function computeCalibration(
  tapTimes: number[],
  startTimeMs: number,
): { offsetMs: number; stable: boolean; taps: number; spread: number } {
  const usable = tapTimes.slice(WARMUP_TAPS);
  if (usable.length < MIN_TAPS) {
    return { offsetMs: 0, stable: false, taps: usable.length, spread: Infinity };
  }

  const errors = usable.map(tap => phaseError(tap, startTimeMs));
  const spread = mad(errors);

  // Reject outliers: keep only values within 2x MAD of the median
  const sortedErrors = [...errors].sort((a, b) => a - b);
  const median = sortedErrors[Math.floor(sortedErrors.length / 2)]!;
  const threshold = Math.max(spread * 2, 15); // at least 15 ms tolerance
  const filtered = errors.filter(e => Math.abs(e - median) <= threshold);

  const offset = trimmedMean(filtered.length > 0 ? filtered : errors);
  const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(offset)));

  return {
    offsetMs: clamped,
    stable: spread < 50,
    taps: filtered.length,
    spread: Math.round(spread),
  };
}
