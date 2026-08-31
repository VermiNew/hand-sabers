import { markOverlaps, sortBeatsByTime } from '../core/creator-rules.ts';
import { t } from '../i18n/index.ts';
import { state } from './state.ts';
import { scheduleAutosave } from './storage.ts';
import { renderAll } from './timeline.ts';

const MAX_UNDO = 60;

export function checkOverlaps(): boolean {
  const hasOverlap = markOverlaps(state.map.beats, 0.08);
  const warningMsg = document.getElementById('warningMsg');
  if (warningMsg) {
    warningMsg.innerHTML = hasOverlap
      ? `<span class="material-symbols-rounded inline-icon">warning</span>${t('creator.overlapWarning')}`
      : '';
  }
  return hasOverlap;
}

export function pushUndo(): void {
  state.undoStack.push(JSON.stringify(state.map.beats));
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
  state.redoStack.length = 0;
}

export function undo(): void {
  if (!state.undoStack.length) return;
  state.redoStack.push(JSON.stringify(state.map.beats));
  state.map.beats = sortBeatsByTime(JSON.parse(state.undoStack.pop()!));
  state.selectedBeats.clear();
  checkOverlaps();
  renderAll();
  scheduleAutosave();
}

export function redo(): void {
  if (!state.redoStack.length) return;
  state.undoStack.push(JSON.stringify(state.map.beats));
  state.map.beats = sortBeatsByTime(JSON.parse(state.redoStack.pop()!));
  state.selectedBeats.clear();
  checkOverlaps();
  renderAll();
  scheduleAutosave();
}
