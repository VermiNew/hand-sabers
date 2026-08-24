import { PAUSE_REASONS } from '../core/pause.ts';
import { S, state } from '../core/state.ts';
import type { PauseReason } from '../types/index.js';
import { setPauseResumeButtonDisabled } from './pause-ui.ts';

export type ResumeSource = 'ui' | 'keyboard' | 'hands';

const FOCUS_RESUME_GUARD_MS = 450;

export interface PauseResumeGuard {
  armAfterFocusReturn(now?: number): void;
  finishAttempt(): void;
  lockForFocusLoss(): void;
  reset(): void;
  resetAfterResume(): void;
  tryBeginAttempt(reason: PauseReason, source: ResumeSource, now: number): boolean;
  unlock(): void;
}

export function createPauseResumeGuard(): PauseResumeGuard {
  let focusResumeAllowedAt = 0;
  let focusResumeGuardTimer = 0;
  let resumeInFlight = false;

  function clearTimer(): void {
    window.clearTimeout(focusResumeGuardTimer);
    focusResumeGuardTimer = 0;
  }

  function resetAfterResume(): void {
    focusResumeAllowedAt = 0;
    clearTimer();
    setPauseResumeButtonDisabled(false);
  }

  return {
    armAfterFocusReturn(now = performance.now()): void {
      clearTimer();
      focusResumeAllowedAt = now + FOCUS_RESUME_GUARD_MS;
      setPauseResumeButtonDisabled(true);
      focusResumeGuardTimer = window.setTimeout(() => {
        if (
          state.appState === S.PAUSED
          && state.pauseReason === PAUSE_REASONS.FOCUS
          && !document.hidden
          && document.hasFocus()
        ) {
          setPauseResumeButtonDisabled(false);
        }
      }, FOCUS_RESUME_GUARD_MS);
    },
    finishAttempt(): void {
      resumeInFlight = false;
    },
    lockForFocusLoss(): void {
      focusResumeAllowedAt = Number.POSITIVE_INFINITY;
      setPauseResumeButtonDisabled(true);
    },
    reset(): void {
      resetAfterResume();
      resumeInFlight = false;
    },
    resetAfterResume,
    tryBeginAttempt(reason, source, now): boolean {
      if (resumeInFlight) return false;
      if (
        reason === PAUSE_REASONS.FOCUS
        && (source === 'hands' || document.hidden || !document.hasFocus() || now < focusResumeAllowedAt)
      ) {
        return false;
      }
      resumeInFlight = true;
      return true;
    },
    unlock(): void {
      setPauseResumeButtonDisabled(false);
    },
  };
}
