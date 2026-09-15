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

export interface AudioSyncCommand {
  v: 1;
  type: 'audio-sync';
  sequence: number;
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

export interface AudioClockPingCommand {
  v: 1;
  type: 'audio-clock-ping';
  requestId: string;
  hostSentAt: number;
}

export interface AudioClockUpdateCommand {
  v: 1;
  type: 'audio-clock-update';
  offsetMs: number;
}

export interface AudioSfxCommand {
  v: 1;
  type: 'audio-sfx';
  sequence: number;
  recipe: string;
  variant: number;
  volume: number;
  hostTime: number;
}

export type AudioCommand =
  | AudioPrepareCommand
  | AudioBankPrepareCommand
  | AudioPlayCommand
  | AudioSyncCommand
  | AudioPauseCommand
  | AudioStopCommand
  | AudioVolumeCommand
  | AudioSeekCommand
  | AudioClockPingCommand
  | AudioClockUpdateCommand
  | AudioSfxCommand;

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

export interface AudioClockPongEvent {
  v: 1;
  type: 'audio-clock-pong';
  requestId: string;
  hostSentAt: number;
  phoneReceivedAt: number;
  phoneSentAt: number;
}

export interface AudioSfxAckEvent {
  v: 1;
  type: 'audio-sfx-ack';
  sequence: number;
  status: 'scheduled' | 'late' | 'duplicate' | 'unavailable';
  latenessMs: number;
}

export interface AudioMeterEvent {
  v: 1;
  type: 'audio-meter';
  db: number;
  peak: number;
  clipping: boolean;
  sampledAt: number;
}

export interface AudioResyncRequestEvent {
  v: 1;
  type: 'audio-resync-request';
  reason: 'visibility' | 'page-show' | 'device-change';
}

export interface AudioSyncStatusEvent {
  v: 1;
  type: 'audio-sync-status';
  sequence: number;
  driftMs: number;
  correction: 'none' | 'rate' | 'seek' | 'resume';
}

export type AudioEvent =
  | AudioReadyEvent
  | AudioErrorEvent
  | AudioBankProgressEvent
  | AudioBankReadyEvent
  | AudioBankErrorEvent
  | AudioClockPongEvent
  | AudioSfxAckEvent
  | AudioMeterEvent
  | AudioResyncRequestEvent
  | AudioSyncStatusEvent;

const MAP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/i;
const REQUEST_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ERROR_CODE_RE = /^[A-Z0-9_]{1,64}$/;
const AUDIO_RECIPE_SET = new Set([
  'interface-hover', 'interface-activate', 'interface-back', 'typing-tick', 'chat-message',
  'beat', 'hit', 'combo', 'miss', 'bomb', 'milestone',
]);

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
  if (type === 'audio-play' || type === 'audio-sync') {
    const syncFieldsValid = type !== 'audio-sync'
      || (Number.isSafeInteger(command['sequence'])
        && isFiniteNumber(command['sequence'], 1, Number.MAX_SAFE_INTEGER));
    return syncFieldsValid
      && isFiniteNumber(command['offsetSec'], 0, 86_400)
      && isFiniteNumber(command['serverTime'], 0, Number.MAX_SAFE_INTEGER)
      && isFiniteNumber(command['playbackRate'], 0.5, 1.5);
  }
  if (type === 'audio-seek') return isFiniteNumber(command['offsetSec'], 0, 86_400);
  if (type === 'audio-volume') return isFiniteNumber(command['volume'], 0, 1);
  if (type === 'audio-clock-ping') {
    return typeof command['requestId'] === 'string'
      && REQUEST_ID_RE.test(command['requestId'])
      && isFiniteNumber(command['hostSentAt'], 0, Number.MAX_SAFE_INTEGER);
  }
  if (type === 'audio-clock-update') return isFiniteNumber(command['offsetMs'], -86_400_000, 86_400_000);
  if (type === 'audio-sfx') {
    return Number.isSafeInteger(command['sequence'])
      && isFiniteNumber(command['sequence'], 1, Number.MAX_SAFE_INTEGER)
      && typeof command['recipe'] === 'string' && AUDIO_RECIPE_SET.has(command['recipe'])
      && isFiniteNumber(command['variant'], 0, 1_000)
      && isFiniteNumber(command['volume'], 0, 1)
      && isFiniteNumber(command['hostTime'], 0, Number.MAX_SAFE_INTEGER);
  }
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
  if (type === 'audio-sfx-ack') {
    return Number.isSafeInteger(event['sequence'])
      && isFiniteNumber(event['sequence'], 1, Number.MAX_SAFE_INTEGER)
      && ['scheduled', 'late', 'duplicate', 'unavailable'].includes(String(event['status']))
      && isFiniteNumber(event['latenessMs'], 0, 60_000);
  }
  if (type === 'audio-meter') {
    return isFiniteNumber(event['db'], -60, 0)
      && isFiniteNumber(event['peak'], 0, 4)
      && typeof event['clipping'] === 'boolean'
      && isFiniteNumber(event['sampledAt'], 0, Number.MAX_SAFE_INTEGER);
  }
  if (type === 'audio-resync-request') {
    return ['visibility', 'page-show', 'device-change'].includes(String(event['reason']));
  }
  if (type === 'audio-sync-status') {
    return Number.isSafeInteger(event['sequence'])
      && isFiniteNumber(event['sequence'], 1, Number.MAX_SAFE_INTEGER)
      && isFiniteNumber(event['driftMs'], -60_000, 60_000)
      && ['none', 'rate', 'seek', 'resume'].includes(String(event['correction']));
  }
  if (typeof event['requestId'] !== 'string' || !REQUEST_ID_RE.test(event['requestId'])) return false;
  if (type === 'audio-bank-error') {
    return typeof event['code'] === 'string' && ERROR_CODE_RE.test(event['code']);
  }
  if (type === 'audio-clock-pong') {
    return isFiniteNumber(event['hostSentAt'], 0, Number.MAX_SAFE_INTEGER)
      && isFiniteNumber(event['phoneReceivedAt'], 0, Number.MAX_SAFE_INTEGER)
      && isFiniteNumber(event['phoneSentAt'], 0, Number.MAX_SAFE_INTEGER)
      && event['phoneSentAt'] >= event['phoneReceivedAt'];
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
