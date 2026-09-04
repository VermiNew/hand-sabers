import type { CutDirection, SaberSide } from '../types/index.js';

export const GAMEPLAY_FEEDBACK_EVENT = 'hand-sabers:gameplay-feedback';

export type GameplayFeedback =
  | {
      type: 'block-hit';
      side: SaberSide;
      cut: CutDirection;
      quality: 'PERFECT' | 'GOOD' | 'BAD';
      timingMs: number;
      combo: number;
    }
  | { type: 'block-miss'; side: SaberSide; combo: number }
  | { type: 'bomb-hit'; combo: number }
  | { type: 'held-complete'; side: SaberSide; combo: number }
  | { type: 'held-break'; side: SaberSide; combo: number };

export function emitGameplayFeedback(feedback: GameplayFeedback): void {
  window.dispatchEvent(new CustomEvent<GameplayFeedback>(GAMEPLAY_FEEDBACK_EVENT, { detail: feedback }));
}
