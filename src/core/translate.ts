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

const messages: Record<CoreLang, Record<CoreMessageKey, string>> = {
  pl: {
    audioNotSelected: 'Nie wybrano pliku audio.',
    audioUnsupported: 'Nieobsługiwany format audio. Użyj MP3, OGG, WAV albo FLAC.',
    audioTooShort: 'Audio jest zbyt krótkie albo uszkodzone.',
    audioTooLong: 'Audio jest za długie. Limit kreatora to 60 minut.',
    audioDecodeFailed: 'Nie udało się poprawnie zdekodować audio.',
    fileTooLarge: 'Plik jest za duży ({{size}} MB). Limit: {{limit}} MB.',
    unsafeZipPath: 'Niebezpieczna ścieżka w ZIP: {{name}}',
    mapMustBeObject: 'Mapa musi być obiektem JSON.',
    mapTooLong: 'Mapa jest dłuższa niż dozwolone 24 godziny.',
    tooManyBeats: 'Mapa zawiera zbyt wiele beatów ({{count}}). Limit: {{limit}}.',
    beatTooLate: 'Beat {{index}} przekracza dozwoloną długość mapy wynoszącą 24 godziny.',
    mapNeedsBeats: 'Mapa musi zawierać tablicę beats.',
  },
  en: {
    audioNotSelected: 'No audio file was selected.',
    audioUnsupported: 'Unsupported audio format. Use MP3, OGG, WAV, or FLAC.',
    audioTooShort: 'The audio is too short or corrupted.',
    audioTooLong: 'The audio is too long. The creator limit is 60 minutes.',
    audioDecodeFailed: 'The audio could not be decoded correctly.',
    fileTooLarge: 'The file is too large ({{size}} MB). Limit: {{limit}} MB.',
    unsafeZipPath: 'Unsafe path in ZIP: {{name}}',
    mapMustBeObject: 'The map must be a JSON object.',
    mapTooLong: 'The map is longer than the allowed 24 hours.',
    tooManyBeats: 'The map contains too many beats ({{count}}). Limit: {{limit}}.',
    beatTooLate: 'Beat {{index}} exceeds the allowed map length of 24 hours.',
    mapNeedsBeats: 'The map must contain a beats array.',
  },
};

let currentLang: CoreLang = 'pl';

export function setCoreLang(lang: CoreLang): void {
  currentLang = lang === 'en' ? 'en' : 'pl';
}

export function coreT(
  key: CoreMessageKey,
  values: Record<string, string | number> = {},
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    messages[currentLang][key],
  );
}
