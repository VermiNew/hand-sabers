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

  // Label panel background in ruler
  ctx.fillStyle = 'rgba(4,6,14,0.95)';
  ctx.fillRect(0, 0, LABEL_W, h);
  ctx.fillStyle = 'rgba(5,7,13,0.92)';
  ctx.fillRect(LABEL_W, 0, w - LABEL_W, h);

  const secInView = (w - LABEL_W) / state.pxPerSec;
  const startSec  = state.viewStart;
  const endSec    = state.viewStart + secInView;

  // BPM beat/bar markers
  const bpm = state.map.meta && (state.map.meta as Record<string, unknown>)['bpm']
    ? Number((state.map.meta as Record<string, unknown>)['bpm'])
    : 0;

  if (bpm > 0 && bpm < 400) {
    const beatSec = 60 / bpm;
    const barSec  = beatSec * 4;
    let t = Math.floor(startSec / beatSec) * beatSec;
    while (t <= endSec + beatSec) {
      const x = Math.round(LABEL_W + (t - state.viewStart) * state.pxPerSec);
      if (x > LABEL_W && x <= w) {
        const isBar = Math.abs(t % barSec) < beatSec * 0.02;
        ctx.strokeStyle = isBar ? 'rgba(255,200,80,0.45)' : 'rgba(255,200,80,0.12)';
        ctx.lineWidth   = isBar ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(x, isBar ? h - 10 : h - 5); ctx.lineTo(x, h); ctx.stroke();
        if (isBar) {
          ctx.fillStyle = 'rgba(255,200,80,0.7)';
          ctx.font      = '8px JetBrains Mono';
          ctx.textAlign = 'center';
          ctx.fillText(formatTime(t), x, h - 12);
        }
      }
      t += beatSec;
    }
  } else {
    // Fallback: time interval markers
    let interval = 1;
    if (state.pxPerSec < 20)       interval = 10;
    else if (state.pxPerSec < 40)  interval = 5;
    else if (state.pxPerSec > 200) interval = 0.5;

    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.fillStyle   = 'rgba(148,163,184,0.65)';
    ctx.font        = '9px JetBrains Mono';
    ctx.textAlign   = 'center';
    ctx.lineWidth   = 1;

    let t = Math.floor(startSec / interval) * interval;
    while (t <= endSec + interval) {
      const x = Math.round(LABEL_W + (t - state.viewStart) * state.pxPerSec);
      if (x > LABEL_W && x <= w) {
        ctx.beginPath(); ctx.moveTo(x, h - 6); ctx.lineTo(x, h); ctx.stroke();
        ctx.fillText(formatTime(t), x, h - 8);
      }
      t += interval;
    }
  }

  // Bottom border
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, h - 1); ctx.lineTo(w, h - 1); ctx.stroke();

  // Label panel border
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, h); ctx.stroke();
}

const LABEL_W  = 48; // fixed left panel width for track labels
const RULER_H  = 24;

export function getTrackLayout(h: number): { TRACK_H: number; TRACK_L_Y: number; TRACK_R_Y: number; TRACK_B_Y: number } {
  const available = h - RULER_H - 8;
  const TRACK_H   = Math.floor(available / 3);
  return {
    TRACK_H,
    TRACK_L_Y: RULER_H + 4,
    TRACK_R_Y: RULER_H + 4 + TRACK_H + 4,
    TRACK_B_Y: RULER_H + 4 + (TRACK_H + 4) * 2,
  };
}

