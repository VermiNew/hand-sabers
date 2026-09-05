import type { NarratorCue } from '../types/index.js';

interface MapNarratorTimelineOptions {
  hideCue(): void;
  showCue(cue: NarratorCue): void;
}

export interface MapNarratorTimeline {
  reset(cues?: readonly NarratorCue[]): void;
  update(timeSec: number, active: boolean): void;
}

export function createMapNarratorTimeline({ hideCue, showCue }: MapNarratorTimelineOptions): MapNarratorTimeline {
  let cues: readonly NarratorCue[] = [];
  let nextIndex = 0;
  let lastTimeSec = Number.NEGATIVE_INFINITY;
  let ownsVisibleCue = false;

  return {
    reset(nextCues = []): void {
      if (ownsVisibleCue) hideCue();
      cues = nextCues;
      nextIndex = 0;
      lastTimeSec = Number.NEGATIVE_INFINITY;
      ownsVisibleCue = false;
    },

    update(timeSec, active): void {
      if (!active || !Number.isFinite(timeSec)) return;
      if (timeSec + 0.05 < lastTimeSec) {
        nextIndex = cues.findIndex(cue => cue.t > timeSec);
        if (nextIndex < 0) nextIndex = cues.length;
      }

      let latestDueCue: NarratorCue | null = null;
      while (nextIndex < cues.length && cues[nextIndex]!.t <= timeSec + 0.03) {
        latestDueCue = cues[nextIndex]!;
        nextIndex++;
      }
      if (latestDueCue) {
        showCue(latestDueCue);
        ownsVisibleCue = true;
      }
      lastTimeSec = timeSec;
    },
  };
}
