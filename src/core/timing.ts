export const DEFAULT_APPROACH_SEC = 1.8;
export const SPAWN_LOOKAHEAD_SEC = 0.12;
export const DROP_LATE_BY_SEC = 0.45;
export const MAP_END_TAIL_SEC = 3.0;

interface TimingSettings {
  audioOffsetMs?: unknown;
}

interface TimingBeat {
  t?: unknown;
  time?: unknown;
  timeSec?: unknown;
}

interface TimingMap {
  meta?: {
    audioOffsetMs?: unknown;
    duration?: unknown;
  };
  duration?: unknown;
  beats?: readonly TimingBeat[] | null;
}

interface NotePositionOptions {
  hitTimeSec: number;
  songTimeSec: number;
  spawnZ: number;
  hitZ: number;
  approachSec?: number;
}

interface NearestBeat<T extends TimingBeat> {
  beat: T;
  timeSec: number;
  deltaMs: number;
}

export function getAudioOffsetSec(settings: TimingSettings = {}, map: TimingMap | null = null): number {
  const globalMs = Number(settings?.audioOffsetMs ?? 0);
  const mapMs = Number(map?.meta?.audioOffsetMs ?? 0);
  const totalMs = (Number.isFinite(globalMs) ? globalMs : 0) + (Number.isFinite(mapMs) ? mapMs : 0);
  return Math.max(-1, Math.min(1, totalMs / 1000));
}

export function getSongTimeSec(
  audioTimeSec: unknown,
  settings: TimingSettings = {},
  map: TimingMap | null = null,
): number {
  const audioTime = Number(audioTimeSec);
  return (Number.isFinite(audioTime) ? audioTime : 0) + getAudioOffsetSec(settings, map);
}

export function getBeatHitTimeSec(beat: TimingBeat | null | undefined): number {
  const t = Number(beat?.t ?? beat?.time ?? beat?.timeSec ?? 0);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

export function getLastBeatTimeSec(beats: readonly TimingBeat[] | null | undefined): number {
  if (!Array.isArray(beats) || !beats.length) return 0;
  let max = 0;
  for (const beat of beats) max = Math.max(max, getBeatHitTimeSec(beat));
  return max;
}

export function getEffectiveMapDuration(
  map: TimingMap | null = null,
  audioDurationSec: unknown = 0,
  tailSec: unknown = MAP_END_TAIL_SEC,
): number {
  const audioDuration = Number(audioDurationSec);
  if (Number.isFinite(audioDuration) && audioDuration > 0) return audioDuration;

  const metaDuration = Number(map?.meta?.duration ?? map?.duration ?? 0);
  if (Number.isFinite(metaDuration) && metaDuration > 0) return metaDuration;

  const lastBeat = getLastBeatTimeSec(map?.beats);
  return lastBeat > 0 ? lastBeat + Math.max(0, Number(tailSec) || 0) : 0;
}

export function shouldSpawnBeat(
  beat: TimingBeat | null | undefined,
  songTimeSec: number,
  approachSec = DEFAULT_APPROACH_SEC,
  lookaheadSec = SPAWN_LOOKAHEAD_SEC,
): boolean {
  const hitTime = getBeatHitTimeSec(beat);
  const spawnTime = hitTime - approachSec;
  return spawnTime <= songTimeSec + lookaheadSec;
}

export function isBeatTooLate(
  beat: TimingBeat | null | undefined,
  songTimeSec: number,
  dropLateBySec = DROP_LATE_BY_SEC,
): boolean {
  return getBeatHitTimeSec(beat) < songTimeSec - dropLateBySec;
}

export function noteZAtSongTime({
  hitTimeSec,
  songTimeSec,
  spawnZ,
  hitZ,
  approachSec = DEFAULT_APPROACH_SEC,
}: NotePositionOptions): number {
  const untilHit = hitTimeSec - songTimeSec;
  const progress = Math.max(0, Math.min(1.35, 1 - untilHit / approachSec));
  return spawnZ + (hitZ - spawnZ) * progress;
}

export function nearestBeatDeltaMs<T extends TimingBeat>(
  beats: readonly T[] | null | undefined,
  songTimeSec: number,
): NearestBeat<T> | null {
  if (!Array.isArray(beats) || !beats.length) return null;
  let best: NearestBeat<T> | null = null;
  for (const beat of beats) {
    const deltaMs = Math.round((getBeatHitTimeSec(beat) - songTimeSec) * 1000);
    if (best === null || Math.abs(deltaMs) < Math.abs(best.deltaMs)) {
      best = { beat, timeSec: getBeatHitTimeSec(beat), deltaMs };
    }
  }
  return best;
}