export function renderTimeline(): void {
  const canvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const w   = canvas.width;
  const h   = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#020509';
  ctx.fillRect(0, 0, w, h);

  const { TRACK_H, TRACK_L_Y, TRACK_R_Y, TRACK_B_Y } = getTrackLayout(h);
  const secInView = (w - LABEL_W) / state.pxPerSec;

  // ── Track backgrounds (full width including label panel) ──
  const tracks = [
    { y: TRACK_L_Y, fill: 'rgba(54,242,161,0.06)', border: 'rgba(54,242,161,0.18)', label: 'LEWO',  labelColor: '#36f2a1' },
    { y: TRACK_R_Y, fill: 'rgba(47,124,255,0.06)',  border: 'rgba(47,124,255,0.18)',  label: 'PRAWO', labelColor: '#2f7cff' },
    { y: TRACK_B_Y, fill: 'rgba(255,58,58,0.06)',   border: 'rgba(255,58,58,0.18)',   label: 'BOMBY', labelColor: '#ff5555' },
  ];

  for (const tr of tracks) {
    ctx.fillStyle = tr.fill;
    ctx.fillRect(0, tr.y, w, TRACK_H);
    ctx.strokeStyle = tr.border;
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, tr.y, w, TRACK_H);
  }

  // ── Label panel ──
  ctx.fillStyle = 'rgba(4,6,14,0.82)';
  ctx.fillRect(0, RULER_H, LABEL_W, h - RULER_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(LABEL_W, RULER_H); ctx.lineTo(LABEL_W, h); ctx.stroke();

  ctx.font         = 'bold 9px JetBrains Mono';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  for (const tr of tracks) {
    ctx.fillStyle = tr.labelColor;
    ctx.fillText(tr.label, LABEL_W / 2, tr.y + TRACK_H / 2);
  }
  ctx.textBaseline = 'alphabetic';

  // ── Vertical grid (BPM + half-second lines) ──
  const bpm = state.map.meta && (state.map.meta as Record<string, unknown>)['bpm']
    ? Number((state.map.meta as Record<string, unknown>)['bpm'])
    : 0;

  if (bpm > 0 && bpm < 400) {
    const beatSec = 60 / bpm;
    const barSec  = beatSec * 4;
    let t = Math.floor(state.viewStart / beatSec) * beatSec;
    const end = state.viewStart + secInView;
    while (t <= end + beatSec) {
      const x = LABEL_W + (t - state.viewStart) * state.pxPerSec;
      if (x > LABEL_W && x <= w) {
        const isBar = Math.abs(t % barSec) < beatSec * 0.02;
        ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
        ctx.lineWidth   = isBar ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(x, RULER_H); ctx.lineTo(x, h); ctx.stroke();
      }
      t += beatSec;
    }
  } else {
    ctx.strokeStyle = 'rgba(47,124,255,0.09)';
    ctx.lineWidth   = 1;
    let t = Math.floor(state.viewStart / 0.5) * 0.5;
    while (t <= state.viewStart + secInView) {
      const x = LABEL_W + (t - state.viewStart) * state.pxPerSec;
      if (x > LABEL_W && x <= w) {
        ctx.beginPath(); ctx.moveTo(x, RULER_H); ctx.lineTo(x, h); ctx.stroke();
      }
      t += 0.5;
    }
  }

  // ── Loop region ──
  if (state.loopEnabled && state.loopStart !== null && state.loopEnd !== null) {
    const lx1 = LABEL_W + (state.loopStart - state.viewStart) * state.pxPerSec;
    const lx2 = LABEL_W + (state.loopEnd   - state.viewStart) * state.pxPerSec;
    const rx   = Math.max(LABEL_W, lx1);
    const rw   = Math.min(w, lx2) - rx;
    if (rw > 0) {
      ctx.fillStyle = 'rgba(54,242,161,0.08)';
      ctx.fillRect(rx, RULER_H, rw, h - RULER_H);
    }
    ctx.strokeStyle = 'rgba(54,242,161,0.65)';
    ctx.lineWidth   = 1.5;
    for (const lx of [lx1, lx2]) {
      if (lx >= LABEL_W && lx <= w) {
        ctx.beginPath(); ctx.moveTo(lx, RULER_H); ctx.lineTo(lx, h); ctx.stroke();
      }
    }
    ctx.font      = '9px JetBrains Mono';
    ctx.fillStyle = 'rgba(54,242,161,0.9)';
    if (lx1 >= LABEL_W && lx1 <= w) {
      ctx.textAlign = 'left';
      ctx.fillText('[ LOOP', lx1 + 3, RULER_H + 14);
    }
    if (lx2 >= LABEL_W && lx2 <= w) {
      ctx.textAlign = 'right';
      ctx.fillText('LOOP ]', lx2 - 3, RULER_H + 14);
    }
  }

  // ── Beats ──
  const rr = ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void };

  for (const beat of state.map.beats) {
    const x = LABEL_W + (beat.t - state.viewStart) * state.pxPerSec;

    const isBomb   = beat.type === 'bomb';
    const isHeld   = beat.type === 'held';
    const sideKey  = beat.side === 'left' ? TRACK_L_Y : beat.side === 'right' ? TRACK_R_Y : TRACK_L_Y;
    const trackY   = isBomb ? TRACK_B_Y : sideKey;
    const color    = isBomb ? '#ff4444' : beat.side === 'left' ? '#36f2a1' : beat.side === 'right' ? '#2f7cff' : '#a78bfa';
    const selected = state.selectedBeats.has(beat);

    const bh = TRACK_H - 10;
    const by = trackY + 5;

    // ── Held block (wall) ──────────────────────────────────────────
    if (isHeld) {
      // duration may be 0 while still recording — use live playhead
      const dur  = (beat.duration ?? 0) > 0
        ? beat.duration!
        : Math.max(0, getPlayPos() - beat.t);
      const barW = Math.max(4, dur * state.pxPerSec);
      const barX = x;

      if (barX > w + barW || barX + barW < LABEL_W) continue;

      ctx.globalAlpha = selected ? 1 : 0.82;
      if (selected) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; }

      // Fill bar
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0,   color);
      grad.addColorStop(1,   color + '88');
      ctx.fillStyle = selected ? 'rgba(255,255,255,0.85)' : grad;
      rr.roundRect(barX, by, barW, bh, 4);
      ctx.fill();

      // Border
      ctx.strokeStyle = selected ? '#fff' : color;
      ctx.lineWidth   = selected ? 2 : 1.5;
      ctx.beginPath();
      rr.roundRect(barX, by, barW, bh, 4);
      ctx.stroke();

      // Start cap glow
      ctx.strokeStyle = selected ? '#fff' : '#fff';
      ctx.lineWidth   = selected ? 3 : 2;
      ctx.globalAlpha = selected ? 1 : 0.6;
      ctx.beginPath(); ctx.moveTo(barX, by); ctx.lineTo(barX, by + bh); ctx.stroke();

      // Duration label if wide enough
      if (barW > 36) {
        ctx.fillStyle    = selected ? '#000' : 'rgba(2,5,11,0.85)';
        ctx.font         = `bold ${Math.max(9, Math.min(13, bh * 0.5))}px JetBrains Mono`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${dur.toFixed(2)}s`, barX + 5, by + bh / 2);
      }

      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha  = 1;
      ctx.shadowBlur   = 0;

      if (beat._overlap) {
        ctx.fillStyle = '#ffaa44';
        ctx.font      = 'bold 10px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText('!', x, by - 2);
      }
      continue;
    }

    // Out-of-view cull for point beats
    if (x < LABEL_W - 26 || x > w + 26) continue;

    const bw = Math.max(14, Math.min(bh - 2, state.pxPerSec * 0.22));
    const bx = x - bw / 2;

    if (selected) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; }

    if (isBomb) {
      const r = Math.min(bw / 2, bh / 2) - 1;
      ctx.fillStyle   = selected ? '#ff8888' : '#ff4444';
      ctx.strokeStyle = selected ? '#ffffff' : '#ff6666';
      ctx.lineWidth   = selected ? 2 : 1;
      ctx.globalAlpha = selected ? 1 : 0.9;
      ctx.beginPath();
      ctx.arc(x, trackY + TRACK_H / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle    = selected ? '#fff' : '#02050b';
      ctx.font         = `bold ${Math.max(11, Math.min(18, bh * 0.55))}px JetBrains Mono`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✕', x, trackY + TRACK_H / 2 + 0.5);
    } else {
      ctx.fillStyle   = selected ? '#ffffff' : color;
      ctx.strokeStyle = selected ? '#fff' : color;
      ctx.lineWidth   = selected ? 2 : 1;
      ctx.globalAlpha = selected ? 1 : 0.88;
      ctx.beginPath();
      rr.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      const cut = normalizeCutDirection(beat.cut);
      ctx.fillStyle    = selected ? '#111' : '#02050b';
      ctx.font         = `bold ${Math.max(13, Math.min(bh - 4, bw - 2))}px JetBrains Mono`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CUT_SYMBOLS[cut] ?? '•', x, by + bh / 2 + 0.5);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha  = 1;
    ctx.shadowBlur   = 0;

    if (beat._overlap) {
      ctx.fillStyle = '#ffaa44';
      ctx.font      = 'bold 10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, by - 2);
    }
  }

  // ── Ghost playhead (not playing) ──
  const pos = getPlayPos();
  const px  = LABEL_W + (pos - state.viewStart) * state.pxPerSec;
  if (!state.isPlaying && px >= LABEL_W && px <= w) {
    ctx.strokeStyle = 'rgba(226,232,240,0.18)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(px, RULER_H); ctx.lineTo(px, h); ctx.stroke();
  }
}

export function renderPlayhead(): void {
  const playheadEl = document.getElementById('playhead');
  if (!playheadEl) return;
  const pos = getPlayPos();
  const x   = LABEL_W + (pos - state.viewStart) * state.pxPerSec;
  playheadEl.style.transform = `translateX(${x}px)`;
  const timelineWidth = playheadEl.parentElement?.clientWidth ?? 0;
  playheadEl.classList.toggle('near-right', timelineWidth > 0 && x > timelineWidth - 130);
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
  const secInView = (canvas.width - LABEL_W) / state.pxPerSec;
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
  const h = canvas.height;
  const { TRACK_H, TRACK_L_Y, TRACK_R_Y, TRACK_B_Y } = getTrackLayout(h);
  const bw = Math.max(10, Math.min(26, state.pxPerSec * 0.20));

  for (const beat of state.map.beats) {
    const x = LABEL_W + (beat.t - state.viewStart) * state.pxPerSec;
    if (Math.abs(mx - x) > bw) continue;
    const isBomb = beat.type === 'bomb';
    const ty     = isBomb ? TRACK_B_Y : beat.side === 'left' ? TRACK_L_Y : TRACK_R_Y;
    if (my >= ty && my <= ty + TRACK_H) return beat;
  }
  return null;
}

export function xToTime(canvasX: number): number {
  return state.viewStart + (canvasX - LABEL_W) / state.pxPerSec;
}

export function getLabelWidth(): number {
  return LABEL_W;
}
