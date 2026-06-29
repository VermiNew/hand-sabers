import { state, SNAP_DIVISIONS } from './state.ts';
import { markOverlaps, removeBeatByReference, removeBeatsByReference, sortBeatsByTime } from '../core/creator-rules.ts';
import { cutButtonText, normalizeCutDirection, nextCutDirection } from './cut-ui.ts';
import { getPlayPos, playAudio, pauseAudio, stopAudio } from './audio.ts';
import { renderAll, requestTimelineRender, hitTestBeat, updateZoomLabel, formatTime, getLabelWidth, xToTime, getTrackLayout } from './timeline.ts';
import { scheduleAutosave } from './storage.ts';
import { t } from '../i18n/index.ts';
import type { BeatSide, CutDirection } from '../types/index.js';
import { CUT_DIRECTIONS } from '../core/gameplay-rules.ts';
import { matchAction, loadKeybinds } from './keybinds.ts';

const MAX_UNDO = 60;

function getSnapDivision(): number | null {
  return SNAP_DIVISIONS[state.snapIdx] ?? null;
}

function getSnapLabel(): string | null {
  const division = getSnapDivision();
  return division ? `1/${division * 4}` : null;
}

export function getSnap(): number | null {
  const division = getSnapDivision();
  if (!division) return null;
  const bpm = Math.max(20, Math.min(400, Number(state.map.meta.bpm) || 120));
  return (60 / bpm) / division;
}

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

export function tapBeat(side: BeatSide): void {
  if (!state.isPlaying) return;
  const t = snapTime(getPlayPos());
  pushUndo();
  state.map.beats.push({ t, side, type: 'block', cut: state.activeCut });
  sortBeatsByTime(state.map.beats);
  checkOverlaps();
  flashTap(side);
  scheduleAutosave();
}

