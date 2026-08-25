import { PAUSE_REASONS } from '../core/pause.ts';
import { S, state } from '../core/state.ts';
import { ui, hideHandsPaused, hidePauseMenu, showMapTitle } from '../ui/ui.ts';
import { clearMapAudio, initAudio, stopMapAudio } from './audio.ts';
import { clearGameplayEntities, resetMapSpawn, startGameplay } from './gameplay.ts';
import { loadMapFromFile, validateMap } from './maploader.ts';
import type { MapTimeline } from './map-timeline.ts';

interface MapDropOptions {
  hideOverlay(): void;
  mapTimeline: Pick<MapTimeline, 'reset' | 'start'>;
}

function bindMapDrop(canvas: HTMLElement, { hideOverlay, mapTimeline }: MapDropOptions): void {
  canvas.addEventListener('dragover', event => event.preventDefault());
  canvas.addEventListener('drop', async (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (!file) return;

    try {
      const wasInGame = state.appState === S.PLAYING || state.appState === S.PAUSED || state.appState === S.GAMEOVER;
      initAudio();
      stopMapAudio();
      clearMapAudio();
      clearGameplayEntities();
      resetMapSpawn();
      mapTimeline.reset();

      const map = await loadMapFromFile(file);
      state.map = validateMap(map) ? map : { ...map, beats: null } as typeof state.map;
      if (ui.dStatus) ui.dStatus.textContent = `MAP: ${map.meta?.title ?? file.name}`;

      if (!wasInGame) return;
      hideHandsPaused();
      hidePauseMenu();
      hideOverlay();
      state.pauseReason = PAUSE_REASONS.NONE;
      state.appState = S.PLAYING;
      if (ui.hud) ui.hud.style.display = 'flex';
      if (ui.mapProgress && state.map) ui.mapProgress.style.display = 'flex';
      mapTimeline.start(performance.now());
      startGameplay();
      showMapTitle(state.map?.meta?.title ?? file.name);
    } catch (error) {
      console.error('Map load error:', error);
      if (ui.dStatus) ui.dStatus.textContent = `MAP ERROR: ${(error as Error).message}`;
    }
  });
}

export function initMapDrop(options: MapDropOptions): void {
  const canvas = document.getElementById('gameCanvas');
  if (canvas) bindMapDrop(canvas, options);
  window.addEventListener('hand-sabers:renderer-canvas-replaced', event => {
    const nextCanvas = (event as CustomEvent<HTMLCanvasElement>).detail;
    if (nextCanvas) bindMapDrop(nextCanvas, options);
  });
}
