import { DEFAULTS, getSettings } from './settings.ts';
import { sanitizeProfileColor } from './profile-color.ts';
import type { SavedCalibrationData, Settings } from '../types/index.js';

export const SETTINGS_TRANSFER_VERSION = 1;
export const MAX_SETTINGS_IMPORT_BYTES = 64 * 1024;

const PRODUCT_ID = 'hand-sabers-settings';
const BOOLEAN_KEYS = new Set<keyof Settings>([
  'flipCamera', 'noFail', 'developerMode', 'customAntialias', 'customReflections',
  'customFloorGlows', 'customDecorativeLights', 'customSaberGlints', 'customSaberTrails', 'customBackgroundShader',
  'customFog', 'customGrid', 'musicReactiveEnabled', 'beatLimitEnabled', 'trainingMode',
  'rememberCalibration', 'profileCompleted', 'phoneAudioOutput',
]);
const UNIT_NUMBER_KEYS = new Set<keyof Settings>([
  'volume', 'musicVolume', 'sfxVolume', 'beatSoundVolume', 'hitSoundVolume',
  'comboSoundVolume', 'missSoundVolume', 'bombSoundVolume', 'milestoneSoundVolume',
  'interfaceSoundVolume',
]);
const ENUM_VALUES: Partial<Record<keyof Settings, readonly unknown[]>> = {
  language: ['pl', 'en'],
  performanceMode: ['auto', 'lowest', 'very-low', 'low', 'medium', 'high', 'ultra', 'maximum', 'custom'],
  oneHandMode: [null, 'left', 'right'],
  musicReactiveIntensityMode: ['auto', 'manual'],
  trackingSource: ['auto', 'camera', 'phone'],
  gameMode: ['normal', 'no-arrows', 'pro', 'speed-trials', 'spatial'],
  calibrationMode: ['auto', 'manual'],
  devAccent: ['green', 'blue', 'purple', 'pink', 'orange', 'yellow'],
  saberModel: ['classic', 'wide', 'thin', 'prism', 'edge', 'pulse'],
  arenaTheme: ['cosmic', 'sunset', 'neon', 'forest', 'arctic'],
  avatar: ['default', 'cat', 'rocket', 'star', 'music', 'bolt', 'diamond', 'forest'],
  noteSpeed: [0.75, 1, 1.35, 1.75],
  hitboxSensitivity: [0.82, 1, 1.2],
};

export interface SettingsTransferDocument {
  product: typeof PRODUCT_ID;
  version: typeof SETTINGS_TRANSFER_VERSION;
  exportedAt: string;
  settings: Settings;
}

export interface SettingsChange {
  key: keyof Settings;
  before: Settings[keyof Settings];
  after: Settings[keyof Settings];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key));
}

function isSavedCalibration(value: unknown): value is SavedCalibrationData | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const keys = ['minX', 'maxX', 'minY', 'maxY', 'rangeX', 'rangeY'] as const;
  if (!hasOnlyKeys(value, keys) || !keys.every(key => key in value)) return false;
  return keys.every(key => isFiniteNumber(value[key], -10, 10))
    && Number(value['minX']) < Number(value['maxX'])
    && Number(value['minY']) < Number(value['maxY'])
    && Number(value['rangeX']) > 0
    && Number(value['rangeY']) > 0;
}

function isFavoriteMapIds(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 500) return false;
  if (!value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 160 && id === id.trim())) return false;
  return new Set(value).size === value.length;
}

