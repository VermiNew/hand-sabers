/** Strict host-to-phone configuration for the hand tracking model. */

export interface HandTrackingOptions {
  handDetectionConfidence: number;
  handPresenceConfidence: number;
  handTrackingConfidence: number;
}

export interface TrackingOptionsCommand {
  v: 1;
  type: 'tracking-options';
  options: HandTrackingOptions;
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isTrackingOptionsCommand(value: unknown): value is TrackingOptionsCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  const options = command['options'];
  if (command['v'] !== 1 || command['type'] !== 'tracking-options' || !options || typeof options !== 'object') return false;
  const values = options as Record<string, unknown>;
  return isConfidence(values['handDetectionConfidence'])
    && isConfidence(values['handPresenceConfidence'])
    && isConfidence(values['handTrackingConfidence']);
}
