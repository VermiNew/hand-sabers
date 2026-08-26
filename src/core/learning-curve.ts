import {
  MAP_DIFFICULTIES,
  suggestMapDifficulty,
  type DifficultyBeat,
  type MapDifficulty,
} from './map-difficulty.ts';

export interface LearningCurveMap {
  id: string;
  meta?: { duration?: unknown; bpm?: unknown };
  beats?: readonly DifficultyBeat[];
}

export interface LearningCurveProgress {
  mapId: string;
  progress?: number;
}

export type LearningCurveReason = 'start' | 'continue' | 'advance' | 'practice';

export interface LearningCurveRecommendation {
  mapId: string;
  difficulty: MapDifficulty;
  difficultyScore: number;
  reason: LearningCurveReason;
}

interface AnalyzedLearningMap extends LearningCurveRecommendation {
  progress: number;
  rank: number;
}

const COMPLETION_PROGRESS = 0.9;
const STARTED_PROGRESS = 0.05;

function clampProgress(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

/**
 * Selects one advisory next map. It never locks content or changes mapper data.
 */
export function recommendLearningCurveMap(
  maps: readonly LearningCurveMap[],
  scores: readonly LearningCurveProgress[],
): LearningCurveRecommendation | null {
  const progressByMap = new Map<string, number>();
  for (const score of scores) {
    progressByMap.set(score.mapId, Math.max(
      progressByMap.get(score.mapId) ?? 0,
      clampProgress(score.progress),
    ));
  }

  const analyzed = maps.flatMap<AnalyzedLearningMap>(map => {
    const suggestion = suggestMapDifficulty(map);
    if (!suggestion) return [];
    return [{
      mapId: map.id,
      difficulty: suggestion.difficulty,
      difficultyScore: suggestion.score,
      progress: progressByMap.get(map.id) ?? 0,
      rank: MAP_DIFFICULTIES.indexOf(suggestion.difficulty),
      reason: 'start',
    }];
  });
  if (!analyzed.length) return null;

  const mastered = analyzed.filter(map => map.progress >= COMPLETION_PROGRESS);
  const remaining = analyzed.filter(map => map.progress < COMPLETION_PROGRESS);
  if (!remaining.length) return null;

  const highestMasteredRank = mastered.reduce((highest, map) => Math.max(highest, map.rank), -1);
  const targetRank = highestMasteredRank < 0
    ? 0
    : Math.min(MAP_DIFFICULTIES.length - 1, highestMasteredRank + 1);
  remaining.sort((left, right) => {
    const leftDistance = Math.abs(left.rank - targetRank);
    const rightDistance = Math.abs(right.rank - targetRank);
    return leftDistance - rightDistance
      || right.progress - left.progress
      || left.difficultyScore - right.difficultyScore
      || left.mapId.localeCompare(right.mapId);
  });

  const selected = remaining[0]!;
  const reason: LearningCurveReason = selected.progress >= STARTED_PROGRESS
    ? 'continue'
    : highestMasteredRank < 0
      ? 'start'
      : selected.rank > highestMasteredRank
        ? 'advance'
        : 'practice';
  return {
    mapId: selected.mapId,
    difficulty: selected.difficulty,
    difficultyScore: selected.difficultyScore,
    reason,
  };
}
