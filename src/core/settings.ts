import type { PerformanceMode, Settings } from '../types/index.js';

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
];
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

export const DEFAULTS: Settings = {
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
  playerName: 'Gracz',
};

let _settings: Settings = { ...DEFAULTS };

function normalizePerformanceMode(mode: unknown): PerformanceMode {
  const value = String(mode || DEFAULT_PERFORMANCE_MODE);
  const normalized = LEGACY_MODE_MAP[value] || value;
  return PERFORMANCE_MODES.includes(normalized as PerformanceMode)
    ? normalized as PerformanceMode
    : DEFAULT_PERFORMANCE_MODE;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) _settings = { ...DEFAULTS, ...JSON.parse(raw) as Partial<Settings> };
  } catch {}
  _settings.performanceMode = normalizePerformanceMode(_settings.performanceMode);
  return _settings;
}

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(_settings)); } catch {}
}

export function resetSettings(): Settings {
  const mutableSettings = _settings as unknown as Record<string, unknown>;
  for (const key of Object.keys(mutableSettings)) delete mutableSettings[key];
  Object.assign(_settings, DEFAULTS);
  saveSettings();
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
