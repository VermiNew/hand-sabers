import { PAUSE_REASONS } from '../core/pause.ts';
import { S, state } from '../core/state.ts';
import type { PauseReason } from '../types/index.js';
import { t } from '../i18n/index.ts';
import { ui, clearDangerPulse, hideHandsPaused, hidePauseMenu, showHandsPaused, showPauseMenu } from '../ui/ui.ts';
import { hasMapAudio, resumeAudioContext } from './audio.ts';
import { createGameplayFocusProtection } from './gameplay-focus-protection.ts';
import { createHandsPauseController, getMissingHandsText } from './hands-pause-controller.ts';
import type { MapTimeline } from './map-timeline.ts';
import { createPauseResumeGuard } from './pause-resume-guard.ts';
import type { ResumeSource } from './pause-resume-guard.ts';
import { setPauseMenuMessage, syncPauseMenuActions } from './pause-ui.ts';

interface GamePauseControllerOptions {
  isMultiplayerRoundActive(): boolean;
  mapTimeline: Pick<MapTimeline, 'pause' | 'resume'>;
}

export interface GamePauseController {
  bindFocusProtection(): void;
  pauseGame(reason: PauseReason, now?: number): void;
  reset(): void;
  resumeGame(now?: number, source?: ResumeSource): Promise<boolean>;
  updateHands(now: number): void;
}

export function createGamePauseController({
  isMultiplayerRoundActive,
  mapTimeline,
}: GamePauseControllerOptions): GamePauseController {
  const resumeGuard = createPauseResumeGuard();

  function pauseGame(reason: PauseReason, now = performance.now()): void {
    if (state.appState !== S.PLAYING) return;
    state.appState = S.PAUSED;
    state.pauseReason = reason;
    clearDangerPulse();
    mapTimeline.pause(now);
    if (reason === PAUSE_REASONS.HANDS) {
      showHandsPaused(getMissingHandsText());
      resumeGuard.unlock();
      syncPauseMenuActions(isMultiplayerRoundActive());
      hidePauseMenu();
    } else {
      if (reason === PAUSE_REASONS.FOCUS) resumeGuard.lockForFocusLoss();
      else resumeGuard.unlock();
      hideHandsPaused();
      setPauseMenuMessage(reason);
      syncPauseMenuActions(isMultiplayerRoundActive());
      showPauseMenu();
    }
    if (ui.dStatus) ui.dStatus.textContent = reason === PAUSE_REASONS.HANDS ? t('game.pauseHands') : t('game.pause');
  }

  async function resumeGame(now = performance.now(), source: ResumeSource = 'ui'): Promise<boolean> {
    if (state.appState !== S.PAUSED) return false;
    const pausedReason = state.pauseReason;
    if (!resumeGuard.tryBeginAttempt(pausedReason, source, now)) return false;
    try {
      if (hasMapAudio() && !await resumeAudioContext()) return false;
      if (state.appState !== S.PAUSED || state.pauseReason !== pausedReason) return false;
      mapTimeline.resume(performance.now());
      state.appState = S.PLAYING;
      state.pauseReason = PAUSE_REASONS.NONE;
      resumeGuard.resetAfterResume();
      setPauseMenuMessage(PAUSE_REASONS.NONE);
      hideHandsPaused();
      hidePauseMenu();
      if (ui.dStatus) ui.dStatus.textContent = 'PLAYING';
      return true;
    } finally {
      resumeGuard.finishAttempt();
    }
  }

  const focusProtection = createGameplayFocusProtection({
    isMultiplayerRoundActive,
    pauseForFocus: now => pauseGame(PAUSE_REASONS.FOCUS, now),
    resumeGuard,
  });
  const handsPauseController = createHandsPauseController({
    isMultiplayerRoundActive,
    pauseForHands: now => pauseGame(PAUSE_REASONS.HANDS, now),
    resumeFromHands: now => { void resumeGame(now, 'hands'); },
  });

  return {
    bindFocusProtection: focusProtection.bind,
    pauseGame,
    reset(): void {
      focusProtection.reset();
      handsPauseController.reset();
      resumeGuard.reset();
    },
    resumeGame,
    updateHands: handsPauseController.update,
  };
}
