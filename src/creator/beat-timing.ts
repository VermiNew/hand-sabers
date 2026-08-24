import { state } from './state.ts';

interface TimedBeat {
  t: number;
}

function mapDuration(): number | null {
  const duration = Number(state.map.meta.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function clampMapTime(time: number): number {
  const duration = mapDuration();
  return duration === null ? Math.max(0, time) : Math.max(0, Math.min(time, duration));
}

export function fitBeatsWithinMap<T extends TimedBeat>(
  beats: readonly T[],
  rawTimeForBeat: (beat: T) => number,
  snapTime: (time: number) => number,
): T[] {
  if (!beats.length) return [];
  const rawTimes = beats.map(rawTimeForBeat);
  const duration = mapDuration();
  const latest = Math.max(...rawTimes);
  const earliest = Math.min(...rawTimes);
  const shift = duration === null ? (earliest < 0 ? -earliest : 0) : Math.min(0, duration - latest) + (earliest < 0 ? -earliest : 0);

  return beats.map((beat, index) => ({
    ...beat,
    t: clampMapTime(snapTime(rawTimes[index]! + shift)),
  }));
}

export function canCreateHeldAt(time: number, minimumDuration = 0.05): boolean {
  const duration = mapDuration();
  return duration === null || time <= duration - minimumDuration;
}

export function clampHeldDuration(startTime: number, duration: number, minimumDuration = 0.05): number {
  const maxDuration = mapDuration() === null ? Infinity : Math.max(0, mapDuration()! - startTime);
  return Math.min(Math.max(minimumDuration, duration), maxDuration);
}
