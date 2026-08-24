export const DEFAULT_PROFILE_COLOR = '#2f7cff';

export const PROFILE_COLOR_PRESETS = [
  '#2f7cff', '#36f2a1', '#a855f7', '#ec4899', '#f59e0b', '#ef4444',
] as const;

export function isProfileColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function sanitizeProfileColor(value: unknown): string {
  if (isProfileColor(value)) return value.toLowerCase();
  return DEFAULT_PROFILE_COLOR;
}
