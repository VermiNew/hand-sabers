import { CUT_DIRECTIONS, CUT_SYMBOLS, normalizeCutDirection, nextCutDirection } from '../core/gameplay-rules.ts';

export { CUT_DIRECTIONS, CUT_SYMBOLS, normalizeCutDirection, nextCutDirection };

export function cutButtonText(cut) {
  const normalized = normalizeCutDirection(cut);
  return `CIĘCIE: ${CUT_SYMBOLS[normalized] || CUT_SYMBOLS.any}`;
}
