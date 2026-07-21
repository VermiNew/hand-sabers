import { t } from '../i18n/index.ts';
import { CUT_DIRECTIONS, CUT_SYMBOLS, normalizeCutDirection, nextCutDirection } from '../core/gameplay-rules.ts';

export { CUT_DIRECTIONS, CUT_SYMBOLS, normalizeCutDirection, nextCutDirection };

export function cutButtonText(cut: unknown): string {
  const normalized = normalizeCutDirection(cut);
  return `${t('creator.cut')} ${CUT_SYMBOLS[normalized] || CUT_SYMBOLS.any}`;
}
