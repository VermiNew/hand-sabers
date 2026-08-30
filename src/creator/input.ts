import { state } from './state.ts';
import { removeBeatByReference, sortBeatsByTime } from '../core/creator-rules.ts';
import { playAudio, stopAudio } from './audio.ts';
import { renderAll, requestTimelineRender, hitTestBeat, updateZoomLabel, getLabelWidth, xToTime } from './timeline.ts';
import { scheduleAutosave } from './storage.ts';
import { TimelineDragSelection } from './drag-selection.ts';
import { TimelineContextMenu } from './timeline-context-menu.ts';
import { checkOverlaps, pushUndo, redo, undo } from './history.ts';
import { cycleSnap, snapTime } from './snap.ts';
import { cancelPrecount } from './precount.ts';
import { bindCreatorKeyboard } from './keyboard-input.ts';
import {
  cycleCutForSelectionOrTap,
  toggleLoop,
} from './beat-input.ts';

export { cycleSnap, getSnap, snapTime } from './snap.ts';

export { checkOverlaps, pushUndo, redo, undo } from './history.ts';

export {
  cycleCutForSelectionOrTap,
  endHeld,
  flashTap,
  setActiveCut,
  startHeld,
  syncCutButton,
  tapBeat,
  tapBomb,
  tapRandom,
  toggleLoop,
} from './beat-input.ts';

export { cancelPrecount, handlePlay, startPrecount } from './precount.ts';

const dragSelection = new TimelineDragSelection();
const timelineContextMenu = new TimelineContextMenu({ checkOverlaps, pushUndo, snapTime });

