// ── App state ─────────────────────────────────────────────────────────────────
export const APP_STATES = {
  LOADING: 'loading',
  CALIB: 'calib',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
  MENU: 'menu',
} as const;
export type AppStateKey = typeof APP_STATES[keyof typeof APP_STATES];

export const PAUSE_REASONS = {
  NONE: null,
  HANDS: 'hands',
  MANUAL: 'manual',
} as const;
export type PauseReason = 'hands' | 'manual';

export type OneHandMode = 'left' | 'right' | null;
export type SaberSide = 'left' | 'right';

// ── Geometry ──────────────────────────────────────────────────────────────────
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SaberQuat {
  bladeDir: Vec3;
  rollDir: Vec3;
}

// ── Map format ────────────────────────────────────────────────────────────────
export const CUT_DIRECTIONS = ['any', 'down', 'up', 'left', 'right', 'down-left', 'down-right', 'up-left', 'up-right'] as const;
export type CutDirection = typeof CUT_DIRECTIONS[number];

export type BeatType = 'block' | 'bomb';
export type BeatSide = 'left' | 'right' | 'random';

export interface Beat {
  t: number;
  side: BeatSide;
  type: BeatType;
  cut: CutDirection;
  x?: number;
  y?: number;
}

export interface MapMeta {
  title?: string;
  artist?: string;
  mapper?: string;
  difficulty?: string;
  duration?: number;
  bpm?: number;
  previewStartSec?: number;
  audioOffsetMs?: number;
  audioFile?: string;
  serverAudioFile?: string;
  audioUrl?: string;
}

export interface GameMap {
  id: string;
  formatVersion: number;
  meta: MapMeta;
  beats: Beat[];
  _serverAudioPending?: boolean;
  _localAudioPending?: boolean;
  _audioReady?: boolean;
  localOnly?: boolean;
}

// ── Settings ──────────────────────────────────────────────────────────────────
export const PERFORMANCE_MODES = ['auto', 'lowest', 'very-low', 'low', 'medium', 'high', 'ultra', 'maximum'] as const;
export type PerformanceMode = typeof PERFORMANCE_MODES[number];

export interface Settings {
  sensitivity: number;
  flipCamera: boolean;
  volume: number;
  musicVolume: number;
  sfxVolume: number;
  beatSoundVolume: number;
  hitSoundVolume: number;
  comboSoundVolume: number;
  missSoundVolume: number;
  bombSoundVolume: number;
  milestoneSoundVolume: number;
  noFail: boolean;
  developerMode: boolean;
  oneHandMode: OneHandMode;
  audioOffsetMs: number;
  performanceMode: PerformanceMode;
  saberColorLeft: string;
  saberColorRight: string;
  beatLimitEnabled: boolean;
  maxBeats: number;
  playerName: string;
}

// ── Performance ───────────────────────────────────────────────────────────────
export interface CameraProfile {
  width: number;
  height: number;
  frameRate: number;
}

export interface PerformanceProfile {
  mode: PerformanceMode;
  qualityMode: string;
  label: string;
  description: string;
  targetFps: number;
  minDpr: number;
  maxDpr: number;
  antialias: boolean;
  reflections: boolean;
  floorGlows: boolean;
  saberGlints: boolean;
  backgroundShader: boolean;
  menuDemo: boolean;
  hitShards: number;
  camera: CameraProfile;
  detectFps: number;
  devRefreshMs: number;
  auto?: boolean;
}
