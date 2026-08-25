import { sortBeatsByTime } from '../core/creator-rules.ts';
import type { BeatSide, CutDirection } from '../types/index.js';
import { t } from '../i18n/index.ts';
import { getPlayPos } from './audio.ts';
import { canCreateHeldAt, clampHeldDuration, clampMapTime } from './beat-timing.ts';
import { cutButtonText, normalizeCutDirection, nextCutDirection } from './cut-ui.ts';
import { checkOverlaps, pushUndo } from './history.ts';
import { snapTime } from './snap.ts';
import { state } from './state.ts';
import { scheduleAutosave } from './storage.ts';
import { renderAll } from './timeline.ts';

const DEFAULT_BEAT_X = 0.82;
const DEFAULT_BEAT_Y = 1.1;

function centeredRandom(): number {
  return Math.random() + Math.random() - 1;
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}

function createBeatPosition(side: BeatSide): { x?: number; y: number } {
  const y = roundPosition(DEFAULT_BEAT_Y + centeredRandom() * 0.22);
  if (side === 'random') return { y };
  const laneX = side === 'left' ? -DEFAULT_BEAT_X : DEFAULT_BEAT_X;
  return {
    x: roundPosition(laneX + centeredRandom() * 0.18),
    y,
  };
}

export function syncCutButton(): void {
  const cutButton = document.getElementById('btnCutDirection');
  if (!cutButton) return;
  cutButton.textContent = cutButtonText(state.activeCut);
  cutButton.classList.toggle('active', state.activeCut !== 'any');
}

export function setActiveCut(cut: CutDirection): void {
  state.activeCut = normalizeCutDirection(cut);
  syncCutButton();
}

export function cycleCutForSelectionOrTap(): void {
  pushUndo();
  if (state.selectedBeats.size) {
    for (const beat of state.selectedBeats) {
      if (beat.type !== 'bomb') beat.cut = nextCutDirection(beat.cut);
    }
    checkOverlaps();
    scheduleAutosave();
    renderAll();
    return;
  }
  setActiveCut(nextCutDirection(state.activeCut));
}

export function tapBeat(side: BeatSide): void {
  if (!state.isPlaying) return;
  const time = snapTime(getPlayPos());
  pushUndo();
  state.map.beats.push({ t: time, side, type: 'block', cut: state.activeCut, ...createBeatPosition(side) });
  sortBeatsByTime(state.map.beats);
  checkOverlaps();
  flashTap(side);
  scheduleAutosave();
}

export function tapRandom(): void {
  if (!state.isPlaying) return;
  const time = snapTime(getPlayPos());
  pushUndo();
  state.map.beats.push({ t: time, side: 'random', type: 'block', cut: state.activeCut, ...createBeatPosition('random') });
  sortBeatsByTime(state.map.beats);
  checkOverlaps();
  flashTap('rand');
  scheduleAutosave();
}

export function tapBomb(): void {
  if (!state.isPlaying) return;
  const time = snapTime(getPlayPos());
  pushUndo();
  const side: BeatSide = Math.random() < 0.5 ? 'left' : 'right';
  state.map.beats.push({ t: time, side, type: 'bomb', cut: 'any' });
  sortBeatsByTime(state.map.beats);
  flashTap('bomb');
  scheduleAutosave();
}

export function startHeld(side: 'left' | 'right'): void {
  if (!state.isPlaying) return;
  if (side === 'left' && state.heldLeft) return;
  if (side === 'right' && state.heldRight) return;
  const time = clampMapTime(snapTime(getPlayPos()));
  if (!canCreateHeldAt(time)) return;
  pushUndo();
  const beat = { t: time, side, type: 'held', cut: state.activeCut, duration: 0.05, ...createBeatPosition(side) };
  state.map.beats.push(beat);
  sortBeatsByTime(state.map.beats);
  if (side === 'left') state.heldLeft = beat;
  if (side === 'right') state.heldRight = beat;
  flashTap(side);
  scheduleAutosave();
}

export function endHeld(side: 'left' | 'right'): void {
  const beat = side === 'left' ? state.heldLeft : state.heldRight;
  if (!beat) return;
  const now = getPlayPos();
  beat.duration = clampHeldDuration(beat.t, now - beat.t);
  if (side === 'left') state.heldLeft = null;
  if (side === 'right') state.heldRight = null;
  checkOverlaps();
  scheduleAutosave();
  renderAll();
}

export function flashTap(side: string): void {
  const element = document.getElementById('tapFlash');
  if (!element) return;
  element.className = side === 'left' ? 'flash-left' : side === 'right' ? 'flash-right' : 'flash-rand';
  if (state.tapFlashTimer) clearTimeout(state.tapFlashTimer);
  state.tapFlashTimer = setTimeout(() => { element.className = ''; }, 80);
}

export function toggleLoop(): void {
  state.loopEnabled = !state.loopEnabled;
  const button = document.getElementById('btnLoop');
  if (button) {
    button.textContent = state.loopEnabled ? t('creator.loopOn') : t('creator.loopOff');
    button.classList.toggle('active', state.loopEnabled);
  }
  if (state.loopEnabled && state.loopStart === null) {
    state.loopStart = state.currentTime;
    state.loopEnd = Math.min(state.currentTime + 4, state.map.meta.duration);
  }
}
