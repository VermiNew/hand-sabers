import { canAutoResumeFromHands } from '../core/pause.ts';
import { S, state } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { ui, updateHandsResumeProgress } from '../ui/ui.ts';

const HANDS_LOST_PAUSE_MS = 330;
const HANDS_RESUME_MS = 1000;

interface HandsPauseControllerOptions {
  isMultiplayerRoundActive(): boolean;
  pauseForHands(now: number): void;
  resumeFromHands(now: number): void;
}

export interface HandsPauseController {
  reset(): void;
  update(now: number): void;
}

function hasRequiredHands(): boolean {
  if (state.oneHandMode === 'left') return state.handsLeftActive;
  if (state.oneHandMode === 'right') return state.handsRightActive;
  return state.handsLeftActive && state.handsRightActive;
}

export function getMissingHandsText(): string {
  if (state.oneHandMode === 'left') return t('hands.oneHandLeft');
  if (state.oneHandMode === 'right') return t('hands.oneHandRight');
  if (!state.handsLeftActive && !state.handsRightActive) return t('hands.bothMissing');
  return !state.handsLeftActive ? t('hands.leftMissing') : t('hands.rightMissing');
}

export function createHandsPauseController({
  isMultiplayerRoundActive,
  pauseForHands,
  resumeFromHands,
}: HandsPauseControllerOptions): HandsPauseController {
  let handsLostSince = 0;
  let handsReturnedSince = 0;

  function reset(): void {
    handsLostSince = 0;
    handsReturnedSince = 0;
  }

  function update(now: number): void {
    if (isMultiplayerRoundActive()) {
      reset();
      return;
    }

    const ready = hasRequiredHands();
    if (state.appState === S.PLAYING) {
      if (!ready) {
        if (!handsLostSince) handsLostSince = now;
        if (now - handsLostSince >= HANDS_LOST_PAUSE_MS) {
          pauseForHands(now);
          reset();
        }
      } else {
        handsLostSince = 0;
      }
      return;
    }

    if (state.appState !== S.PAUSED || state.pauseReason === null || !canAutoResumeFromHands(state.pauseReason)) return;
    if (ready) {
      if (!handsReturnedSince) handsReturnedSince = now;
      const stableMs = now - handsReturnedSince;
      updateHandsResumeProgress(stableMs / HANDS_RESUME_MS);
      if (stableMs >= HANDS_RESUME_MS) {
        resumeFromHands(now);
        handsReturnedSince = 0;
      }
    } else {
      handsReturnedSince = 0;
      updateHandsResumeProgress(0);
      if (ui.pauseSub) ui.pauseSub.textContent = getMissingHandsText();
    }
  }

  return { reset, update };
}
