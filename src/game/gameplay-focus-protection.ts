import { PAUSE_REASONS } from '../core/pause.ts';
import { S, state } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import type { PauseResumeGuard } from './pause-resume-guard.ts';
import { setPauseMenuMessage } from './pause-ui.ts';

interface GameplayFocusProtectionOptions {
  isMultiplayerRoundActive(): boolean;
  pauseForFocus(now: number): void;
  resumeGuard: PauseResumeGuard;
}

export interface GameplayFocusProtection {
  bind(): void;
  reset(): void;
}

export function createGameplayFocusProtection({
  isMultiplayerRoundActive,
  pauseForFocus,
  resumeGuard,
}: GameplayFocusProtectionOptions): GameplayFocusProtection {
  let warningPending = false;
  let warningOpen = false;
  let violationActive = false;

  function reset(): void {
    resumeGuard.reset();
    warningPending = false;
    warningOpen = false;
    violationActive = false;
    setPauseMenuMessage(PAUSE_REASONS.NONE);
  }

  function showMultiplayerWarning(): void {
    if (!warningPending || warningOpen) return;
    if (!isMultiplayerRoundActive() || state.appState !== S.PLAYING) {
      warningPending = false;
      violationActive = false;
      return;
    }
    if (document.hidden) return;

    warningPending = false;
    warningOpen = true;
    try {
      window.alert(t('multiplayer.focusWarning'));
      window.focus();
    } finally {
      warningOpen = false;
      window.setTimeout(() => { violationActive = false; }, 0);
    }
  }

  function handleFocusLoss(): void {
    if (state.appState !== S.PLAYING) return;
    if (!isMultiplayerRoundActive()) {
      pauseForFocus(performance.now());
      return;
    }
    if (violationActive) return;
    violationActive = true;
    warningPending = true;
    window.setTimeout(showMultiplayerWarning, 0);
  }

  function handleFocusReturn(): void {
    if (!document.hidden && document.hasFocus() && state.pauseReason === PAUSE_REASONS.FOCUS) {
      resumeGuard.armAfterFocusReturn(performance.now());
    }
    showMultiplayerWarning();
  }

  return {
    bind(): void {
      window.addEventListener('blur', handleFocusLoss);
      window.addEventListener('focus', handleFocusReturn);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) handleFocusLoss();
        else handleFocusReturn();
      });
    },
    reset,
  };
}
