export interface RenderLoop {
  start(): void;
  stop(): void;
}

export function createRenderLoop(
  renderFrame: (timestamp: number) => void,
  reportError: (context: string, error: unknown) => void,
): RenderLoop {
  let rafId: number | null = null;
  let running = false;

  function frame(timestamp: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    try {
      renderFrame(timestamp);
    } catch (error) {
      reportError('render-loop', error);
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    },
  };
}
