import { getSettings } from './settings.ts';

/**
 * True when in-game motion effects (camera shake, damage glitch) should be
 * suppressed: either the OS asks for reduced motion or the player turned the
 * in-game option on. The CSS animations follow the OS setting on their own.
 */
export function isReducedMotion(): boolean {
  if (getSettings().reduceMotion) return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
