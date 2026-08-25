import { state } from '../core/state.ts';
import { tickDevPanel, type FrameProfile } from '../ui/devpanel.ts';
import { ui } from '../ui/ui.ts';
import { smoothProfileValue } from './frame-timing.ts';
import { adaptRenderQuality, cam3d, renderer, scene } from './scene.ts';

let detectMs = 0;

interface RenderFrameOptions {
  now: number;
  frameDeltaMs: number;
  profiling: boolean;
  frameProfile: FrameProfile;
  profileStart: number;
}

export function renderAndReportFrame({
  now,
  frameDeltaMs,
  profiling,
  frameProfile,
  profileStart,
}: RenderFrameOptions): void {
  const renderStart = performance.now();
  renderer.render(scene, cam3d);
  const renderMs = performance.now() - renderStart;
  if (profiling) {
    frameProfile.cpuMs = smoothProfileValue(frameProfile.cpuMs, performance.now() - profileStart);
  }
  detectMs = window.__lastDetectMs ?? detectMs;
  adaptRenderQuality(frameDeltaMs, state.fps);

  const drawCalls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;
  if (ui.dRender) ui.dRender.textContent = `${renderMs.toFixed(1)}ms`;

  tickDevPanel(renderer, now, renderMs, detectMs, {
    drawCalls,
    triangles,
    activeBlocks: window.__activeBlockCount ?? 0,
    activeSparks: window.__activeSparkCount ?? 0,
    conf: window.__lastHandConf ?? 0,
    filteredHands: window.__filteredHandCount ?? 0,
    rawHands: window.__rawHandCount ?? 0,
  }, profiling ? frameProfile : undefined);
}
