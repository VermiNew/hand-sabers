/** Shared types for host→phone audio remote playback. */

export interface AudioPrepareCommand {
  v: 1;
  type: 'audio-prepare';
  mapId: string;
  latencyMs: number;
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

export type AudioEvent = AudioReadyEvent | AudioErrorEvent;

/** Type guard for audio commands received by the phone. */
export function isAudioCommand(value: unknown): value is AudioCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  if (command['v'] !== 1) return false;
  const type = command['type'];
  if (type === 'audio-prepare') {
    return typeof command['mapId'] === 'string'
      && /^[a-z0-9][a-z0-9_-]{0,119}$/i.test(command['mapId'])
      && isFiniteNumber(command['latencyMs'], 0, 1_000);
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
  const type = (value as Record<string, unknown>)['type'];
  return type === 'audio-ready' || type === 'audio-error';
}
