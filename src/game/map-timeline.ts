import { state } from '../core/state.ts';
import { getSettings } from '../core/settings.ts';
import { getAudioOffsetSec, getEffectiveMapDuration, getSongTimeSec } from '../core/timing.ts';
import { getMapDuration, getMapTime, hasMapAudio, pauseMapAudio, startMapAudio } from './audio.ts';

const MAP_LEAD_IN_MS = 1800;
const TRAINING_RATE = 0.75;

interface MapTimelineOptions {
  isTrainingMode(): boolean;
}

export class MapTimeline {
  private readonly options: MapTimelineOptions;
  private zeroAtMs = 0;
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
    this.zeroAtMs = 0;
    this.audioStarted = false;
    this.pausedAtSec = null;
  }

  start(now = performance.now()): void {
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
    const songElapsedSec = elapsedSec < 0 ? elapsedSec : elapsedSec * this.playbackRate;
    return getSongTimeSec(songElapsedSec, settings, state.map);
  }

  getDuration(): number {
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
    const elapsedSec = Math.max(0, (now - this.zeroAtMs) / 1000) * this.playbackRate;
    if (getMapDuration() > 0 && elapsedSec >= getMapDuration()) {
      this.audioStarted = true;
      return;
    }
    startMapAudio(elapsedSec, 0, this.playbackRate);
    this.audioStarted = true;
  }

  pause(now = performance.now()): void {
    if (!state.map) return;
    this.pausedAtSec = this.getTime(now);
    if (hasMapAudio() && this.audioStarted) pauseMapAudio();
  }

  resume(now = performance.now()): void {
    if (!state.map || this.pausedAtSec === null) return;
    const rawElapsedSec = this.pausedAtSec - getAudioOffsetSec(getSettings(), state.map);
    const realElapsedSec = rawElapsedSec < 0 ? rawElapsedSec : rawElapsedSec / this.playbackRate;
    this.zeroAtMs = now - realElapsedSec * 1000;
    if (hasMapAudio()) {
      if (rawElapsedSec >= 0) {
        startMapAudio(rawElapsedSec, 0, this.playbackRate);
        this.audioStarted = true;
      } else {
        this.audioStarted = false;
      }
    }
    this.pausedAtSec = null;
  }

  private get playbackRate(): number {
    return this.options.isTrainingMode() ? TRAINING_RATE : 1;
  }
}
