import { PAUSE_REASONS } from '../core/pause.ts';
import { S, state } from '../core/state.ts';
import { hidePauseMenu } from '../ui/ui.ts';
import type { MapTimeline } from './map-timeline.ts';

interface NarratorPauseEventsOptions {
  mapTimeline: MapTimeline;
  resumeGame(now: number, source: 'ui'): Promise<unknown>;
}

export function initNarratorPauseEvents({ mapTimeline, resumeGame }: NarratorPauseEventsOptions): void {
  window.addEventListener('hand-sabers:narrator-pause', () => {
    if (state.appState === S.PLAYING) {
      state.appState = S.PAUSED;
      state.pauseReason = PAUSE_REASONS.NARRATOR;
      mapTimeline.pause(performance.now());
      hidePauseMenu();
    }
  });
  window.addEventListener('hand-sabers:narrator-resume', () => {
    if (state.appState === S.PAUSED && state.pauseReason === PAUSE_REASONS.NARRATOR) {
      void resumeGame(performance.now(), 'ui');
    }
  });
}
