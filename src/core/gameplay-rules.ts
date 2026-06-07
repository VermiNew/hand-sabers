import type { CutDirection } from '../types/index.js';

export const CUT_DIRECTIONS = ['any', 'down', 'up', 'left', 'right', 'down-left', 'down-right', 'up-left', 'up-right'] as const;

const CUT_ALIASES = new Map<string, CutDirection>([
  ['', 'any'], ['none', 'any'], ['no-dot', 'any'], ['dot', 'any'], ['free', 'any'], ['any', 'any'],
  ['d', 'down'], ['down', 'down'], ['↓', 'down'], ['dol', 'down'], ['dół', 'down'],
  ['u', 'up'], ['up', 'up'], ['↑', 'up'], ['gora', 'up'], ['góra', 'up'],
  ['l', 'left'], ['left', 'left'], ['←', 'left'], ['lewo', 'left'],
  ['r', 'right'], ['right', 'right'], ['→', 'right'], ['prawo', 'right'],
  ['dl', 'down-left'], ['down-left', 'down-left'], ['↙', 'down-left'],
  ['dr', 'down-right'], ['down-right', 'down-right'], ['↘', 'down-right'],
  ['ul', 'up-left'], ['up-left', 'up-left'], ['↖', 'up-left'],
  ['ur', 'up-right'], ['up-right', 'up-right'], ['↗', 'up-right'],
]);

interface Vector2 {
  x: number;
  y: number;
}

interface SwingVector extends Vector2 {
  len: number;
}

interface SwingCache {
  hasPrevious?: boolean;
  currentStart?: Vector2;
  previousStart?: Vector2;
  currentEnd?: Vector2;
  previousEnd?: Vector2;
}

interface ComboStateLike {
  combo?: unknown;
  maxCombo?: unknown;
}

interface ComboState {
  combo: number;
  maxCombo: number;
}

interface HitQualityOptions {
  deltaMs?: unknown;
  centerDistance?: unknown;
  perfectRadius?: number;
  cutOk?: boolean;
}

interface HitQuality {
  label: 'PERFECT' | 'GOOD' | 'BAD';
  basePoints: number;
  advancesCombo: boolean;
  strong: boolean;
  reason: 'perfect' | 'timing' | 'cut';
}

const CUT_VECTORS: Record<CutDirection, Vector2 | null> = {
  any: null,
  down:       { x:  0, y: -1 },
  up:         { x:  0, y:  1 },
  left:       { x: -1, y:  0 },
  right:      { x:  1, y:  0 },
  'down-left':  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  'down-right': { x:  Math.SQRT1_2, y: -Math.SQRT1_2 },
  'up-left':    { x: -Math.SQRT1_2, y:  Math.SQRT1_2 },
  'up-right':   { x:  Math.SQRT1_2, y:  Math.SQRT1_2 },
};

export const CUT_SYMBOLS: Record<CutDirection, string> = {
  any: '•',
  down: '↓',
  up: '↑',
  left: '←',
  right: '→',
  'down-left': '↙',
  'down-right': '↘',
  'up-left': '↖',
  'up-right': '↗',
};

export function normalizeCutDirection(value: unknown): CutDirection {
  const key = String(value ?? 'any').trim().toLowerCase().replace(/_/g, '-');
  return CUT_ALIASES.get(key) || (CUT_DIRECTIONS.includes(key as CutDirection) ? key as CutDirection : 'any');
}

export function getCutVector(cut: unknown): Vector2 | null {
  return CUT_VECTORS[normalizeCutDirection(cut)] || null;
}

export function nextCutDirection(cut: unknown): CutDirection {
  const idx = CUT_DIRECTIONS.indexOf(normalizeCutDirection(cut));
  return CUT_DIRECTIONS[(idx + 1) % CUT_DIRECTIONS.length]!;
}

export function cutDirectionLabel(cut: unknown): string {
  const normalized = normalizeCutDirection(cut);
  return CUT_SYMBOLS[normalized] || CUT_SYMBOLS.any;
}

export function getSwingVector2(cache: SwingCache | null | undefined): SwingVector {
  if (!cache?.hasPrevious || !cache?.currentStart || !cache?.previousStart || !cache?.currentEnd || !cache?.previousEnd) {
    return { x: 0, y: 0, len: 0 };
  }
  const sx = ((cache.currentStart.x - cache.previousStart.x) + (cache.currentEnd.x - cache.previousEnd.x)) / 2;
  const sy = ((cache.currentStart.y - cache.previousStart.y) + (cache.currentEnd.y - cache.previousEnd.y)) / 2;
  const len = Math.hypot(sx, sy);
  if (len <= 0.000001) return { x: 0, y: 0, len: 0 };
  return { x: sx / len, y: sy / len, len };
}

export function isCutDirectionMatch(requiredCut: unknown, swingVector: SwingVector | null | undefined, minDot = 0.38): boolean {
  const target = getCutVector(requiredCut);
  if (!target) return true;
  if (!swingVector || swingVector.len <= 0.000001) return false;
  return swingVector.x * target.x + swingVector.y * target.y >= minDot;
}

export function createInitialComboState(): ComboState {
  return { combo: 0, maxCombo: 0 };
}

export function registerComboHit(comboState: ComboStateLike | null | undefined): ComboState {
  const combo = Math.max(0, Math.floor(Number(comboState?.combo) || 0)) + 1;
  return { combo, maxCombo: Math.max(Math.max(0, Math.floor(Number(comboState?.maxCombo) || 0)), combo) };
}

export function resetCombo(comboState: ComboStateLike = {}): ComboState {
  return { combo: 0, maxCombo: Math.max(0, Math.floor(Number(comboState.maxCombo) || 0)) };
}

export function classifyHitQuality({
  deltaMs = Infinity,
  centerDistance = Infinity,
  perfectRadius = 0.22,
  cutOk = true,
}: HitQualityOptions = {}): HitQuality {
  const absDelta = Math.abs(Number(deltaMs));
  const center = Number(centerDistance);
  if (!cutOk) return { label: 'BAD', basePoints: 25, advancesCombo: false, strong: false, reason: 'cut' };
  if (Number.isFinite(absDelta) && absDelta <= 70 && Number.isFinite(center) && center <= perfectRadius) {
    return { label: 'PERFECT', basePoints: 150, advancesCombo: true, strong: true, reason: 'perfect' };
  }
  if (Number.isFinite(absDelta) && absDelta <= 150) {
    return { label: 'GOOD', basePoints: 100, advancesCombo: true, strong: false, reason: 'timing' };
  }
  return { label: 'BAD', basePoints: 40, advancesCombo: false, strong: false, reason: 'timing' };
}

export function scoreForHit(basePoints: number, combo: unknown): number {
  return Math.max(0, Math.floor(basePoints * Math.max(1, Number(combo) || 0)));
}
