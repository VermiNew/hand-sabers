/** Shared types for host→phone audio remote playback. */

export interface AudioPrepareCommand {
  v: 1;
  type: 'audio-prepare';
  mapId: string;
  latencyMs: number;
}

export interface AudioBankPrepareCommand {
  v: 1;
  type: 'audio-bank-prepare';
  mapId: string;
  latencyMs: number;
  requestId: string;
}

export interface AudioPlayCommand {
  v: 1;
  type: 'audio-play';
  offsetSec: number;
  serverTime: number;
  playbackRate: number;
}

export interface AudioPauseCommand {
  v: 1;
  type: 'audio-pause';
}

export interface AudioStopCommand {
  v: 1;
  type: 'audio-stop';
}

export interface AudioVolumeCommand {
  v: 1;
  type: 'audio-volume';
  volume: number;
}

export interface AudioSeekCommand {
  v: 1;
  type: 'audio-seek';
  offsetSec: number;
}

export type AudioCommand =
  | AudioPrepareCommand
  | AudioBankPrepareCommand
  | AudioPlayCommand
  | AudioPauseCommand
  | AudioStopCommand
  | AudioVolumeCommand
  | AudioSeekCommand;

export interface AudioReadyEvent {
  v: 1;
  type: 'audio-ready';
}

export interface AudioErrorEvent {
  v: 1;
  type: 'audio-error';
  code: string;
}

export interface AudioBankProgressEvent {
  v: 1;
  type: 'audio-bank-progress';
  requestId: string;
  loadedAssets: number;
  totalAssets: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface AudioBankReadyEvent {
  v: 1;
  type: 'audio-bank-ready';
  requestId: string;
  bankId: string;
  cachedAssets: number;
  totalAssets: number;
  totalBytes: number;
}

export interface AudioBankErrorEvent {
  v: 1;
  type: 'audio-bank-error';
  requestId: string;
  code: string;
}

export type AudioEvent =
  | AudioReadyEvent
  | AudioErrorEvent
  | AudioBankProgressEvent
  | AudioBankReadyEvent
  | AudioBankErrorEvent;

const MAP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/i;
const REQUEST_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ERROR_CODE_RE = /^[A-Z0-9_]{1,64}$/;

/** Type guard for audio commands received by the phone. */
export function isAudioCommand(value: unknown): value is AudioCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  if (command['v'] !== 1) return false;
  const type = command['type'];
  if (type === 'audio-prepare' || type === 'audio-bank-prepare') {
    const bankFieldsValid = type !== 'audio-bank-prepare'
      || (typeof command['requestId'] === 'string' && REQUEST_ID_RE.test(command['requestId']));
    return typeof command['mapId'] === 'string'
      && MAP_ID_RE.test(command['mapId'])
      && isFiniteNumber(command['latencyMs'], 0, 1_000)
      && bankFieldsValid;
  }
  if (type === 'audio-play') {
    return isFiniteNumber(command['offsetSec'], 0, 86_400)
      && isFiniteNumber(command['serverTime'], 0, Number.MAX_SAFE_INTEGER)
      && isFiniteNumber(command['playbackRate'], 0.5, 1.5);
  }
  if (type === 'audio-seek') return isFiniteNumber(command['offsetSec'], 0, 86_400);
  if (type === 'audio-volume') return isFiniteNumber(command['volume'], 0, 1);
  return type === 'audio-pause' || type === 'audio-stop';
}

function isFiniteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Type guard for audio events received by the host. */
export function isAudioEvent(value: unknown): value is AudioEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (event['v'] !== 1) return false;
  const type = event['type'];
  if (type === 'audio-ready') return true;
  if (type === 'audio-error') {
    return typeof event['code'] === 'string' && ERROR_CODE_RE.test(event['code']);
  }
  if (typeof event['requestId'] !== 'string' || !REQUEST_ID_RE.test(event['requestId'])) return false;
  if (type === 'audio-bank-error') {
    return typeof event['code'] === 'string' && ERROR_CODE_RE.test(event['code']);
  }
  if (type === 'audio-bank-progress') {
    return isFiniteNumber(event['loadedAssets'], 0, 1_000)
      && isFiniteNumber(event['totalAssets'], 1, 1_000)
      && event['loadedAssets'] <= event['totalAssets']
      && isFiniteNumber(event['loadedBytes'], 0, 1_000_000_000)
      && isFiniteNumber(event['totalBytes'], 0, 1_000_000_000)
      && event['loadedBytes'] <= event['totalBytes'];
  }
  if (type === 'audio-bank-ready') {
    return typeof event['bankId'] === 'string'
      && SHA256_RE.test(event['bankId'])
      && isFiniteNumber(event['cachedAssets'], 0, 1_000)
      && isFiniteNumber(event['totalAssets'], 1, 1_000)
      && event['cachedAssets'] <= event['totalAssets']
      && isFiniteNumber(event['totalBytes'], 0, 1_000_000_000);
  }
  return false;
}
