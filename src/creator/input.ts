import { state, SNAP_VALUES } from './state.ts';
import { markOverlaps, removeBeatByReference, removeBeatsByReference, sortBeatsByTime } from '../core/creator-rules.ts';
import { cutButtonText, normalizeCutDirection, nextCutDirection } from './cut-ui.ts';
import { getPlayPos, playAudio, pauseAudio, stopAudio } from './audio.ts';
import { renderAll, requestTimelineRender, hitTestBeat, updateZoomLabel, formatTime } from './timeline.ts';
import { scheduleAutosave } from './storage.ts';
import { t } from '../i18n/index.ts';
import type { BeatSide, CutDirection } from '../types/index.js';

const MAX_UNDO = 60;

export function getSnap(): number | null { return SNAP_VALUES[state.snapIdx] ?? null; }

export function snapTime(t: number): number {
  const s = getSnap();
  return s ? Math.round(t / s) * s : t;
}

export function checkOverlaps(): boolean {
  const hasOverlap = markOverlaps(state.map.beats, 0.08);
  const warningMsg = document.getElementById('warningMsg');
  if (warningMsg) {
    warningMsg.innerHTML = hasOverlap
      ? '<span class="material-symbols-rounded inline-icon">warning</span>Niektóre bloki są za blisko siebie'
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
}

export function redo(): void {
  if (!state.redoStack.length) return;
  state.undoStack.push(JSON.stringify(state.map.beats));
  state.map.beats = sortBeatsByTime(JSON.parse(state.redoStack.pop()!));
  state.selectedBeats.clear();
  checkOverlaps();
  renderAll();
}

export function syncCutButton(): void {
  const cutBtn = document.getElementById('btnCutDirection');
  if (!cutBtn) return;
  cutBtn.textContent = cutButtonText(state.activeCut);
  cutBtn.classList.toggle('active', state.activeCut !== 'any');
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

export function tapBeat(side: BeatSide, playAudioFn: typeof playAudio): void {
  if (!state.isPlaying) return;
  const t = snapTime(getPlayPos());
  pushUndo();
  state.map.beats.push({ t, side, type: 'block', cut: state.activeCut });
  sortBeatsByTime(state.map.beats);
  checkOverlaps();
  flashTap(side);
  scheduleAutosave();
  void playAudioFn;
}

export function tapBomb(): void {
  if (!state.isPlaying) return;
  const t    = snapTime(getPlayPos());
  pushUndo();
  const side: BeatSide = Math.random() < 0.5 ? 'left' : 'right';
  state.map.beats.push({ t, side, type: 'bomb', cut: 'any' });
  sortBeatsByTime(state.map.beats);
  flashTap('bomb');
  scheduleAutosave();
}

export function flashTap(side: string): void {
  const el = document.getElementById('tapFlash');
  if (!el) return;
  el.className = side === 'left' ? 'flash-left' : side === 'right' ? 'flash-right' : 'flash-rand';
  if (state.tapFlashTimer) clearTimeout(state.tapFlashTimer);
  state.tapFlashTimer = setTimeout(() => { el.className = ''; }, 80);
}

export function cycleSnap(): void {
  state.snapIdx = (state.snapIdx + 1) % SNAP_VALUES.length;
  const s = getSnap();
  const btnSnap = document.getElementById('btnSnap');
  const stSnap  = document.getElementById('stSnap');
  if (btnSnap) { btnSnap.textContent = s ? `SNAP: ${s}s` : t('creator.snapOff'); btnSnap.classList.toggle('active', !!s); }
  if (stSnap)  stSnap.textContent = s ? `${s}s` : 'wył';
}

export function toggleLoop(): void {
  state.loopEnabled = !state.loopEnabled;
  const btn = document.getElementById('btnLoop');
  if (btn) { btn.textContent = state.loopEnabled ? t('creator.loopOn') : t('creator.loopOff'); btn.classList.toggle('active', state.loopEnabled); }
  if (state.loopEnabled && state.loopStart === null) {
    state.loopStart = state.currentTime;
    state.loopEnd   = Math.min(state.currentTime + 4, state.map.meta.duration);
  }
}

export function cancelPrecount(): void {
  if (state.precountTimer) { clearInterval(state.precountTimer); state.precountTimer = null; }
  const precountEl = document.getElementById('precount');
  if (precountEl) precountEl.classList.remove('show');
}

export function startPrecount(onPlay: () => void): void {
  if (state.precountTimer || state.isPlaying) return;
  const precountEl    = document.getElementById('precount');
  const precountNumEl = document.getElementById('precountNum');
  if (!precountEl || !precountNumEl) return;
  precountEl.classList.add('show');
  let n = 4;
  precountNumEl.textContent = String(n);
  state.precountTimer = setInterval(() => {
    n--;
    if (n <= 0) {
      cancelPrecount();
      onPlay();
    } else {
      precountNumEl.textContent        = String(n);
      precountNumEl.style.animation    = 'none';
      void precountNumEl.offsetHeight;
      precountNumEl.style.animation    = 'precountPulse 1s ease-out';
    }
  }, 1000);
}

export function handlePlay(onPlay: () => void): void {
  if (!state.audioBuffer) return;
  if (state.precountTimer) { cancelPrecount(); return; }
  if (state.isPlaying) { pauseAudio(); return; }
  startPrecount(onPlay);
}

export function bindTimelineEvents(callbacks: {
  onSave:     () => void;
  onUndo:     () => void;
  onRedo:     () => void;
  onPlay:     () => void;
}): void {
  const timelineCanvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
  const waveCanvas     = document.getElementById('waveCanvas')     as HTMLCanvasElement | null;
  if (!timelineCanvas || !waveCanvas) return;

  timelineCanvas.addEventListener('mousedown', (e: MouseEvent) => {
    const x    = e.offsetX;
    const t    = state.viewStart + x / state.pxPerSec;
    const beat = hitTestBeat(x, e.offsetY);

    if (e.shiftKey && !beat && state.loopEnabled) {
      const mid = state.loopStart !== null && state.loopEnd !== null
        ? (state.loopStart + state.loopEnd) / 2 : state.currentTime;
      if (t < mid) state.loopStart = snapTime(t);
      else          state.loopEnd   = snapTime(t);
      if (state.loopStart !== null && state.loopEnd !== null && state.loopStart > state.loopEnd) {
        [state.loopStart, state.loopEnd] = [state.loopEnd, state.loopStart];
      }
      renderAll();
      return;
    }

    if (e.button === 2 && beat) {
      pushUndo();
      removeBeatByReference(state.map.beats, beat);
      state.selectedBeats.delete(beat);
      checkOverlaps();
      scheduleAutosave();
      renderAll();
      return;
    }

    if (beat) {
      if (!e.shiftKey) state.selectedBeats.clear();
      state.selectedBeats.add(beat);
      state.dragBeat    = beat;
      state.dragOffsetT = t - beat.t;
      state.isDragging  = false;
      requestTimelineRender();
    } else {
      state.selectedBeats.clear();
      state.dragBeat = null;
      const wasPlaying = state.isPlaying;
      state.currentTime = Math.max(0, Math.min(t, state.map.meta.duration));
      if (wasPlaying) playAudio(state.currentTime, callbacks.onPlay);
      renderAll();
    }
  });

  timelineCanvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!state.dragBeat) return;
    state.isDragging = true;
    const raw = state.viewStart + e.offsetX / state.pxPerSec - state.dragOffsetT;
    state.dragBeat.t = snapTime(Math.max(0, Math.min(raw, state.map.meta.duration)));
    requestTimelineRender();
  });

  timelineCanvas.addEventListener('mouseup', () => {
    if (state.isDragging) {
      sortBeatsByTime(state.map.beats);
      checkOverlaps();
      scheduleAutosave();
      renderAll();
    }
    state.dragBeat   = null;
    state.isDragging = false;
  });

  timelineCanvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());

  timelineCanvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const mouseT = state.viewStart + e.offsetX / state.pxPerSec;
      state.pxPerSec  = Math.max(8, Math.min(800, state.pxPerSec * factor));
      state.viewStart = Math.max(0, mouseT - e.offsetX / state.pxPerSec);
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
    if (wasPlaying) playAudio(state.currentTime, callbacks.onPlay);
    renderAll();
  });

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.code === 'KeyF') { e.preventDefault(); tapBeat('left',  playAudio); return; }
    if (e.code === 'KeyJ') { e.preventDefault(); tapBeat('right', playAudio); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.shiftKey) { tapBomb(); return; }
      callbacks.onPlay();
      return;
    }
    if (e.code === 'KeyR' && e.shiftKey) {
      e.preventDefault();
      cancelPrecount();
      stopAudio(true);
      return;
    }
    if (e.code === 'KeyR') { e.preventDefault(); cycleCutForSelectionOrTap(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!state.selectedBeats.size) return;
      pushUndo();
      state.map.beats = removeBeatsByReference(state.map.beats, state.selectedBeats);
      state.selectedBeats.clear();
      checkOverlaps();
      scheduleAutosave();
      renderAll();
      return;
    }
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); callbacks.onSave(); return; }

    if (e.ctrlKey && e.code === 'KeyC') {
      e.preventDefault();
      if (!state.selectedBeats.size) return;
      const sorted = [...state.selectedBeats].sort((a, b) => a.t - b.t);
      const minT   = sorted[0]!.t;
      state.clipboard = sorted.map(b => ({ ...b, t: b.t - minT }));
      return;
    }

    if (e.ctrlKey && e.code === 'KeyV') {
      e.preventDefault();
      if (!state.clipboard.length) return;
      pushUndo();
      const pasted = state.clipboard.map(b => ({ ...b, t: snapTime(state.currentTime + b.t) }));
      state.map.beats.push(...pasted);
      sortBeatsByTime(state.map.beats);
      state.selectedBeats.clear();
      pasted.forEach(b => state.selectedBeats.add(b));
      checkOverlaps();
      scheduleAutosave();
      renderAll();
      return;
    }

    if (e.ctrlKey && e.code === 'KeyA') {
      e.preventDefault();
      state.map.beats.forEach(b => state.selectedBeats.add(b));
      renderAll();
      return;
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

  void formatTime;
}
