import type { PauseReason } from '../types/index.js';

export const PAUSE_REASONS = Object.freeze({
  NONE: null,
  MANUAL: 'manual',
  HANDS: 'hands',
  FOCUS: 'focus',
});

export function canAutoResumeFromHands(pauseReason: PauseReason): boolean {
  return pauseReason === PAUSE_REASONS.HANDS;
}
