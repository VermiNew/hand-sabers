import type { OneHandMode, PerformanceMode, Settings, TrackingSourcePreference } from '../types/index.js';

const KEY = 'hs_settings';
const DEFAULT_PERFORMANCE_MODE: PerformanceMode = 'auto';
const PERFORMANCE_MODES: PerformanceMode[] = [
  DEFAULT_PERFORMANCE_MODE,
  'lowest',
  'very-low',
  'low',
  'medium',
  'high',
  'ultra',
  'maximum',
  'custom',
];
const NOTE_SPEED_PRESETS = [0.75, 1, 1.35, 1.75] as const;
const HITBOX_SENSITIVITY_PRESETS = [0.82, 1, 1.2] as const;
const LEGACY_MODE_MAP: Record<string, PerformanceMode> = {
  turbo: 'low',
  performance: 'medium',
  lowest: 'lowest',
  verylow: 'very-low',
  very_low: 'very-low',
  'very-low': 'very-low',
  balanced: 'high',
  quality: 'ultra',
};

function detectDefaultLanguage(): Settings['language'] {
  try {
    const stored = localStorage.getItem('lang');
    if (stored === 'pl' || stored === 'en') return stored;
  } catch {}
  if (typeof navigator !== 'undefined') {
    const languages = [...(navigator.languages ?? []), navigator.language]
      .map(language => String(language || '').toLowerCase());
    if (languages.some(language => language === 'pl' || language.startsWith('pl-'))) return 'pl';
    if (languages.some(language => language === 'en' || language.startsWith('en-'))) return 'en';
  }
  return 'pl';
}

export const DEFAULTS: Settings = {
  language: detectDefaultLanguage(),
  sensitivity: 1.0,
  flipCamera: false,
  volume: 0.8,
  musicVolume: 1.0,
  sfxVolume: 1.0,
  beatSoundVolume: 0.65,
  hitSoundVolume: 0.85,
  comboSoundVolume: 0.55,
  missSoundVolume: 0.75,
  bombSoundVolume: 0.8,
  milestoneSoundVolume: 0.7,
  noFail: false,
  saberColorLeft: '#36f2a1',
  saberColorRight: '#2f7cff',
  saberModel: 'classic',
  beatLimitEnabled: true,
  maxBeats: 10_000,
  developerMode: false,
  devAccent: 'green',
  oneHandMode: null,
  audioOffsetMs: 0,
  performanceMode: DEFAULT_PERFORMANCE_MODE,
  customAntialias: false,
  customReflections: true,
  customFloorGlows: true,
  customSaberGlints: true,
  customSaberTrails: true,
  customSaberTrailSamples: 10,
  customSaberTrailIntensity: 0.85,
  customArenaDetail: 1,
  customBackgroundShader: true,
  customFog: true,
  customGrid: true,
  customHitShards: 2,
  customRenderScale: 1,
  musicReactiveEnabled: true,
  musicReactiveIntensityMode: 'auto',
  musicReactiveIntensity: 1,
  interfaceSoundVolume: 0.8,
  playerName: 'Gracz',
  favoriteMapIds: [],
  noteSpeed: 1,
  hitboxSensitivity: 1,
  trainingMode: false,
  trackingSource: 'auto',
  gameMode: 'normal',
  arenaTheme: 'cosmic',
  calibrationMode: 'auto',
  rememberCalibration: false,
  savedCalibration: null,
  avatar: 'default',
  profileCompleted: false,
  phoneAudioOutput: false,
  phoneAudioLatencyMs: 0,
};

let _settings: Settings = { ...DEFAULTS };

function normalizePerformanceMode(mode: unknown): PerformanceMode {
  const value = String(mode || DEFAULT_PERFORMANCE_MODE);
  const normalized = LEGACY_MODE_MAP[value] || value;
  return PERFORMANCE_MODES.includes(normalized as PerformanceMode)
    ? normalized as PerformanceMode
    : DEFAULT_PERFORMANCE_MODE;
}

function normalizeNoteSpeed(value: unknown): number {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return DEFAULTS.noteSpeed;
  return NOTE_SPEED_PRESETS.reduce((closest, preset) => (
    Math.abs(preset - speed) < Math.abs(closest - speed) ? preset : closest
  ));
}

