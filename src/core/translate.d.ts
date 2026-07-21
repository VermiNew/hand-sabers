export type CoreLang = 'pl' | 'en';
export type CoreMessageKey =
  | 'audioNotSelected'
  | 'audioUnsupported'
  | 'audioTooShort'
  | 'audioTooLong'
  | 'audioDecodeFailed'
  | 'fileTooLarge'
  | 'unsafeZipPath'
  | 'mapMustBeObject'
  | 'mapTooLong'
  | 'tooManyBeats'
  | 'beatTooLate'
  | 'mapNeedsBeats';
export function setCoreLang(lang: CoreLang): void;
export function coreT(key: CoreMessageKey, values?: Record<string, string | number>): string;
