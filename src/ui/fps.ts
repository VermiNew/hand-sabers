import { state } from '../core/state.ts';
import { ui } from './ui.ts';

const UPDATE_INTERVAL_MS = 500;
const AVG_WINDOW_MS      = 10_000;
let lastFrameAt     = performance.now();
let sampleStartedAt = lastFrameAt;
let sampledFrames   = 0;
const fpsSamples: Array<{ at: number; frames: number; durationMs: number }> = [];

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

  fpsSamples.push({ at: now, frames: sampledFrames, durationMs: sampleMs });
  while (fpsSamples.length > 0 && fpsSamples[0]!.at < now - AVG_WINDOW_MS) fpsSamples.shift();
  const totals = fpsSamples.reduce((result, sample) => {
    result.frames += sample.frames;
    result.durationMs += sample.durationMs;
    return result;
  }, { frames: 0, durationMs: 0 });
  state.avgFps = totals.durationMs > 0 ? totals.frames * 1000 / totals.durationMs : 0;

  if (ui.dFps)   ui.dFps.textContent   = fps.toFixed(1);
  if (ui.dFrame) ui.dFrame.textContent = `${frameMs.toFixed(1)}ms`;

  sampledFrames   = 0;
  sampleStartedAt = now;
}
