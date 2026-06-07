import { state } from '../core/state.ts';
import { ui } from './ui.js';

const UPDATE_INTERVAL_MS = 500;
let lastFrameAt     = performance.now();
let sampleStartedAt = lastFrameAt;
let sampledFrames   = 0;

export function updateFpsCounter(now: number): void {
  const deltaMs = now - lastFrameAt;
  lastFrameAt   = now;
  if (deltaMs <= 0 || deltaMs > 1000) return;
  sampledFrames++;
  const sampleMs = now - sampleStartedAt;
  if (sampleMs < UPDATE_INTERVAL_MS) return;

  const fps     = sampledFrames * 1000 / sampleMs;
  const frameMs = sampleMs / sampledFrames;
  state.fps     = fps;
  state.frameMs = frameMs;

  if (ui.dFps)   ui.dFps.textContent   = fps.toFixed(1);
  if (ui.dFrame) ui.dFrame.textContent = `${frameMs.toFixed(1)}ms`;

  sampledFrames   = 0;
  sampleStartedAt = now;
}
