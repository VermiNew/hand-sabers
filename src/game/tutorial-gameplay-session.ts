import { PAUSE_REASONS } from '../core/pause.ts';
import type { GameMap, PauseReason } from '../types/index.js';
import type { GameplayFeedback } from './gameplay-feedback.ts';

export const TUTORIAL_GAMEPLAY_PROGRESS_EVENT = 'hand-sabers:tutorial-gameplay-progress';
export const TUTORIAL_GAMEPLAY_END_EVENT = 'hand-sabers:tutorial-gameplay-end';

export const TUTORIAL_GAMEPLAY_MAP: GameMap = {
  id: 'tutorial-gameplay',
  formatVersion: 1,
  meta: {
    title: 'Trening podstaw',
    artist: 'Hand Sabers',
    mapper: 'Tutorial',
    difficulty: 'Tutorial',
    duration: 16,
    bpm: 60,
  },
  beats: [
    { t: 2, side: 'left', type: 'block', cut: 'down', x: -0.8, y: 1.15 },
    { t: 3.2, side: 'right', type: 'block', cut: 'down', x: 0.8, y: 1.15 },
    { t: 4.4, side: 'left', type: 'block', cut: 'up', x: -0.75, y: 0.95 },
    { t: 5.5, side: 'right', type: 'block', cut: 'any', x: 0.75, y: 1.3 },
    { t: 6.4, side: 'left', type: 'block', cut: 'any', x: -0.85, y: 1.2 },
    { t: 7.3, side: 'right', type: 'block', cut: 'any', x: 0.85, y: 1.05 },
    { t: 8.7, side: 'random', type: 'bomb', cut: 'any', x: 0, y: 1.1 },
    { t: 10.5, side: 'left', type: 'held', cut: 'any', x: -0.8, y: 1.1, duration: 1.5 },
    { t: 13.5, side: 'right', type: 'block', cut: 'any', x: 0.8, y: 1.15 },
  ],
};

export interface TutorialGameplayProgress {
  directionalCut: boolean;
  goodTiming: boolean;
  combo: boolean;
  bombAvoided: boolean;
  heldComplete: boolean;
  pausedAndResumed: boolean;
}

export function createTutorialGameplayProgress(): TutorialGameplayProgress {
  return {
    directionalCut: false,
    goodTiming: false,
    combo: false,
    bombAvoided: false,
    heldComplete: false,
    pausedAndResumed: false,
  };
}

export function applyTutorialGameplayFeedback(
  progress: TutorialGameplayProgress,
  feedback: GameplayFeedback,
): void {
  if (feedback.type === 'block-hit') {
    if (feedback.cut !== 'any' && feedback.reason !== 'cut') progress.directionalCut = true;
    if (feedback.quality === 'GOOD' || feedback.quality === 'PERFECT') progress.goodTiming = true;
    if (feedback.combo >= 3) progress.combo = true;
  } else if (feedback.type === 'bomb-avoided') {
    progress.bombAvoided = true;
  } else if (feedback.type === 'held-complete') {
    progress.heldComplete = true;
  }
}

export function applyTutorialPauseState(
  progress: TutorialGameplayProgress,
  paused: boolean,
  reason: PauseReason,
  manualPauseSeen: boolean,
): boolean {
  if (reason !== PAUSE_REASONS.MANUAL) return manualPauseSeen;
  if (paused) return true;
  if (manualPauseSeen) progress.pausedAndResumed = true;
  return manualPauseSeen;
}

export function isTutorialGameplayComplete(progress: TutorialGameplayProgress): boolean {
  return Object.values(progress).every(Boolean);
}
