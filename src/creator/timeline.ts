import { state } from './state.ts';
import { normalizeCutDirection, CUT_SYMBOLS } from './cut-ui.ts';
import { getPlayPos } from './audio.ts';

export function formatTime(sec: number, showMs = false): string {
  if (!isFinite(sec)) return '0:00';
  const m  = Math.floor(sec / 60);
  const s  = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  const base = `${m}:${String(s).padStart(2, '0')}`;
  return showMs ? `${base}.${ms}` : base;
}

export function renderAll(): void {
  state.timelineDirty = false;
  renderRuler();
  renderTimeline();
  renderPlayhead();
  updateTimecode();
  updateStatus();
}

export function requestTimelineRender(): void {
  state.timelineDirty = true;
}

export function renderRuler(): void {
  const canvas = document.getElementById('rulerCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const w   = canvas.width;
  const h   = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(5,7,13,0.95)';
  ctx.fillRect(0, 0, w, h);

  const secInView = w / state.pxPerSec;
  const startSec  = state.viewStart;
  const endSec    = state.viewStart + secInView;

  let interval = 1;
  if (state.pxPerSec < 20)       interval = 10;
  else if (state.pxPerSec < 40)  interval = 5;
  else if (state.pxPerSec > 200) interval = 0.5;

  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.fillStyle   = 'rgba(148,163,184,0.55)';
  ctx.font        = '9px JetBrains Mono';
  ctx.textAlign   = 'center';
  ctx.lineWidth   = 1;

  let t = Math.floor(startSec / interval) * interval;
  while (t <= endSec + interval) {
    const x = Math.round((t - state.viewStart) * state.pxPerSec);
    if (x >= 0 && x <= w) {
      ctx.beginPath();
      ctx.moveTo(x, h - 6);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(formatTime(t), x, h - 8);
    }
    t += interval;
  }

  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.beginPath();
  ctx.moveTo(0, h - 1);
  ctx.lineTo(w, h - 1);
  ctx.stroke();
}

export function renderTimeline(): void {
  const canvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const w   = canvas.width;
  const h   = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#030610';
  ctx.fillRect(0, 0, w, h);

  const RULER_H   = 24;
  const secInView = w / state.pxPerSec;

  ctx.strokeStyle = 'rgba(47,124,255,0.07)';
  ctx.lineWidth   = 1;
  let t = Math.floor(state.viewStart / 0.5) * 0.5;
  while (t <= state.viewStart + secInView) {
    const x = (t - state.viewStart) * state.pxPerSec;
    ctx.beginPath();
    ctx.moveTo(x, RULER_H);
    ctx.lineTo(x, h);
    ctx.stroke();
    t += 0.5;
  }

  const TRACK_H   = Math.floor((h - RULER_H - 8) / 3);
  const TRACK_L_Y = RULER_H + 4;
  const TRACK_R_Y = TRACK_L_Y + TRACK_H + 4;
  const TRACK_B_Y = TRACK_R_Y + TRACK_H + 4;

  drawTrackBg(ctx, w, TRACK_L_Y, TRACK_H, 'rgba(54,242,161,0.04)',  'LEWO');
  drawTrackBg(ctx, w, TRACK_R_Y, TRACK_H, 'rgba(47,124,255,0.04)',  'PRAWO');
  drawTrackBg(ctx, w, TRACK_B_Y, TRACK_H, 'rgba(255,58,58,0.04)',   'BOMBY');

  for (const beat of state.map.beats) {
    const x = (beat.t - state.viewStart) * state.pxPerSec;
    if (x < -20 || x > w + 20) continue;

    const isBomb   = beat.type === 'bomb';
    const trackY   = isBomb ? TRACK_B_Y : beat.side === 'left' ? TRACK_L_Y : beat.side === 'right' ? TRACK_R_Y : TRACK_L_Y;
    const color    = isBomb ? '#ff3a3a' : beat.side === 'left' ? '#36f2a1' : beat.side === 'right' ? '#2f7cff' : '#94a3b8';
    const selected = state.selectedBeats.has(beat);

    ctx.fillStyle   = selected ? '#ffffff' : color;
    ctx.strokeStyle = selected ? '#ffffff' : color;
    ctx.globalAlpha = selected ? 1 : 0.85;

    const bw = Math.max(8, Math.min(22, state.pxPerSec * 0.18));
    const bh = TRACK_H - 8;
    const bx = x - bw / 2;
    const by = trackY + 4;

    ctx.beginPath();
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(bx, by, bw, bh, 3);
    ctx.fill();

    if (!isBomb) {
      const cut = normalizeCutDirection(beat.cut);
      if (cut !== 'any') {
        ctx.fillStyle    = '#02050b';
        ctx.font         = `bold ${Math.max(10, Math.min(18, bh * 0.58))}px JetBrains Mono`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(CUT_SYMBOLS[cut] ?? '•', x, by + bh / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }

    if (beat._overlap) {
      ctx.fillStyle = '#ffaa44';
      ctx.font      = 'bold 10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, by - 2);
    }

    ctx.globalAlpha = 1;
  }

  const pos = getPlayPos();
  const px  = (pos - state.viewStart) * state.pxPerSec;
  if (px >= 0 && px <= w) {
    ctx.strokeStyle = 'rgba(226,232,240,0.25)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px, RULER_H);
    ctx.lineTo(px, h);
    ctx.stroke();
  }

  if (state.loopEnabled && state.loopStart !== null && state.loopEnd !== null) {
    const lx1 = (state.loopStart - state.viewStart) * state.pxPerSec;
    const lx2 = (state.loopEnd   - state.viewStart) * state.pxPerSec;
    ctx.fillStyle   = 'rgba(54,242,161,0.07)';
    ctx.fillRect(Math.max(0, lx1), RULER_H, Math.min(w, lx2) - Math.max(0, lx1), h - RULER_H);
    ctx.strokeStyle = 'rgba(54,242,161,0.5)';
    ctx.lineWidth   = 1.5;
    if (lx1 >= 0 && lx1 <= w) {
      ctx.beginPath(); ctx.moveTo(lx1, RULER_H); ctx.lineTo(lx1, h); ctx.stroke();
      ctx.fillStyle = 'rgba(54,242,161,0.8)';
      ctx.font      = '9px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText('◀ LOOP', lx1 + 3, RULER_H + 14);
    }
    if (lx2 >= 0 && lx2 <= w) {
      ctx.beginPath(); ctx.moveTo(lx2, RULER_H); ctx.lineTo(lx2, h); ctx.stroke();
      ctx.fillStyle = 'rgba(54,242,161,0.8)';
      ctx.font      = '9px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.fillText('LOOP', lx2 - 3, RULER_H + 14);
    }
  }
}

export function drawTrackBg(ctx: CanvasRenderingContext2D, w: number, y: number, h: number, fill: string, label: string): void {
  ctx.fillStyle   = fill;
  ctx.fillRect(0, y, w, h);
  ctx.strokeStyle = 'rgba(148,163,184,0.08)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(0, y, w, h);
  ctx.fillStyle   = 'rgba(148,163,184,0.2)';
  ctx.font        = '9px JetBrains Mono';
  ctx.textAlign   = 'left';
  ctx.fillText(label, 6, y + h / 2 + 3);
}

export function renderPlayhead(): void {
  const playheadEl = document.getElementById('playhead');
  if (!playheadEl) return;
  const pos = getPlayPos();
  const x   = (pos - state.viewStart) * state.pxPerSec;
  playheadEl.style.transform = `translateX(${x}px)`;
}

export function updateTimecode(): void {
  const timecodeEl = document.getElementById('timecode');
  if (timecodeEl) timecodeEl.textContent = formatTime(getPlayPos(), true);
}

export function updateStatus(): void {
  const left  = state.map.beats.filter(b => b.side === 'left'   && b.type !== 'bomb').length;
  const right = state.map.beats.filter(b => b.side === 'right'  && b.type !== 'bomb').length;
  const rand  = state.map.beats.filter(b => b.side === 'random').length;
  const bombs = state.map.beats.filter(b => b.type  === 'bomb').length;
  const el = (id: string): HTMLElement | null => document.getElementById(id);
  const set = (id: string, val: string): void => { const e = el(id); if (e) e.textContent = val; };
  set('stBeats', String(state.map.beats.length));
  set('stLeft',  String(left));
  set('stRight', String(right));
  set('stRand',  String(rand));
  set('stBombs', String(bombs));
}

export function updateZoomLabel(): void {
  const canvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
  const stZoom = document.getElementById('stZoom');
  if (!canvas || !stZoom) return;
  const secInView = canvas.width / state.pxPerSec;
  stZoom.textContent = `${secInView.toFixed(1)}s`;
}

export function resizeCanvases(): void {
  const wrap           = document.getElementById('timelineWrap')!;
  const waveCanvas     = document.getElementById('waveCanvas')     as HTMLCanvasElement;
  const timelineCanvas = document.getElementById('timelineCanvas') as HTMLCanvasElement;
  const rulerCanvas    = document.getElementById('rulerCanvas')    as HTMLCanvasElement;

  waveCanvas.width      = waveCanvas.clientWidth;
  waveCanvas.height     = waveCanvas.clientHeight;
  timelineCanvas.width  = wrap.clientWidth;
  timelineCanvas.height = wrap.clientHeight;
  rulerCanvas.width     = wrap.clientWidth;
  rulerCanvas.height    = 24;
}

export function hitTestBeat(mx: number, my: number) {
  const canvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
  if (!canvas) return null;
  const h       = canvas.height;
  const RULER_H = 24;
  const TRACK_H = Math.floor((h - RULER_H - 8) / 3);
  const TRACK_L_Y = RULER_H + 4;
  const TRACK_R_Y = TRACK_L_Y + TRACK_H + 4;
  const TRACK_B_Y = TRACK_R_Y + TRACK_H + 4;
  const bw = Math.max(8, Math.min(22, state.pxPerSec * 0.18));

  for (const beat of state.map.beats) {
    const x = (beat.t - state.viewStart) * state.pxPerSec;
    if (Math.abs(mx - x) > bw) continue;
    const isBomb = beat.type === 'bomb';
    const ty     = isBomb ? TRACK_B_Y : beat.side === 'left' ? TRACK_L_Y : TRACK_R_Y;
    if (my >= ty && my <= ty + TRACK_H) return beat;
  }
  return null;
}
