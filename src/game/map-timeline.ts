import { state } from '../core/state.ts';
import { getSettings } from '../core/settings.ts';
import { getAudioOffsetSec, getEffectiveMapDuration, getSongTimeSec } from '../core/timing.ts';
import { getMapDuration, getMapTime, hasMapAudio, pauseMapAudio, startMapAudio } from './audio.ts';
import { PRACTICE_TAIL_SEC, type ActivePractice } from '../core/practice.ts';

const MAP_LEAD_IN_MS = 1800;
const TRAINING_RATE = 0.75;

interface MapTimelineOptions {
  isTrainingMode(): boolean;
}

export class MapTimeline {
  private readonly options: MapTimelineOptions;
  private zeroAtMs = 0;
  /** Set for practice runs: the map is played from `startSec` to `endSec` at a custom tempo. */
  private practice: Readonly<ActivePractice> | null = null;
  private audioStarted = false;
  private pausedAtSec: number | null = null;
  private durationCacheMap: typeof state.map = null;
  private durationCacheBeats: NonNullable<typeof state.map>['beats'] | null = null;
  private durationCacheAudio = -1;
  private durationCacheValue = 0;

  constructor(options: MapTimelineOptions) {
    this.options = options;
  }

  get hasStartedAudio(): boolean {
    return this.audioStarted;
  }

  reset(): void {
    if (this.audioStarted) {
      window.dispatchEvent(new CustomEvent('hand-sabers:map-audio-stop'));
    }
    this.zeroAtMs = 0;
    this.audioStarted = false;
    this.pausedAtSec = null;
    this.practice = null;
  }

  start(now = performance.now(), practice: Readonly<ActivePractice> | null = null): void {
    this.practice = practice;
    this.startAt(now + MAP_LEAD_IN_MS);
  }

  startAt(zeroAtMs: number): void {
    this.zeroAtMs = zeroAtMs;
    this.audioStarted = false;
    this.pausedAtSec = null;
  }

  getTime(now = performance.now()): number {
    if (!state.map) return 0;
    const settings = getSettings();
    if (hasMapAudio() && this.audioStarted) return getSongTimeSec(getMapTime(), settings, state.map);
    if (!this.zeroAtMs) return 0;
    const elapsedSec = (now - this.zeroAtMs) / 1000;
    // The pre-roll (negative time) always runs at real speed; practice shifts the whole timeline.
    const songElapsedSec = (elapsedSec < 0 ? elapsedSec : elapsedSec * this.playbackRate) + this.startOffsetSec;
    return getSongTimeSec(songElapsedSec, settings, state.map);
  }

  getDuration(): number {
    if (this.practice) return this.practice.endSec + PRACTICE_TAIL_SEC;
    return this.getFullDuration();
  }

  /** Length of the whole map, ignoring any practice range. */
  getFullDuration(): number {
    const audioDuration = getMapDuration();
    const beats = state.map?.beats ?? null;
    if (
      this.durationCacheMap !== state.map
      || this.durationCacheBeats !== beats
      || this.durationCacheAudio !== audioDuration
    ) {
      this.durationCacheMap = state.map;
      this.durationCacheBeats = beats;
      this.durationCacheAudio = audioDuration;
      this.durationCacheValue = getEffectiveMapDuration(state.map, audioDuration);
    }
    return this.durationCacheValue;
  }

  updateAudioSchedule(now = performance.now()): void {
    if (!state.map || !hasMapAudio() || this.audioStarted || !this.zeroAtMs || now < this.zeroAtMs) return;
    const elapsedSec = Math.max(0, (now - this.zeroAtMs) / 1000) * this.playbackRate + this.startOffsetSec;
    if (getMapDuration() > 0 && elapsedSec >= getMapDuration()) {
      this.audioStarted = true;
      return;
    }
    startMapAudio(elapsedSec, 0, this.playbackRate);
    this.audioStarted = true;
    window.dispatchEvent(new CustomEvent('hand-sabers:map-audio-start', {
      detail: { offsetSec: elapsedSec, playbackRate: this.playbackRate },
    }));
  }

  pause(now = performance.now()): void {
    if (!state.map) return;
    this.pausedAtSec = this.getTime(now);
    if (hasMapAudio() && this.audioStarted) {
      pauseMapAudio();
      window.dispatchEvent(new CustomEvent('hand-sabers:map-audio-pause'));
    }
  }

  resume(now = performance.now()): void {
    if (!state.map || this.pausedAtSec === null) return;
    // `rawElapsedSec` is the audio position; `sinceStartSec` is relative to the run's zero point.
    const rawElapsedSec = this.pausedAtSec - getAudioOffsetSec(getSettings(), state.map);
    const sinceStartSec = rawElapsedSec - this.startOffsetSec;
    const realElapsedSec = sinceStartSec < 0 ? sinceStartSec : sinceStartSec / this.playbackRate;
    this.zeroAtMs = now - realElapsedSec * 1000;
    if (hasMapAudio()) {
      if (sinceStartSec >= 0) {
        startMapAudio(rawElapsedSec, 0, this.playbackRate);
        this.audioStarted = true;
        window.dispatchEvent(new CustomEvent('hand-sabers:map-audio-start', {
          detail: { offsetSec: rawElapsedSec, playbackRate: this.playbackRate },
        }));
      } else {
        this.audioStarted = false;
      }
    }
    this.pausedAtSec = null;
  }

  private get startOffsetSec(): number {
    return this.practice?.startSec ?? 0;
  }

  private get playbackRate(): number {
    if (this.practice) return this.practice.rate;
    return this.options.isTrainingMode() ? TRAINING_RATE : 1;
  }
}
