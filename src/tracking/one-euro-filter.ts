/**
 * 1€ Filter (One Euro Filter) — adaptive low-pass filter for noisy real-time
 * signals such as hand-tracking landmarks.
 *
 * Why: a fixed moving-average window forces a trade-off you can't win —
 * wide window = smooth but laggy, narrow window = responsive but jittery.
 * This filter picks the trade-off *per frame*, based on how fast the signal
 * is currently moving: still hand -> heavy smoothing (kills jitter),
 * fast swing -> smoothing backs off automatically (keeps up with motion).
 *
 * Reference algorithm: Casiez, Roussel, Vogel (2012), "1€ Filter: A Simple
 * Speed-based Low-pass Filter for Noisy Input in Interactive Systems".
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrevMs: number | null = null;

  /**
   * @param minCutoff Cutoff frequency (Hz) used when the signal is still.
   *   Lower = smoother but laggier at rest. Start around 1.0–1.5.
   * @param beta How aggressively the cutoff rises with speed. Higher = less
   *   lag on fast movement, but less smoothing too. Start around 0.3–0.8 and
   *   tune against your world-unit scale (how far a "fast swing" travels per
   *   second in your coordinate system).
   * @param dCutoff Cutoff used to smooth the internal speed estimate itself.
   *   1.0 is fine for almost all cases — rarely needs tuning.
   */
  constructor(minCutoff = 1.2, beta = 0.5, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dtMs: number): number {
    const te = Math.max(1, dtMs) / 1000;
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / te);
  }

  filter(value: number, nowMs: number): number {
    if (this.xPrev === null || this.tPrevMs === null) {
      this.xPrev = value;
      this.tPrevMs = nowMs;
      return value;
    }
    const dtMs = Math.max(1, nowMs - this.tPrevMs);
    this.tPrevMs = nowMs;

    const rawSpeed = (value - this.xPrev) / (dtMs / 1000);
    const speed = this.dxPrev + this.alpha(this.dCutoff, dtMs) * (rawSpeed - this.dxPrev);
    this.dxPrev = speed;

    const cutoff = this.minCutoff + this.beta * Math.abs(speed);
    const filtered = this.xPrev + this.alpha(cutoff, dtMs) * (value - this.xPrev);
    this.xPrev = filtered;
    return filtered;
  }

  /** Call this whenever the tracked point reappears after being lost, so the
   * filter doesn't interpret the gap as a huge instantaneous speed. */
  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrevMs = null;
  }
}

export interface Vec3Like { x: number; y: number; z: number; }

/** Convenience wrapper: runs an independent OneEuroFilter per axis. Good for
 * positions, and (with re-normalization afterwards) for direction vectors. */
export class Vec3OneEuroFilter {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  private fz: OneEuroFilter;

  constructor(minCutoff = 1.2, beta = 0.5, dCutoff = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(p: Vec3Like, nowMs: number): Vec3Like {
    return {
      x: this.fx.filter(p.x, nowMs),
      y: this.fy.filter(p.y, nowMs),
      z: this.fz.filter(p.z, nowMs),
    };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}
