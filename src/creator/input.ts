import { state } from './state.ts';
import { removeBeatByReference, removeBeatsByReference, sortBeatsByTime } from '../core/creator-rules.ts';
import { getPlayPos, playAudio, stopAudio } from './audio.ts';
import { renderAll, requestTimelineRender, hitTestBeat, updateZoomLabel, formatTime, getLabelWidth, xToTime } from './timeline.ts';
import { scheduleAutosave } from './storage.ts';
import type { CutDirection } from '../types/index.js';
import { CUT_DIRECTIONS } from '../core/gameplay-rules.ts';
import { matchAction, loadKeybinds } from './keybinds.ts';
import { TimelineDragSelection } from './drag-selection.ts';
import { TimelineContextMenu } from './timeline-context-menu.ts';
import { fitBeatsWithinMap } from './beat-timing.ts';
import { checkOverlaps, pushUndo, redo, undo } from './history.ts';
import { cycleSnap, snapTime } from './snap.ts';
import { cancelPrecount } from './precount.ts';
import {
  cycleCutForSelectionOrTap,
  endHeld,
  setActiveCut,
  startHeld,
  tapBeat,
  tapBomb,
  tapRandom,
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
  loadKeybinds();

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

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (e.repeat) return;

    // ── Escape — always handled, not rebindable ──
    if (e.key === 'Escape') {
      e.preventDefault();
      const panel = document.getElementById('shortcutsPanel');
      if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        document.getElementById('btnShortcuts')?.classList.remove('active');
        document.getElementById('btnShortcuts')?.setAttribute('aria-expanded', 'false');
        return;
      }
      if (state.selectedBeats.size) {
        state.selectedBeats.clear();
        renderAll();
      }
      return;
    }

    const action = matchAction(e);

    if (action === 'deleteSelected') {
      e.preventDefault();
      if (state.selectedBeats.size) {
        pushUndo();
        state.map.beats = removeBeatsByReference(state.map.beats, state.selectedBeats);
        state.selectedBeats.clear();
        checkOverlaps();
        scheduleAutosave();
        renderAll();
      } else {
        const pos     = getPlayPos();
        const sorted  = [...state.map.beats].sort((a, b) => Math.abs(a.t - pos) - Math.abs(b.t - pos));
        const nearest = sorted[0];
        if (nearest && Math.abs(nearest.t - pos) < 0.5) {
          pushUndo();
          removeBeatByReference(state.map.beats, nearest);
          checkOverlaps();
          scheduleAutosave();
          renderAll();
        }
      }
      return;
    }

    if (!action) return;

    e.preventDefault();

    switch (action) {
      case 'play':
        callbacks.onPlay();
        break;

      case 'stop':
        cancelPrecount();
        stopAudio(true);
        break;

      case 'tapLeft':
        if (!e.repeat) tapBeat('left');
        break;

      case 'tapRight':
        if (!e.repeat) tapBeat('right');
        break;

      case 'tapRandom':
        if (!e.repeat) tapRandom();
        break;

      case 'tapBomb':
        if (!e.repeat) tapBomb();
        break;

      case 'heldLeft':
        if (!e.repeat) startHeld('left');
        break;

      case 'heldRight':
        if (!e.repeat) startHeld('right');
        break;

      case 'nextBeat': {
        const beats = state.map.beats;
        const pos   = getPlayPos();
        const next  = beats.find(b => b.t > pos + 0.01);
        if (next) {
          const wasPlaying  = state.isPlaying;
          state.currentTime = next.t;
          if (wasPlaying) playAudio(state.currentTime, callbacks.onPlayEnd);
          renderAll();
        }
        break;
      }

      case 'prevBeat': {
        const beats = state.map.beats;
        const pos   = getPlayPos();
        const prev  = [...beats].reverse().find(b => b.t < pos - 0.01);
        if (prev) {
          const wasPlaying  = state.isPlaying;
          state.currentTime = prev.t;
          if (wasPlaying) playAudio(state.currentTime, callbacks.onPlayEnd);
          renderAll();
        }
        break;
      }

      case 'jumpStart': {
        const wasPlaying  = state.isPlaying;
        state.currentTime = 0;
        state.viewStart   = 0;
        if (wasPlaying) playAudio(0, callbacks.onPlayEnd);
        renderAll();
        break;
      }

      case 'jumpEnd': {
        const wasPlaying  = state.isPlaying;
        state.currentTime = state.map.meta.duration;
        if (wasPlaying) playAudio(state.currentTime, callbacks.onPlayEnd);
        renderAll();
        break;
      }

      case 'loopStart':
        state.loopStart = snapTime(getPlayPos());
        if (state.loopEnd !== null && state.loopStart > state.loopEnd) state.loopEnd = null;
        renderAll();
        break;

      case 'loopEnd':
        state.loopEnd = snapTime(getPlayPos());
        if (state.loopStart !== null && state.loopEnd < state.loopStart) state.loopStart = null;
        renderAll();
        break;

      case 'selectAll':
        state.map.beats.forEach(b => state.selectedBeats.add(b));
        renderAll();
        break;

      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'save': callbacks.onSave(); break;

      case 'copy': {
        if (!state.selectedBeats.size) break;
        const sorted = [...state.selectedBeats].sort((a, b) => a.t - b.t);
        const minT   = sorted[0]!.t;
        state.clipboard = sorted.map(b => ({ ...b, t: b.t - minT }));
        break;
      }

      case 'paste': {
        if (!state.clipboard.length) break;
        pushUndo();
        const pasted = fitBeatsWithinMap(state.clipboard, beat => state.currentTime + beat.t, snapTime);
        state.map.beats.push(...pasted);
        sortBeatsByTime(state.map.beats);
        state.selectedBeats.clear();
        pasted.forEach(b => state.selectedBeats.add(b));
        checkOverlaps();
        scheduleAutosave();
        renderAll();
        break;
      }

      case 'duplicate': {
        if (!state.selectedBeats.size) break;
        pushUndo();
        const sorted = [...state.selectedBeats].sort((a, b) => a.t - b.t);
        const minT   = sorted[0]!.t;
        const maxT   = sorted[sorted.length - 1]!.t;
        const span   = maxT - minT;
        const offset = span + Math.max(0.1, span > 0 ? span / sorted.length : 0.25);
        const duped  = fitBeatsWithinMap(sorted, beat => beat.t + offset, snapTime);
        state.map.beats.push(...duped);
        sortBeatsByTime(state.map.beats);
        state.selectedBeats.clear();
        duped.forEach(b => state.selectedBeats.add(b));
        checkOverlaps();
        scheduleAutosave();
        renderAll();
        break;
      }

      case 'zoomIn':
        state.pxPerSec = Math.min(800, state.pxPerSec * 1.3);
        updateZoomLabel(); renderAll();
        break;

      case 'zoomOut':
        state.pxPerSec = Math.max(8, state.pxPerSec / 1.3);
        updateZoomLabel(); renderAll();
        break;

      case 'cycleSnap':
        cycleSnap();
        break;

      case 'toggleLoop':
        toggleLoop();
        break;

      case 'shortcutsPanel':
        document.getElementById('shortcutsPanel')?.classList.toggle('hidden');
        document.getElementById('btnShortcuts')?.classList.toggle('active', !document.getElementById('shortcutsPanel')?.classList.contains('hidden'));
        document.getElementById('btnShortcuts')?.setAttribute('aria-expanded', String(!document.getElementById('shortcutsPanel')?.classList.contains('hidden')));
        break;

      default: {
        // Cut direction actions: cutDir1..cutDir9
        const cutMatch = (action as string).match(/^cutDir(\d)$/);
        if (cutMatch?.[1]) {
          const idx = parseInt(cutMatch[1], 10) - 1;
          const dir = CUT_DIRECTIONS[idx] as CutDirection | undefined;
          if (dir) {
            if (state.selectedBeats.size) {
              pushUndo();
              for (const beat of state.selectedBeats) {
                if (beat.type !== 'bomb') beat.cut = dir;
              }
              checkOverlaps();
              scheduleAutosave();
              renderAll();
            } else {
              setActiveCut(dir);
            }
          }
        }
        break;
      }
    }
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
  window.addEventListener('keyup', (e: KeyboardEvent) => {
    const action = matchAction(e);
    if (action === 'heldLeft'  && state.heldLeft)  { endHeld('left');  return; }
    if (action === 'heldRight' && state.heldRight) { endHeld('right'); return; }
  });

  void formatTime;
}
