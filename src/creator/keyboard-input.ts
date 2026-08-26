import { removeBeatByReference, removeBeatsByReference, sortBeatsByTime } from '../core/creator-rules.ts';
import { CUT_DIRECTIONS } from '../core/gameplay-rules.ts';
import type { CutDirection } from '../types/index.js';
import { getPlayPos, playAudio, stopAudio } from './audio.ts';
import { fitBeatsWithinMap } from './beat-timing.ts';
import {
  endHeld,
  setActiveCut,
  startHeld,
  tapBeat,
  tapBomb,
  tapRandom,
  toggleLoop,
} from './beat-input.ts';
import { checkOverlaps, pushUndo, redo, undo } from './history.ts';
import { loadKeybinds, matchAction } from './keybinds.ts';
import { cancelPrecount } from './precount.ts';
import { cycleSnap, snapTime } from './snap.ts';
import { state } from './state.ts';
import { scheduleAutosave } from './storage.ts';
import { renderAll, updateZoomLabel } from './timeline.ts';

interface CreatorKeyboardCallbacks {
  onPlay(): void;
  onPlayEnd(): void;
  onSave(): void;
}

export function bindCreatorKeyboard(callbacks: CreatorKeyboardCallbacks): void {
  loadKeybinds();
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

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    const action = matchAction(e);
    if (action === 'heldLeft'  && state.heldLeft)  { endHeld('left');  return; }
    if (action === 'heldRight' && state.heldRight) { endHeld('right'); return; }
  });
}