function normalizeHitboxSensitivity(value: unknown): number {
  const sensitivity = Number(value);
  if (!Number.isFinite(sensitivity)) return DEFAULTS.hitboxSensitivity;
  return HITBOX_SENSITIVITY_PRESETS.reduce((closest, preset) => (
    Math.abs(preset - sensitivity) < Math.abs(closest - sensitivity) ? preset : closest
  ));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeMusicReactiveIntensityMode(value: unknown): Settings['musicReactiveIntensityMode'] {
  return value === 'manual' ? 'manual' : 'auto';
}

function normalizeTrackingSource(value: unknown): TrackingSourcePreference {
  return value === 'camera' || value === 'phone' ? value : 'auto';
}

function normalizeLanguage(value: unknown): Settings['language'] {
  if (value === 'pl' || value === 'en') return value;
  return detectDefaultLanguage();
}

function normalizeOneHandMode(value: unknown): OneHandMode {
  return value === 'left' || value === 'right' ? value : null;
}

function normalizeFavoriteMapIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((id): id is string => typeof id === 'string')
    .map(id => id.trim())
    .filter(id => id.length > 0 && id.length <= 160);
  return [...new Set(ids)].slice(0, 500);
}

function normalizeSettings(value: Partial<Settings>): Settings {
  const normalized = { ...DEFAULTS, ...value };
  normalized.performanceMode = normalizePerformanceMode(normalized.performanceMode);
  normalized.noteSpeed = normalizeNoteSpeed(normalized.noteSpeed);
  normalized.hitboxSensitivity = normalizeHitboxSensitivity(normalized.hitboxSensitivity);
  normalized.customHitShards = Math.round(clampNumber(normalized.customHitShards, 0, 7, DEFAULTS.customHitShards));
  normalized.customSaberTrailSamples = Math.round(clampNumber(normalized.customSaberTrailSamples, 0, 16, DEFAULTS.customSaberTrailSamples));
  normalized.customSaberTrailIntensity = clampNumber(normalized.customSaberTrailIntensity, 0, 1.25, DEFAULTS.customSaberTrailIntensity);
  normalized.customArenaDetail = clampNumber(normalized.customArenaDetail, 0, 1.25, DEFAULTS.customArenaDetail);
  normalized.customRenderScale = clampNumber(normalized.customRenderScale, 0.5, 1.5, DEFAULTS.customRenderScale);
  normalized.musicReactiveIntensityMode = normalizeMusicReactiveIntensityMode(normalized.musicReactiveIntensityMode);
  normalized.musicReactiveIntensity = clampNumber(normalized.musicReactiveIntensity, 0, 1.5, DEFAULTS.musicReactiveIntensity);
  normalized.trackingSource = normalizeTrackingSource(normalized.trackingSource);
  normalized.language = normalizeLanguage(value.language);
  normalized.oneHandMode = normalizeOneHandMode(normalized.oneHandMode);
  normalized.favoriteMapIds = normalizeFavoriteMapIds(normalized.favoriteMapIds);
  return normalized;
}

function replaceInMemorySettings(value: Settings): void {
  const mutableSettings = _settings as unknown as Record<string, unknown>;
  for (const key of Object.keys(mutableSettings)) delete mutableSettings[key];
  Object.assign(_settings, value);
}

export function loadSettings(): Settings {
  let loaded: Partial<Settings> = _settings;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        loaded = parsed as Partial<Settings>;
      }
    }
  } catch {}
  replaceInMemorySettings(normalizeSettings(loaded));
  return _settings;
}

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(_settings)); } catch {}
}

export function resetSettings(): Settings {
  replaceInMemorySettings(normalizeSettings(DEFAULTS));
  saveSettings();
  return _settings;
}

export function replaceSettings(value: Settings): Settings {
  const normalized = normalizeSettings(value);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  replaceInMemorySettings(normalized);
  return _settings;
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return _settings[key];
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  _settings[key] = value;
  saveSettings();
}

export function getSettings(): Settings {
  return _settings;
}