export function tapRandom(): void {
  if (!state.isPlaying) return;
  const t: number = snapTime(getPlayPos());
  pushUndo();
  state.map.beats.push({ t, side: 'random', type: 'block', cut: state.activeCut });
  sortBeatsByTime(state.map.beats);
  checkOverlaps();
  flashTap('rand');
  scheduleAutosave();
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

export function startHeld(side: 'left' | 'right'): void {
  if (!state.isPlaying) return;
  // already holding this side — ignore
  if (side === 'left'  && state.heldLeft)  return;
  if (side === 'right' && state.heldRight) return;
  const t = snapTime(getPlayPos());
  pushUndo();
  const beat = { t, side, type: 'held', cut: state.activeCut, duration: 0 };
  state.map.beats.push(beat);
  sortBeatsByTime(state.map.beats);
  if (side === 'left')  state.heldLeft  = beat;
  if (side === 'right') state.heldRight = beat;
  flashTap(side);
  scheduleAutosave();
}

export function endHeld(side: 'left' | 'right'): void {
  const beat = side === 'left' ? state.heldLeft : state.heldRight;
  if (!beat) return;
  const now = getPlayPos();
  beat.duration = Math.max(0.05, now - beat.t);
  if (side === 'left')  state.heldLeft  = null;
  if (side === 'right') state.heldRight = null;
  checkOverlaps();
  scheduleAutosave();
  renderAll();
}

export function flashTap(side: string): void {
  const el = document.getElementById('tapFlash');
  if (!el) return;
  el.className = side === 'left' ? 'flash-left' : side === 'right' ? 'flash-right' : 'flash-rand';
  if (state.tapFlashTimer) clearTimeout(state.tapFlashTimer);
  state.tapFlashTimer = setTimeout(() => { el.className = ''; }, 80);
}

export function cycleSnap(): void {
  state.snapIdx = (state.snapIdx + 1) % SNAP_DIVISIONS.length;
  const label = getSnapLabel();
  const btnSnap = document.getElementById('btnSnap');
  const stSnap  = document.getElementById('stSnap');
  if (btnSnap) {
    btnSnap.textContent = label ? `SNAP: ${label}` : t('creator.snapOff');
    btnSnap.classList.toggle('active', Boolean(label));
  }
  if (stSnap) stSnap.textContent = label ?? t('creator.off');
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

// ── Drag-select state ─────────────────────────────────────────────
let dragSelectActive = false;
let dragSelectStartX = 0;
let dragSelectStartY = 0;
let dragSelectEndX   = 0;
let dragSelectEndY   = 0;

function updateDragSelection(canvas: HTMLCanvasElement): void {
  const { TRACK_H, TRACK_L_Y, TRACK_R_Y, TRACK_B_Y } = getTrackLayout(canvas.height);
  const x1 = Math.min(dragSelectStartX, dragSelectEndX);
  const x2 = Math.max(dragSelectStartX, dragSelectEndX);
  const y1 = Math.min(dragSelectStartY, dragSelectEndY);
  const y2 = Math.max(dragSelectStartY, dragSelectEndY);
  state.selectedBeats.clear();
  for (const beat of state.map.beats) {
    const bx   = getLabelWidth() + (beat.t - state.viewStart) * state.pxPerSec;
    const isBomb = beat.type === 'bomb';
    const ty   = isBomb ? TRACK_B_Y : beat.side === 'left' ? TRACK_L_Y : TRACK_R_Y;
    const by   = ty + TRACK_H / 2;
    if (bx >= x1 && bx <= x2 && by >= y1 && by <= y2) state.selectedBeats.add(beat);
  }
  renderDragSelectRect(canvas, x1, y1, x2 - x1, y2 - y1);
}

function commitDragSelection(canvas: HTMLCanvasElement): void {
  updateDragSelection(canvas);
}

function renderDragSelectRect(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  requestTimelineRender();
  // Overlay drawn directly on top after timeline render
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.fillStyle   = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

let contextMenu: HTMLElement | null = null;

function removeContextMenu(): void {
  if (contextMenu) { contextMenu.remove(); contextMenu = null; }
}

function showTimelineContextMenu(
  clientX: number, clientY: number, clickT: number,
  onPlayEnd: () => void
): void {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = `${clientX}px`;
  menu.style.top  = `${clientY}px`;

  const items: Array<{ label: string; action: () => void }> = [
    {
      label: '⏸ Seekuj tutaj',
      action: () => {
        const wasPlaying = state.isPlaying;
        state.currentTime = Math.max(0, Math.min(clickT, state.map.meta.duration));
        if (wasPlaying) playAudio(state.currentTime, onPlayEnd);
        renderAll();
      },
    },
    {
      label: '[ Ustaw LOOP START',
      action: () => {
        state.loopStart = snapTime(clickT);
        if (state.loopEnd !== null && state.loopStart > state.loopEnd) state.loopEnd = null;
        renderAll();
      },
    },
    {
      label: '] Ustaw LOOP END',
      action: () => {
        state.loopEnd = snapTime(clickT);
        if (state.loopStart !== null && state.loopEnd < state.loopStart) state.loopStart = null;
        renderAll();
      },
    },
  ];

  if (state.clipboard.length) {
    items.push({
      label: '📋 Wklej tutaj',
      action: () => {
        pushUndo();
        const pasted = state.clipboard.map(b => ({ ...b, t: snapTime(clickT + b.t) }));
        state.map.beats.push(...pasted);
        sortBeatsByTime(state.map.beats);
        state.selectedBeats.clear();
        pasted.forEach(b => state.selectedBeats.add(b));
        checkOverlaps();
        scheduleAutosave();
        renderAll();
      },
    });
  }

  for (const item of items) {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.addEventListener('click', () => { item.action(); removeContextMenu(); });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  contextMenu = menu;

  const close = () => removeContextMenu();
  setTimeout(() => window.addEventListener('mousedown', close, { once: true }), 0);
}

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
        showTimelineContextMenu(e.clientX, e.clientY, clickT, callbacks.onPlayEnd);
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
        dragSelectActive    = true;
        dragSelectStartX    = x;
        dragSelectStartY    = e.offsetY;
        dragSelectEndX      = x;
        dragSelectEndY      = e.offsetY;
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
    if (dragSelectActive) {
      dragSelectEndX = e.offsetX;
      dragSelectEndY = e.offsetY;
      updateDragSelection(timelineCanvas);
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
    if (dragSelectActive) {
      commitDragSelection(timelineCanvas);
      dragSelectActive = false;
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
    if (dragSelectActive) {
      dragSelectActive = false;
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
    if (e.repeat && !['heldLeft', 'heldRight'].includes(matchAction(e) ?? '')) {
      // allow auto-repeat through for held actions; block everything else
    }

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

    // ── Delete / Backspace — not rebindable ──
    if (e.key === 'Delete' || e.key === 'Backspace') {
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

    const action = matchAction(e);
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

      case 'deleteSelected':
        // handled above by Delete/Backspace — no-op here (in case rebindable)
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
        const pasted = state.clipboard.map(b => ({ ...b, t: snapTime(state.currentTime + b.t) }));
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
        const duped  = sorted.map(b => ({ ...b, t: snapTime(b.t + offset) }));
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
