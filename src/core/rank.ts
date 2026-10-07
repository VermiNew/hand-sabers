/** Letter rank shown on the results screen for a completed map. */
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

/** Minimum hit rate (percent of notes hit) for each rank, best first. */
const RANK_THRESHOLDS: ReadonlyArray<readonly [Rank, number]> = [
  ['S', 98],
  ['A', 90],
  ['B', 80],
  ['C', 65],
];

export function computeRank(accuracyPercent: number): Rank {
  const accuracy = Number.isFinite(accuracyPercent) ? accuracyPercent : 0;
  for (const [rank, minimum] of RANK_THRESHOLDS) {
    if (accuracy >= minimum) return rank;
  }
  return 'D';
}
