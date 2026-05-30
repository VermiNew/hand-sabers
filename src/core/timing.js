export const DEFAULT_APPROACH_SEC = 1.8;
export const SPAWN_LOOKAHEAD_SEC = 0.12;
export const DROP_LATE_BY_SEC = 0.45;
export const MAP_END_TAIL_SEC = 3.0;

export function getAudioOffsetSec(settings = {}, map = null) {
  const globalMs = Number(settings?.audioOffsetMs ?? 0);
  const mapMs = Number(map?.meta?.audioOffsetMs ?? 0);
  const totalMs = (Number.isFinite(globalMs) ? globalMs : 0) + (Number.isFinite(mapMs) ? mapMs : 0);
  return Math.max(-1, Math.min(1, totalMs / 1000));
}

export function getSongTimeSec(audioTimeSec, settings = {}, map = null) {
  const audioTime = Number(audioTimeSec);
  return (Number.isFinite(audioTime) ? audioTime : 0) + getAudioOffsetSec(settings, map);
}

export function getBeatHitTimeSec(beat) {
  const t = Number(beat?.t ?? beat?.time ?? beat?.timeSec ?? 0);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

export function getLastBeatTimeSec(beats) {
  if (!Array.isArray(beats) || !beats.length) return 0;
  let max = 0;
  for (const beat of beats) max = Math.max(max, getBeatHitTimeSec(beat));
  return max;
}

export function getEffectiveMapDuration(map = null, audioDurationSec = 0, tailSec = MAP_END_TAIL_SEC) {
  const audioDuration = Number(audioDurationSec);
  if (Number.isFinite(audioDuration) && audioDuration > 0) return audioDuration;

  const metaDuration = Number(map?.meta?.duration ?? map?.duration ?? 0);
  if (Number.isFinite(metaDuration) && metaDuration > 0) return metaDuration;

  const lastBeat = getLastBeatTimeSec(map?.beats);
  return lastBeat > 0 ? lastBeat + Math.max(0, Number(tailSec) || 0) : 0;
}

export function shouldSpawnBeat(beat, songTimeSec, approachSec = DEFAULT_APPROACH_SEC, lookaheadSec = SPAWN_LOOKAHEAD_SEC) {
  const hitTime = getBeatHitTimeSec(beat);
  const spawnTime = hitTime - approachSec;
  return spawnTime <= songTimeSec + lookaheadSec;
}

export function isBeatTooLate(beat, songTimeSec, dropLateBySec = DROP_LATE_BY_SEC) {
  return getBeatHitTimeSec(beat) < songTimeSec - dropLateBySec;
}

export function noteZAtSongTime({ hitTimeSec, songTimeSec, spawnZ, hitZ, approachSec = DEFAULT_APPROACH_SEC }) {
  const untilHit = hitTimeSec - songTimeSec;
  const progress = Math.max(0, Math.min(1.35, 1 - untilHit / approachSec));
  return spawnZ + (hitZ - spawnZ) * progress;
}

export function nearestBeatDeltaMs(beats, songTimeSec) {
  if (!Array.isArray(beats) || !beats.length) return null;
  let best = null;
  for (const beat of beats) {
    const deltaMs = Math.round((getBeatHitTimeSec(beat) - songTimeSec) * 1000);
    if (best === null || Math.abs(deltaMs) < Math.abs(best.deltaMs)) {
      best = { beat, timeSec: getBeatHitTimeSec(beat), deltaMs };
    }
  }
  return best;
}
