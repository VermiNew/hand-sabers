import { state } from '../core/state.ts';
import { sendMultiplayerScore } from '../multiplayer/client.ts';

const SCORE_PUBLISH_INTERVAL_MS = 100;

export interface MultiplayerScorePublisher {
  publish(now: number, progress: number): void;
  reset(): void;
}

export function createMultiplayerScorePublisher(isRoundActive: () => boolean): MultiplayerScorePublisher {
  let lastScoreAt = 0;

  function publish(now: number, progress: number): void {
    if (!isRoundActive() || now - lastScoreAt < SCORE_PUBLISH_INTERVAL_MS) return;
    if (sendMultiplayerScore({
      score: Math.max(0, Math.round(state.score)),
      combo: Math.max(0, Math.round(state.combo)),
      lives: Math.max(0, Math.round(state.lives)),
      progress: Math.max(0, Math.min(1, progress)),
    })) {
      lastScoreAt = now;
    }
  }

  return { publish, reset: () => { lastScoreAt = 0; } };
}
