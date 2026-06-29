import type { CutDirection } from '../types/index.js';

export interface CreatorBeat {
  t: number;
  side: string;
  type: string;
  cut: CutDirection;
  duration?: number; // held block — length in seconds
  _overlap?: boolean;
}

export interface CreatorMap {
  formatVersion: number;
  id: string;
  meta: { title: string; duration: number; bpm?: number; audioFile?: string; audioUrl?: string };
  beats: CreatorBeat[];
}

export const MAP_ID = (): string => `map-${Date.now()}`;

export const SNAP_DIVISIONS: (number | null)[] = [null, 1, 2, 4];

export const state = {
  map: {
    formatVersion: 1,
    id:    MAP_ID(),
    meta:  { title: '', duration: 0, bpm: 120 },
    beats: [],
  } as CreatorMap,

  activeCut:      'any' as CutDirection,

  audioBuffer:      null as AudioBuffer | null,
  audioArrayBuffer: null as ArrayBuffer | null,
  audioFileName:    '',
  audioMimeType:    '',
  audioCtx:         null as AudioContext | null,
  audioSource:      null as AudioBufferSourceNode | null,
  audioGain:        null as GainNode | null,
  songVolume:       0.5,
  isPlaying:        false,
  playStartAt:      0,
  playOffset:       0,
  currentTime:      0,

  pxPerSec:      80,
  viewStart:     0,
  selectedBeats: new Set<CreatorBeat>(),
  dragBeat:      null as CreatorBeat | null,
  dragOffsetT:   0,
  isDragging:    false,

  undoStack: [] as string[],
  redoStack: [] as string[],

  autosaveTimer: null as ReturnType<typeof setTimeout> | null,
  lastSavedAt:   null as Date | null,

  tapFlashTimer: null as ReturnType<typeof setTimeout> | null,

  snapIdx: 0,

  loopEnabled: false,
  loopStart:   null as number | null,
  loopEnd:     null as number | null,

  clipboard: [] as CreatorBeat[],

  timelineDirty: true,
  rafId:         null as number | null,

  precountTimer: null as ReturnType<typeof setInterval> | null,

  // held-block recording (Shift+F / Shift+J)
  heldLeft:  null as CreatorBeat | null,
  heldRight: null as CreatorBeat | null,
};
