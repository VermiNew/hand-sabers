export interface MultiplayerGameplaySettings {
  noFail: boolean;
  trainingMode: boolean;
  noteSpeed: 0.75 | 1 | 1.35 | 1.75;
  hitboxSensitivity: 0.82 | 1 | 1.2;
}

let activeSettings: MultiplayerGameplaySettings | null = null;

export function parseMultiplayerGameplaySettings(value: unknown): MultiplayerGameplaySettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const settings = value as Record<string, unknown>;
  const noteSpeed = settings['noteSpeed'];
  const hitboxSensitivity = settings['hitboxSensitivity'];
  if (
    typeof settings['noFail'] !== 'boolean'
    || typeof settings['trainingMode'] !== 'boolean'
    || (noteSpeed !== 0.75 && noteSpeed !== 1 && noteSpeed !== 1.35 && noteSpeed !== 1.75)
    || (hitboxSensitivity !== 0.82 && hitboxSensitivity !== 1 && hitboxSensitivity !== 1.2)
  ) return null;
  return {
    noFail: settings['noFail'],
    trainingMode: settings['trainingMode'],
    noteSpeed,
    hitboxSensitivity,
  };
}

export function setActiveMultiplayerGameplaySettings(value: MultiplayerGameplaySettings | null): void {
  activeSettings = value ? { ...value } : null;
}

export function getActiveMultiplayerGameplaySettings(): Readonly<MultiplayerGameplaySettings> | null {
  return activeSettings;
}
