import type { AppStateKey, Beat, MapMeta, OneHandMode, PauseReason, SaberQuat } from '../types/index.js';

export const S = {
  MENU:     'menu',
  LOADING:  'loading',
  CALIB:    'calib',
  PLAYING:  'playing',
  PAUSED:   'paused',
  GAMEOVER: 'gameover'
} as const;

interface StateMap {
  id?: string;
  formatVersion?: number;
  meta?: MapMeta;
  beats: Beat[] | null;
  audioBuffer?: ArrayBuffer;
  _serverAudioPending?: boolean;
  _localAudioPending?: boolean;
  _audioReady?: boolean;
  localOnly?: boolean;
}

export interface GameState {
  appState: AppStateKey;
  calibIdx: number;
  score: number;
  combo: number;
  maxCombo: number;
  lives: number;
  maxLives: number;
  tick: number;
  fps: number;
  frameMs: number;
  deltaMs: number;
  deltaSec: number;
  deltaScale: number;
  handsLeftActive: boolean;
  handsRightActive: boolean;
  pauseReason: PauseReason;
  noFail: boolean;
  oneHandMode: OneHandMode;
  map: StateMap | null;
  saberQuatL: SaberQuat | null;
  saberQuatR: SaberQuat | null;
}

export const state: GameState = {
  appState:         S.MENU,
  calibIdx:         0,
  score:            0,
  combo:            0,
  maxCombo:         0,
  lives:            10,
  maxLives:         10,
  tick:             0,
  fps:              0,
  frameMs:          0,
  deltaMs:          16.7,
  deltaSec:         1 / 60,
  deltaScale:       1,
  handsLeftActive:  false,
  handsRightActive: false,
  pauseReason:      null,
  noFail:           false,
  oneHandMode:      null,
  map:              null,
  saberQuatL:       null,
  saberQuatR:       null,
};
