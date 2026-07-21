import { coreT } from './translate.js';
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
  if (!fileLike) throw new Error(coreT('audioNotSelected'));
  assertFileSize(fileLike, maxBytes);
  if (!isSupportedAudioFile(fileLike)) {
    throw new Error(coreT('audioUnsupported'));
  }
  return true;
}

export function validateDecodedAudio(audioBuffer: DecodedAudioLike | null | undefined): boolean {
  const duration = Number(audioBuffer?.duration ?? 0);
  if (!Number.isFinite(duration) || duration < MIN_AUDIO_DURATION_SEC) {
    throw new Error(coreT('audioTooShort'));
  }
  if (duration > MAX_AUDIO_DURATION_SEC) {
    throw new Error(coreT('audioTooLong'));
  }
  const sampleRate = Number(audioBuffer?.sampleRate ?? 0);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(coreT('audioDecodeFailed'));
  }
  return true;
}
