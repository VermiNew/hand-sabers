import type { PerformanceMode, Settings } from '../types/index.js';

const KEY = 'hs_settings';
const DEFAULT_PERFORMANCE_MODE: PerformanceMode = 'auto';

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
  beatLimitEnabled: true,
  maxBeats: 5000,
  developerMode: false,
  oneHandMode: null,
  audioOffsetMs: 0,
  performanceMode: DEFAULT_PERFORMANCE_MODE,
  playerName: 'Gracz',
};

let _settings: Settings = { ...DEFAULTS };

function normalizePerformanceMode(mode: unknown): PerformanceMode {
  const value = String(mode || DEFAULT_PERFORMANCE_MODE);
  return ['auto', 'lowest', 'very-low', 'low', 'medium', 'high', 'ultra', 'maximum'].includes(value)
    ? value as PerformanceMode
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
