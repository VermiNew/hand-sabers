import { state } from './state.ts';

export function drawWaveform(): void {
  const waveCanvas = document.getElementById('waveCanvas') as HTMLCanvasElement | null;
  if (!waveCanvas || !state.audioBuffer) return;
  const w   = waveCanvas.width;
  const h   = waveCanvas.height;
  const ctx = waveCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#02050b';
  ctx.fillRect(0, 0, w, h);

  const data = state.audioBuffer.getChannelData(0);
  const step = Math.ceil(data.length / w);
  const mid  = h / 2;

  ctx.strokeStyle = 'rgba(47,124,255,0.5)';
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
}
