import type { Settings } from '../types/index.js';

/**
 * Optional single-player rule tweaks. They are snapshotted when a round starts
 * (see `setActiveModifiers`) so toggling a setting never changes a run in
 * progress, and any active modifier keeps the run off the leaderboard.
 */
export interface RunModifiers {
  /** Swaps left and right: sides, lane positions and horizontal cut directions. */
  mirror: boolean;
  /** Bomb notes are skipped entirely. */
  noBombs: boolean;
  /** Starting lives are doubled. */
  doubleLives: boolean;
}

export const NO_MODIFIERS: Readonly<RunModifiers> = Object.freeze({ mirror: false, noBombs: false, doubleLives: false });

export function modifiersFromSettings(
  settings: Pick<Settings, 'modMirror' | 'modNoBombs' | 'modDoubleLives'>,
): RunModifiers {
  return {
    mirror: settings.modMirror === true,
    noBombs: settings.modNoBombs === true,
    doubleLives: settings.modDoubleLives === true,
  };
}

export function hasModifiers(modifiers: Readonly<RunModifiers>): boolean {
  return modifiers.mirror || modifiers.noBombs || modifiers.doubleLives;
}

const MIRRORED_CUTS: Record<string, string> = {
  left: 'right',
  right: 'left',
  'down-left': 'down-right',
  'down-right': 'down-left',
  'up-left': 'up-right',
  'up-right': 'up-left',
};

export function mirrorSide<T extends string>(side: T): T {
  return (side === 'left' ? 'right' : side === 'right' ? 'left' : side) as T;
}

/** Mirrors the horizontal component of a cut direction; vertical and `any` cuts are unchanged. */
export function mirrorCut<T extends string>(cut: T): T {
  return (MIRRORED_CUTS[cut] ?? cut) as T;
}

let activeModifiers: Readonly<RunModifiers> = NO_MODIFIERS;

export function setActiveModifiers(modifiers: Readonly<RunModifiers>): void {
  activeModifiers = { ...modifiers };
}

export function getActiveModifiers(): Readonly<RunModifiers> {
  return activeModifiers;
}
