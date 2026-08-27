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
  const type = (value as Record<string, unknown>)['type'];
  return typeof type === 'string' && type.startsWith('audio-') && type !== 'audio-ready' && type !== 'audio-error';
}

/** Type guard for audio events received by the host. */
export function isAudioEvent(value: unknown): value is AudioEvent {
  if (!value || typeof value !== 'object') return false;
  const type = (value as Record<string, unknown>)['type'];
  return type === 'audio-ready' || type === 'audio-error';
}
