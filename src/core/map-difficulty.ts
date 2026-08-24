export const MAP_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;

export type MapDifficulty = typeof MAP_DIFFICULTIES[number];

export interface DifficultyBeat {
  t?: unknown;
  type?: unknown;
  cut?: unknown;
  side?: unknown;
  x?: unknown;
  y?: unknown;
  duration?: unknown;
}

export interface DifficultyMap {
  meta?: { duration?: unknown; bpm?: unknown };
  beats?: readonly DifficultyBeat[];
}

export interface MapDifficultyMetrics {
  noteDensityPerSecond: number;
  peakNotesPerSecond: number;
  heldRatio: number;
  multiCubeGroups: number;
  directionChangesPerSecond: number;
  positionSpread: number;
}

export interface MapDifficultySuggestion {
  difficulty: MapDifficulty;
  score: number;
  metrics: MapDifficultyMetrics;
}

interface AnalyzedBeat {
  t: number;
  type: string;
  cut: string;
  x: number;
  y: number;
  duration: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toAnalyzedBeat(beat: DifficultyBeat): AnalyzedBeat | null {
  const t = finite(beat.t, -1);
  if (t < 0) return null;

  const side = String(beat.side ?? 'random');
  const x = Number.isFinite(Number(beat.x))
    ? Number(beat.x)
    : side === 'left' ? -0.82 : side === 'right' ? 0.82 : 0;
  const y = Number.isFinite(Number(beat.y)) ? Number(beat.y) : 1.1;
  return {
    t,
    type: String(beat.type ?? 'block'),
    cut: String(beat.cut ?? 'any'),
    x,
    y,
    duration: Math.max(0, finite(beat.duration)),
  };
}

function inferDuration(map: DifficultyMap, beats: readonly AnalyzedBeat[]): number {
  const declaredDuration = finite(map.meta?.duration);
  const lastBeat = beats.at(-1);
  const inferredDuration = lastBeat ? Math.max(1, lastBeat.t + lastBeat.duration) : 0;
  return Math.max(declaredDuration, inferredDuration);
}

function inferDifficulty(score: number): MapDifficulty {
  if (score <= 25) return 'easy';
  if (score <= 60) return 'medium';
  if (score <= 80) return 'hard';
  return 'expert';
}

/**
 * Produces a transparent, advisory-only difficulty estimate. It does not
 * validate reachability and must never replace the mapper's chosen metadata.
 */
export function suggestMapDifficulty(map: DifficultyMap): MapDifficultySuggestion | null {
  const beats = (map.beats ?? [])
    .map(toAnalyzedBeat)
    .filter((beat): beat is AnalyzedBeat => beat !== null)
    .sort((a, b) => a.t - b.t);
  const playable = beats.filter(beat => beat.type !== 'bomb');
  if (!playable.length) return null;

  const duration = inferDuration(map, beats);
  if (duration <= 0) return null;

  const bombs = beats.length - playable.length;
  const noteDensityPerSecond = playable.length / duration;
  let peakCount = 0;
  let multiCubeGroups = 0;
  let groupStart = 0;
  for (let start = 0; start < beats.length; start++) {
    while (groupStart < beats.length && beats[groupStart]!.t < beats[start]!.t - 2) groupStart++;
    peakCount = Math.max(peakCount, start - groupStart + 1);
  }
  for (let start = 0; start < playable.length;) {
    let end = start + 1;
    while (end < playable.length && playable[end]!.t - playable[start]!.t <= 0.5) end++;
    if (end - start >= 4) multiCubeGroups++;
    start = end;
  }

  const heldDuration = playable
    .filter(beat => beat.type === 'held')
    .reduce((total, beat) => total + beat.duration, 0);
  const heldRatio = heldDuration / duration;

  let directionChanges = 0;
  for (let index = 1; index < playable.length; index++) {
    const previous = playable[index - 1]!;
    const current = playable[index]!;
    if (previous.cut !== 'any' && current.cut !== 'any' && previous.cut !== current.cut) directionChanges++;
  }
  const directionChangesPerSecond = directionChanges / duration;

  const xs = playable.map(beat => beat.x);
  const ys = playable.map(beat => beat.y);
  const positionSpread = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const bpm = finite(map.meta?.bpm);

  const score = clamp(Math.round(
    clamp(noteDensityPerSecond * 12, 0, 34)
    + clamp((peakCount / 2) * 6, 0, 20)
    + clamp((bpm - 110) / 12, 0, 8)
    + clamp(directionChangesPerSecond * 7, 0, 12)
    + clamp(positionSpread * 4, 0, 10)
    + clamp(heldRatio * 18, 0, 8)
    + clamp(multiCubeGroups * 2.5, 0, 8)
    + clamp(bombs / Math.max(1, playable.length) * 12, 0, 6),
  ), 0, 100);

  return {
    difficulty: inferDifficulty(score),
    score,
    metrics: {
      noteDensityPerSecond: Math.round(noteDensityPerSecond * 100) / 100,
      peakNotesPerSecond: Math.round((peakCount / 2) * 100) / 100,
      heldRatio: Math.round(heldRatio * 100) / 100,
      multiCubeGroups,
      directionChangesPerSecond: Math.round(directionChangesPerSecond * 100) / 100,
      positionSpread: Math.round(positionSpread * 100) / 100,
    },
  };
}
