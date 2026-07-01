import { CUT_SYMBOLS, normalizeCutDirection } from '../core/gameplay-rules.ts';
import { state } from './state.ts';
import type { CreatorBeat } from './state.ts';

const LOOKAHEAD_SEC = 4;

let panel: HTMLElement | null = null;
let canvas: HTMLCanvasElement | null = null;

function beatLane(beat: CreatorBeat): { x: number; y: number } {
  const fallbackX = beat.side === 'left' ? -0.82 : beat.side === 'right' ? 0.82 : 0;
  return {
    x: Number.isFinite(beat.x) ? beat.x! : fallbackX,
    y: Number.isFinite(beat.y) ? beat.y! : 1.1,
  };
}

function project(width: number, height: number, laneX: number, laneY: number, secondsAhead: number) {
  const depth = Math.max(0, Math.min(1, secondsAhead / LOOKAHEAD_SEC));
  const scale = 1 - depth * 0.76;
  const hitY = height - 28;
  const horizonY = 40;
  return {
    x: width / 2 + laneX * width * 0.22 * scale,
    y: hitY + (horizonY - hitY) * depth - (laneY - 1.1) * height * 0.19 * scale,
    scale,
  };
}

function drawTrack(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const hitY = height - 28;
  const horizonY = 40;
  const centerX = width / 2;
  ctx.fillStyle = '#050914';
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createLinearGradient(0, horizonY, 0, hitY);
  glow.addColorStop(0, 'rgba(47,124,255,.02)');
  glow.addColorStop(1, 'rgba(47,124,255,.13)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(centerX - 28, horizonY);
  ctx.lineTo(centerX + 28, horizonY);
  ctx.lineTo(width - 26, hitY);
  ctx.lineTo(26, hitY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(126,184,255,.22)';
  ctx.lineWidth = 1;
  for (const lane of [-1.35, 0, 1.35]) {
    const far = project(width, height, lane, 1.1, LOOKAHEAD_SEC);
    const near = project(width, height, lane, 1.1, 0);
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(54,242,161,.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, hitY);
  ctx.lineTo(width - 24, hitY);
  ctx.stroke();
}

function drawBeat(ctx: CanvasRenderingContext2D, width: number, height: number, beat: CreatorBeat, now: number): void {
  const secondsAhead = beat.t - now;
  if (secondsAhead < -0.12 || secondsAhead > LOOKAHEAD_SEC) return;
  const lane = beatLane(beat);
  const point = project(width, height, lane.x, lane.y, Math.max(0, secondsAhead));
  const size = Math.max(7, 25 * point.scale);
  const selected = state.selectedBeats.has(beat);

  if (beat.type === 'held') {
    const duration = Math.max(0.05, beat.duration ?? 0.05);
    const end = project(width, height, lane.x, lane.y, Math.min(LOOKAHEAD_SEC, secondsAhead + duration));
    ctx.strokeStyle = beat.side === 'left' ? 'rgba(54,242,161,.45)' : 'rgba(47,124,255,.45)';
    ctx.lineWidth = Math.max(3, size * 0.55);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  const color = beat.type === 'bomb'
    ? '#ff5555'
    : beat.side === 'left' ? '#36f2a1' : beat.side === 'right' ? '#2f7cff' : '#a78bfa';
  ctx.shadowColor = selected ? '#ffffff' : color;
  ctx.shadowBlur = selected ? 14 : 7;
  ctx.fillStyle = selected ? '#ffffff' : color;
  if (beat.type === 'bomb') {
    ctx.beginPath();
    ctx.arc(point.x, point.y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#03101a';
    ctx.font = `800 ${Math.max(8, size * 0.65)}px "JetBrains Mono"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CUT_SYMBOLS[normalizeCutDirection(beat.cut)] ?? '•', point.x, point.y + 1);
  }
  ctx.shadowBlur = 0;
}

export function render3dPreview(): void {
  if (!panel || panel.hidden || !canvas) return;
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawTrack(ctx, width, height);
  const now = state.currentTime;
  const visible = state.map.beats
    .filter(beat => beat.t >= now - 0.12 && beat.t <= now + LOOKAHEAD_SEC)
    .sort((left, right) => right.t - left.t);
  for (const beat of visible) drawBeat(ctx, width, height, beat, now);
  ctx.fillStyle = 'rgba(226,232,240,.72)';
  ctx.font = '700 9px "JetBrains Mono"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${now.toFixed(2)} s`, 10, 9);
}

export function init3dPreview(): void {
  panel = document.getElementById('creator3dPanel');
  canvas = document.getElementById('creator3dCanvas') as HTMLCanvasElement | null;
  const toggle = document.getElementById('btn3dPreview');
  const close = document.getElementById('creator3dClose');
  if (!panel || !canvas || !toggle || !close) return;
  const setVisible = (visible: boolean) => {
    panel!.hidden = !visible;
    toggle.classList.toggle('is-active', visible);
    toggle.setAttribute('aria-pressed', String(visible));
    if (visible) render3dPreview();
  };
  toggle.addEventListener('click', () => setVisible(panel!.hasAttribute('hidden')));
  close.addEventListener('click', () => setVisible(false));
}
