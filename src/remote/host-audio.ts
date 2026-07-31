import { getSettings } from '../core/settings.ts';
import type { AudioCommand } from './audio-protocol.ts';

/**
 * Host-side remote audio controller.
 *
 * Sends audio commands to the phone through the tracking WebSocket channel
 * and mutes PC audio when the phone confirms it's ready.
 */

let hostSocket: WebSocket | null = null;
let phoneAudioReady = false;
let pcMusicMuted = false;
let originalMusicVolume = 1;

/** Set the host tracking socket so we can send commands to the phone. */
export function setHostAudioSocket(socket: WebSocket | null): void {
  hostSocket = socket;
  if (!socket) {
    // Phone disconnected — restore PC audio
    phoneAudioReady = false;
    restorePcAudio();
  }
}

/** Whether phone audio output is enabled in settings AND phone is ready. */
export function isPhoneAudioActive(): boolean {
  return getSettings().phoneAudioOutput && phoneAudioReady;
}

/** Send an audio command to the phone via the tracking channel. */
export function sendAudioCommand(cmd: AudioCommand): boolean {
  if (!hostSocket || hostSocket.readyState !== WebSocket.OPEN) return false;
  try {
    hostSocket.send(JSON.stringify(cmd));
    return true;
  } catch {
    return false;
  }
}

/** Called when the phone confirms audio is ready — mute PC music. */
export function onPhoneAudioReady(): void {
  phoneAudioReady = true;
  if (getSettings().phoneAudioOutput) {
    mutePcAudio();
  }
}

/** Called when phone audio has an error or disconnects — restore PC audio. */
export function onPhoneAudioError(): void {
  phoneAudioReady = false;
  restorePcAudio();
}

/** Prepare phone for audio playback with a map's audio URL. */
export function preparePhoneAudio(audioUrl: string, mapId: string): boolean {
  const latencyMs = getSettings().phoneAudioLatencyMs ?? 0;
  return sendAudioCommand({ v: 1, type: 'audio-prepare', audioUrl, mapId, latencyMs });
}

/** Tell phone to start playing at a given offset. */
export function playPhoneAudio(offsetSec: number, serverTime: number, playbackRate = 1): boolean {
  return sendAudioCommand({ v: 1, type: 'audio-play', offsetSec, serverTime, playbackRate });
}

/** Tell phone to pause audio. */
export function pausePhoneAudio(): boolean {
  return sendAudioCommand({ v: 1, type: 'audio-pause' });
}

/** Tell phone to stop audio. */
export function stopPhoneAudio(): boolean {
  return sendAudioCommand({ v: 1, type: 'audio-stop' });
}

/** Tell phone to seek to a position. */
export function seekPhoneAudio(offsetSec: number): boolean {
  return sendAudioCommand({ v: 1, type: 'audio-seek', offsetSec });
}

/** Tell phone to set volume. */
export function setPhoneAudioVolume(volume: number): boolean {
  return sendAudioCommand({ v: 1, type: 'audio-volume', volume });
}

/** Mute PC music by setting music volume to 0 (saves original for restore). */
function mutePcAudio(): void {
  if (pcMusicMuted) return;
  const settings = getSettings();
  originalMusicVolume = settings.musicVolume;
  pcMusicMuted = true;
  // Dispatch event for the audio module to pick up
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-mute', {
    detail: { originalVolume: originalMusicVolume },
  }));
}

/** Restore PC music volume after phone audio ends or disconnects. */
function restorePcAudio(): void {
  if (!pcMusicMuted) return;
  pcMusicMuted = false;
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-restore', {
    detail: { volume: originalMusicVolume },
  }));
}
