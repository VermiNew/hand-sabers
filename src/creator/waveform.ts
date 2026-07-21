import { state } from './state.ts';

export function drawWaveform(): void {
  const canvas = document.getElementById('waveCanvas') as HTMLCanvasElement | null;
  if (!canvas || !state.audioBuffer) return;
  const w   = canvas.width;
  const h   = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#02050b';
  ctx.fillRect(0, 0, w, h);

  const data = state.audioBuffer.getChannelData(0);
  const step = Math.ceil(data.length / w);
  const mid  = h / 2;

  // Waveform fill
  ctx.fillStyle = 'rgba(47,124,255,0.10)';
  for (let x = 0; x < w; x++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const s = data[x * step + j] ?? 0;
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const top = mid + min * mid * 0.9;
    const bot = mid + max * mid * 0.9;
    ctx.fillRect(x, top, 1, Math.max(1, bot - top));
  }

  // Waveform outline
  ctx.strokeStyle = 'rgba(47,124,255,0.55)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const s = data[x * step + j] ?? 0;
      if (s < min) min = s;
      if (s > max) max = s;
    }
    ctx.moveTo(x, mid + min * mid * 0.9);
    ctx.lineTo(x, mid + max * mid * 0.9);
  }
  ctx.stroke();

  // Center line
  ctx.strokeStyle = 'rgba(47,124,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

  drawWaveformOverlay(ctx, w, h);
}

export function drawWaveformOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  if (!state.audioBuffer) return;
  const dur = state.audioBuffer.duration;
  if (dur <= 0) return;

  // Beat density heatmap — vertical lines per beat
  for (const beat of state.map.beats) {
    const x = Math.round((beat.t / dur) * w);
    if (x < 0 || x > w) continue;
    const isBomb = beat.type === 'bomb';
    ctx.strokeStyle = isBomb
      ? 'rgba(255,68,68,0.55)'
      : beat.side === 'left'
        ? 'rgba(54,242,161,0.55)'
        : 'rgba(47,124,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Playhead position marker on waveform
  const playX = Math.round((state.currentTime / dur) * w);
  if (playX >= 0 && playX <= w) {
    ctx.strokeStyle = 'rgba(255,34,85,0.9)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(playX, 0); ctx.lineTo(playX, h); ctx.stroke();
  }
}

export function bindWaveformHover(): void {
  const canvas = document.getElementById('waveCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  let hoverX = -1;

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!state.audioBuffer) return;
    hoverX = e.offsetX;
    redrawWaveformWithCursor(canvas, hoverX);
  });

  canvas.addEventListener('mouseleave', () => {
    hoverX = -1;
    drawWaveform();
  });

  // Wheel on waveform = scroll timeline viewStart
  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    if (!state.audioBuffer) return;
    state.viewStart = Math.max(
      0,
      state.viewStart + (e.deltaY / 100) * (10 / state.pxPerSec * 20),
    );
    canvas.dispatchEvent(new CustomEvent('waveform-scroll', { bubbles: true }));
  }, { passive: false });
}

function redrawWaveformWithCursor(canvas: HTMLCanvasElement, hoverX: number): void {
  if (!state.audioBuffer) return;
  const w   = canvas.width;
  const h   = canvas.height;
  const ctx = canvas.getContext('2d')!;

  drawWaveform();

  // Cursor line
  if (hoverX >= 0 && hoverX <= w) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hoverX, 0); ctx.lineTo(hoverX, h); ctx.stroke();
    ctx.setLineDash([]);

    // Time tooltip
    const t = (hoverX / w) * state.audioBuffer.duration;
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1);
    ctx.fillStyle    = 'rgba(226,232,240,0.75)';
    ctx.font         = '9px JetBrains Mono';
    ctx.textBaseline = 'top';
    ctx.textAlign    = hoverX > w * 0.8 ? 'right' : 'left';
    ctx.fillText(`${m}:${String(Math.floor(Number(s))).padStart(2,'0')}.${s.slice(-1)}`, hoverX + (hoverX > w * 0.8 ? -4 : 4), 3);
    ctx.textBaseline = 'alphabetic';
  }
}
