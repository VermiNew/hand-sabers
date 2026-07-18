import { getBeatHitTimeSec, isBeatTooLate, shouldSpawnBeat } from '../core/timing.ts';
import type { Beat } from '../types/index.js';

const SPAWN_LOOKAHEAD_SEC = 0.12;
const DROP_LATE_BY_SEC = 0.45;

export interface QueuedBeat {
  beat: Beat;
  index: number;
  hitTime: number;
}

export class MapSpawnQueue {
  private source: Beat[] | null = null;
  private queue: QueuedBeat[] = [];
  private nextIndex = 0;
  private lastTimeSec = 0;

  takeDue(beats: Beat[], currentTimeSec: number, approachSec: number): QueuedBeat[] {
    this.ensureSource(beats);
    if (currentTimeSec < this.lastTimeSec - 0.35) this.nextIndex = 0;
    this.lastTimeSec = currentTimeSec;

    const due: QueuedBeat[] = [];
    while (this.nextIndex < this.queue.length) {
      const entry = this.queue[this.nextIndex]!;
      if (!shouldSpawnBeat(entry.beat, currentTimeSec, approachSec, SPAWN_LOOKAHEAD_SEC)) break;
      this.nextIndex++;
      if (!isBeatTooLate(entry.beat, currentTimeSec, DROP_LATE_BY_SEC)) due.push(entry);
    }
    return due;
  }

  reset(): void {
    this.source = null;
    this.queue = [];
    this.nextIndex = 0;
    this.lastTimeSec = 0;
  }

  private ensureSource(beats: Beat[]): void {
    if (beats === this.source) return;
    this.source = beats;
    this.queue = beats
      .map((beat, index) => ({ beat, index, hitTime: getBeatHitTimeSec(beat) }))
      .sort((left, right) => left.hitTime - right.hitTime || left.index - right.index);
    this.nextIndex = 0;
    this.lastTimeSec = 0;
  }
}