export function bindTimelineEvents(callbacks: {
  onSave:     () => void;
  onUndo:     () => void;
  onRedo:     () => void;
  onPlay:     () => void;
  onPlayEnd:  () => void;
}): void {
  bindCreatorKeyboard(callbacks);

  const timelineCanvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
  const waveCanvas     = document.getElementById('waveCanvas')     as HTMLCanvasElement | null;
  if (!timelineCanvas || !waveCanvas) return;

  let middleMouseDown = false;
  let middleMouseLastX = 0;

  timelineCanvas.addEventListener('mousedown', (e: MouseEvent) => {
    // Middle mouse — start scrubbing
    if (e.button === 1) {
      e.preventDefault();
      middleMouseDown  = true;
      middleMouseLastX = e.offsetX;
      return;
    }

    const x    = e.offsetX;
    const clickT = xToTime(x);
    const beat = hitTestBeat(x, e.offsetY);

    if (e.shiftKey && !beat && state.loopEnabled) {
      const mid = state.loopStart !== null && state.loopEnd !== null
        ? (state.loopStart + state.loopEnd) / 2 : state.currentTime;
      if (clickT < mid) state.loopStart = snapTime(clickT);
      else               state.loopEnd   = snapTime(clickT);
      if (state.loopStart !== null && state.loopEnd !== null && state.loopStart > state.loopEnd) {
        [state.loopStart, state.loopEnd] = [state.loopEnd, state.loopStart];
      }
      renderAll();
      return;
    }

    if (e.button === 2) {
      e.preventDefault();
      if (beat) {
        pushUndo();
        removeBeatByReference(state.map.beats, beat);
        state.selectedBeats.delete(beat);
        checkOverlaps();
        scheduleAutosave();
        renderAll();
      } else {
        timelineContextMenu.show(e.clientX, e.clientY, clickT, callbacks.onPlayEnd);
      }
      return;
    }

    if (beat) {
      if (!e.shiftKey) state.selectedBeats.clear();
      state.selectedBeats.add(beat);
      // Push undo snapshot BEFORE drag starts, so drag is undoable
      pushUndo();
      state.dragBeat    = beat;
      state.dragOffsetT = clickT - beat.t;
      state.isDragging  = false;
      requestTimelineRender();
    } else {
      if (x >= getLabelWidth()) {
        // Start drag-select
        state.selectedBeats.clear();
        state.dragBeat      = null;
        dragSelection.begin(x, e.offsetY);
        const wasPlaying    = state.isPlaying;
        state.currentTime   = Math.max(0, Math.min(clickT, state.map.meta.duration));
        // Seek directly — don't go through handlePlay/precount
        if (wasPlaying) playAudio(state.currentTime, callbacks.onPlayEnd);
        renderAll();
      }
    }
  });

  timelineCanvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (middleMouseDown) {
      const dx = e.offsetX - middleMouseLastX;
      state.viewStart = Math.max(0, state.viewStart - dx / state.pxPerSec);
      middleMouseLastX = e.offsetX;
      updateZoomLabel();
      renderAll();
      return;
    }
    if (dragSelection.active) {
      dragSelection.update(timelineCanvas, e.offsetX, e.offsetY);
      return;
    }
    if (!state.dragBeat) return;
    state.isDragging = true;
    const raw = xToTime(e.offsetX) - state.dragOffsetT;
    state.dragBeat.t = snapTime(Math.max(0, Math.min(raw, state.map.meta.duration)));
    requestTimelineRender();
  });

  timelineCanvas.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 1) { middleMouseDown = false; return; }
    if (dragSelection.active) {
      dragSelection.commit(timelineCanvas);
      renderAll();
      return;
    }
    if (state.isDragging) {
      sortBeatsByTime(state.map.beats);
      checkOverlaps();
      scheduleAutosave();
      renderAll();
    } else if (state.dragBeat) {
      // Click without drag — undo snapshot was pushed unnecessarily, pop it
      state.undoStack.pop();
    }
    state.dragBeat   = null;
    state.isDragging = false;
  });

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 1) middleMouseDown = false;
    if (dragSelection.active) {
      dragSelection.cancel();
      renderAll();
    }
  });

  timelineCanvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());

  timelineCanvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.altKey) {
      // Zoom centered on cursor
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const mouseT = xToTime(e.offsetX);
      state.pxPerSec  = Math.max(8, Math.min(800, state.pxPerSec * factor));
      state.viewStart = Math.max(0, mouseT - (e.offsetX - getLabelWidth()) / state.pxPerSec);
    } else {
      state.viewStart = Math.max(0, state.viewStart + (e.deltaY / 100) * (10 / state.pxPerSec * 20));
    }
    updateZoomLabel();
    renderAll();
  }, { passive: false });

  waveCanvas.addEventListener('click', (e: MouseEvent) => {
    if (!state.audioBuffer) return;
    const ratio = e.offsetX / waveCanvas.width;
    const wasPlaying = state.isPlaying;
    state.currentTime = Math.max(0, Math.min(ratio * state.audioBuffer.duration, state.map.meta.duration));
    if (wasPlaying) playAudio(state.currentTime, callbacks.onPlayEnd);
    renderAll();
  });


  document.getElementById('btnUndo')?.addEventListener('click', () => undo());
  document.getElementById('btnRedo')?.addEventListener('click', () => redo());
  document.getElementById('btnSnap')?.addEventListener('click', () => cycleSnap());
  document.getElementById('btnLoop')?.addEventListener('click', () => toggleLoop());
  document.getElementById('btnCutDirection')?.addEventListener('click', () => cycleCutForSelectionOrTap());

  document.getElementById('zoomIn')?.addEventListener('click', () => {
    state.pxPerSec = Math.min(800, state.pxPerSec * 1.5);
    updateZoomLabel();
    renderAll();
  });
  document.getElementById('zoomOut')?.addEventListener('click', () => {
    state.pxPerSec = Math.max(8, state.pxPerSec / 1.5);
    updateZoomLabel();
    renderAll();
  });

  document.getElementById('btnPlay')?.addEventListener('click', () => callbacks.onPlay());
  document.getElementById('btnStop')?.addEventListener('click', () => {
    cancelPrecount();
    stopAudio(true);
    state.currentTime = 0;
    state.viewStart   = 0;
    renderAll();
  });

  // ── Play/Stop toggle button ──
  document.getElementById('btnPlayStop')?.addEventListener('click', () => {
    if (state.isPlaying || state.precountTimer) {
      cancelPrecount();
      stopAudio(true);
      state.currentTime = 0;
      state.viewStart   = 0;
      renderAll();
    } else {
      callbacks.onPlay();
    }
  });

  // Keep play/stop button label in sync
  const origRenderAll = renderAll;
  void origRenderAll; // renderAll is called elsewhere; we hook isPlaying changes via RAF in main.ts

  // ── Held blocks: keyup ends them ──

}