function validateSetting(key: keyof Settings, value: unknown): boolean {
  if (BOOLEAN_KEYS.has(key)) return typeof value === 'boolean';
  if (UNIT_NUMBER_KEYS.has(key)) return isFiniteNumber(value, 0, 1);
  const enumValues = ENUM_VALUES[key];
  if (enumValues) return enumValues.includes(value);

  switch (key) {
    case 'sensitivity': return isFiniteNumber(value, 0.5, 2);
    case 'audioOffsetMs': return isFiniteNumber(value, -500, 500);
    case 'customSaberTrailSamples': return Number.isInteger(value) && isFiniteNumber(value, 0, 16);
    case 'customSaberTrailIntensity': return isFiniteNumber(value, 0, 1.25);
    case 'customArenaDetail': return isFiniteNumber(value, 0, 1.25);
    case 'customHitShards': return Number.isInteger(value) && isFiniteNumber(value, 0, 7);
    case 'customRenderScale': return isFiniteNumber(value, 0.5, 1.5);
    case 'musicReactiveIntensity': return isFiniteNumber(value, 0, 1.5);
    case 'maxBeats': return Number.isInteger(value) && isFiniteNumber(value, 1, 100_000);
    case 'phoneAudioLatencyMs': return isFiniteNumber(value, 0, 500);
    case 'handDetectionConfidence':
    case 'handPresenceConfidence':
    case 'handTrackingConfidence': return isFiniteNumber(value, 0, 1);
    case 'saberColorLeft':
    case 'saberColorRight':
    case 'playerColor': return typeof value === 'string' && sanitizeProfileColor(value) === value.toLowerCase();
    case 'playerName': return typeof value === 'string'
      && value === value.trim()
      && value.length > 0
      && value.length <= 32
      && !/[\u0000-\u001f\u007f]/.test(value);
    case 'favoriteMapIds': return isFavoriteMapIds(value);
    case 'savedCalibration': return isSavedCalibration(value);
    default: return false;
  }
}

function cloneSettings(settings: Settings): Settings {
  const entries = (Object.keys(DEFAULTS) as Array<keyof Settings>)
    .map(key => [key, settings[key]] as const);
  return JSON.parse(JSON.stringify(Object.fromEntries(entries))) as Settings;
}

export function createSettingsExport(settings: Settings = getSettings()): SettingsTransferDocument {
  return {
    product: PRODUCT_ID,
    version: SETTINGS_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    settings: cloneSettings(settings),
  };
}

export function serializeSettingsExport(settings: Settings = getSettings()): string {
  return JSON.stringify(createSettingsExport(settings), null, 2);
}

export function parseSettingsImport(text: string): SettingsTransferDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_SETTINGS_IMPORT_BYTES) {
    throw new Error('SETTINGS_FILE_TOO_LARGE');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('SETTINGS_INVALID_JSON');
  }
  if (!isRecord(raw) || !hasOnlyKeys(raw, ['product', 'version', 'exportedAt', 'settings'])) {
    throw new Error('SETTINGS_INVALID_DOCUMENT');
  }
  if (raw['product'] !== PRODUCT_ID) throw new Error('SETTINGS_WRONG_PRODUCT');
  if (raw['version'] !== SETTINGS_TRANSFER_VERSION) throw new Error('SETTINGS_UNSUPPORTED_VERSION');
  if (typeof raw['exportedAt'] !== 'string' || !Number.isFinite(Date.parse(raw['exportedAt']))) {
    throw new Error('SETTINGS_INVALID_DOCUMENT');
  }
  if (!isRecord(raw['settings'])) throw new Error('SETTINGS_INVALID_DOCUMENT');

  const settingsRecord = { ...raw['settings'] };
  // The UI may persist "both", while the runtime represents the two-hand mode as null.
  if (settingsRecord['oneHandMode'] === 'both') settingsRecord['oneHandMode'] = null;
  // Files created before language joined the shared settings model preserve the current language.
  if (!('language' in settingsRecord)) settingsRecord['language'] = getSettings().language;
  // Files created before profile colors preserve the color already selected on this device.
  if (!('playerColor' in settingsRecord)) settingsRecord['playerColor'] = getSettings().playerColor;
  // Files created before decorative light controls keep the current device preference.
  if (!('customDecorativeLights' in settingsRecord)) {
    settingsRecord['customDecorativeLights'] = getSettings().customDecorativeLights;
  }
  const allowedKeys = Object.keys(DEFAULTS) as Array<keyof Settings>;
  if (!hasOnlyKeys(settingsRecord, allowedKeys)) throw new Error('SETTINGS_UNKNOWN_FIELD');
  for (const key of allowedKeys) {
    if (!(key in settingsRecord) || !validateSetting(key, settingsRecord[key])) {
      throw new Error(`SETTINGS_INVALID_FIELD:${key}`);
    }
  }

  return {
    product: PRODUCT_ID,
    version: SETTINGS_TRANSFER_VERSION,
    exportedAt: raw['exportedAt'],
    settings: cloneSettings(settingsRecord as unknown as Settings),
  };
}

export function getSettingsChanges(before: Settings, after: Settings): SettingsChange[] {
  return (Object.keys(DEFAULTS) as Array<keyof Settings>)
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ key, before: before[key], after: after[key] }));
}
