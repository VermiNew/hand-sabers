export const CURRENT_SCORING_VERSION = 2;
export const LEGACY_SCORING_VERSION = 1;

export interface VersionedScore {
  score: number;
  scoringVersion?: number;
}

export function getScoringVersion(score: Pick<VersionedScore, 'scoringVersion'>): number {
  return Number.isSafeInteger(score.scoringVersion) && (score.scoringVersion ?? 0) > 0
    ? score.scoringVersion!
    : LEGACY_SCORING_VERSION;
}

export function compareScores(a: VersionedScore, b: VersionedScore): number {
  return getScoringVersion(b) - getScoringVersion(a) || b.score - a.score;
}
