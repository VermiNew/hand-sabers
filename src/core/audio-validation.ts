import { AUDIO_EXT_RE, MAX_IMPORT_BYTES, assertFileSize } from './map-format.ts';

export const MIN_AUDIO_DURATION_SEC = 0.25;
export const MAX_AUDIO_DURATION_SEC = 60 * 60;

interface AudioFileLike {
  name?: string;
  type?: string;
  size?: number;
}

interface AudioValidationOptions {
  maxBytes?: number;
}

interface DecodedAudioLike {
  duration?: number;
  sampleRate?: number;
}

export function isSupportedAudioFile(fileLike: AudioFileLike | null | undefined): boolean {
  return Boolean(fileLike?.type?.startsWith?.('audio/') || AUDIO_EXT_RE.test(fileLike?.name || ''));
}

export function validateAudioFile(
  fileLike: AudioFileLike | null | undefined,
  { maxBytes = MAX_IMPORT_BYTES }: AudioValidationOptions = {},
): boolean {
  if (!fileLike) throw new Error('Nie wybrano pliku audio.');
  assertFileSize(fileLike, maxBytes);
  if (!isSupportedAudioFile(fileLike)) {
    throw new Error('Nieobsługiwany format audio. Użyj MP3, OGG, WAV albo FLAC.');
  }
  return true;
}

export function validateDecodedAudio(audioBuffer: DecodedAudioLike | null | undefined): boolean {
  const duration = Number(audioBuffer?.duration ?? 0);
  if (!Number.isFinite(duration) || duration < MIN_AUDIO_DURATION_SEC) {
    throw new Error('Audio jest zbyt krótkie albo uszkodzone.');
  }
  if (duration > MAX_AUDIO_DURATION_SEC) {
    throw new Error('Audio jest za długie. Limit kreatora to 60 minut.');
  }
  const sampleRate = Number(audioBuffer?.sampleRate ?? 0);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Nie udało się poprawnie zdekodować audio.');
  }
  return true;
}
