import { getSettings } from '../core/settings.ts';
import type { AudioCommand, AudioEvent } from './audio-protocol.ts';

/**
 * Host-side remote audio controller.
 *
 * Sends audio commands to the phone through the tracking WebSocket channel
 * and mutes PC audio when the phone confirms it's ready.
 */

let hostSocket: WebSocket | null = null;
let phoneAudioReady = false;
let pcMusicMuted = false;
let activeBankRequestId = '';
let bankRequestCounter = 0;
let bankInactivityTimer: ReturnType<typeof setTimeout> | null = null;
const BANK_INACTIVITY_TIMEOUT_MS = 45_000;

function clearBankInactivityTimer(): void {
  if (bankInactivityTimer) clearTimeout(bankInactivityTimer);
  bankInactivityTimer = null;
}

function failActiveBank(code: string): void {
  const requestId = activeBankRequestId;
  activeBankRequestId = '';
  clearBankInactivityTimer();
  onPhoneAudioError();
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-bank-error', {
    detail: { requestId, code },
  }));
}

function armBankInactivityTimer(): void {
  clearBankInactivityTimer();
  bankInactivityTimer = setTimeout(() => failActiveBank('PRELOAD_TIMEOUT'), BANK_INACTIVITY_TIMEOUT_MS);
}

/** Set the host tracking socket so we can send commands to the phone. */
export function setHostAudioSocket(socket: WebSocket | null): void {
  hostSocket = socket;
  if (!socket) {
    // Phone disconnected — restore PC audio
    phoneAudioReady = false;
    activeBankRequestId = '';
    clearBankInactivityTimer();
    restorePcAudio();
  }
}

/** Whether phone audio output is enabled in settings AND phone is ready. */
export function isPhoneAudioActive(): boolean {
  return getSettings().phoneAudioOutput && phoneAudioReady;
}

/** Apply an output change immediately, keeping the PC as the reliable fallback. */
export function setPhoneAudioOutputEnabled(enabled: boolean): void {
  if (enabled && phoneAudioReady) {
    mutePcAudio();
    return;
  }
  restorePcAudio();
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
    syncPhoneAudioVolume();
    mutePcAudio();
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-ready'));
  }
}

/** Called when phone audio has an error or disconnects — restore PC audio. */
export function onPhoneAudioError(): void {
  phoneAudioReady = false;
  restorePcAudio();
}

/** Apply validated preload status from the currently paired phone. */
export function onPhoneAudioEvent(event: AudioEvent): void {
  if (event.type === 'audio-ready') {
    if (!activeBankRequestId) onPhoneAudioReady();
    return;
  }
  if (event.type === 'audio-error') {
    if (activeBankRequestId) failActiveBank(event.code);
    else onPhoneAudioError();
    return;
  }
  if (event.requestId !== activeBankRequestId) return;
  if (event.type === 'audio-bank-progress') {
    armBankInactivityTimer();
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-bank-progress', { detail: event }));
    return;
  }
  if (event.type === 'audio-bank-error') {
    failActiveBank(event.code);
    return;
  }
  activeBankRequestId = '';
  clearBankInactivityTimer();
  onPhoneAudioReady();
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-bank-ready', { detail: event }));
}

/** Prepare phone for audio playback using the map's canonical server endpoint. */
export function preparePhoneAudio(mapId: string): boolean {
  const latencyMs = getSettings().phoneAudioLatencyMs ?? 0;
  phoneAudioReady = false;
  restorePcAudio();
  activeBankRequestId = `${Date.now().toString(36)}-${(++bankRequestCounter).toString(36)}`;
  const sent = sendAudioCommand({
    v: 1,
    type: 'audio-bank-prepare',
    mapId,
    latencyMs,
    requestId: activeBankRequestId,
  });
  if (sent) armBankInactivityTimer();
  else activeBankRequestId = '';
  return sent;
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

/** Match phone music loudness to the two gain controls used by PC playback. */
export function syncPhoneAudioVolume(): boolean {
  const settings = getSettings();
  return setPhoneAudioVolume(settings.volume * settings.musicVolume);
}

/** Mute PC music while leaving sound effects on the computer. */
function mutePcAudio(): void {
  if (pcMusicMuted) return;
  pcMusicMuted = true;
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-mute'));
}

/** Restore PC music volume after phone audio ends or disconnects. */
function restorePcAudio(): void {
  if (!pcMusicMuted) return;
  pcMusicMuted = false;
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-restore', {
    detail: { volume: getSettings().musicVolume },
  }));
}
