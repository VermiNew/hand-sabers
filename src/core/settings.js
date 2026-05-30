import { DEFAULT_PERFORMANCE_MODE, getPerformanceMode } from './performance.js';

// Ustawienia zapisywane w localStorage
const KEY = 'hs_settings';

const DEFAULTS = {
  sensitivity:  1.0,   // 0.5 – 2.0
  flipCamera:   false, // lustrzane odwrócenie osi X
  volume:       0.8,   // master: 0.0 – 1.0
  musicVolume:  1.0,   // muzyka/mapa
  sfxVolume:    1.0,   // globalne efekty
  beatSoundVolume: 0.65,      // metronom / beat cue
  hitSoundVolume:  0.85,      // trafienie bloku
  comboSoundVolume: 0.55,     // ton combo przy trafieniu
  missSoundVolume: 0.75,      // pudło / utrata HP
  bombSoundVolume: 0.8,       // bomba
  milestoneSoundVolume: 0.7,  // milestone combo
  noFail:       false,
  playerName:   'Gracz',
  saberColorLeft:  '#36f2a1',  // domyślny kolor lewego miecza (THEME.left)
  saberColorRight: '#2f7cff',  // domyślny kolor prawego miecza (THEME.right)
  beatLimitEnabled: true,   // czy limit jest aktywny
  maxBeats: 5000,           // limit użytkownika (może być wyłączony)
  developerMode: false, // panel diagnostyczny + metryki renderowania
  oneHandMode:  null,  // null | 'left' | 'right'
  audioOffsetMs: 0,     // globalny offset map/audio (-1000 – +1000 ms)
  performanceMode: DEFAULT_PERFORMANCE_MODE, // auto | lowest | very-low | low | medium | high | ultra | maximum
};

let _settings = { ...DEFAULTS };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) _settings = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  _settings.performanceMode = getPerformanceMode(_settings);
  return _settings;
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(_settings)); } catch {}
}

export function getSetting(key) { return _settings[key]; }

export function setSetting(key, value) {
  _settings[key] = value;
  saveSettings();
}

export function getSettings() { return _settings; }
