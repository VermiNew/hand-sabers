export const PAUSE_REASONS = Object.freeze({
  NONE: null,
  MANUAL: 'manual',
  HANDS: 'hands',
});

export function canAutoResumeFromHands(pauseReason) {
  return pauseReason === PAUSE_REASONS.HANDS;
}
