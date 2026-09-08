import { getSettings } from '../core/settings.ts';
import type { AudioCommand, AudioEvent } from './audio-protocol.ts';
import type { ProceduralAudioRecipe } from './audio-bank-manifest.ts';
import { supportsPhoneAudio, type PhoneCapabilitiesEvent } from './phone-capabilities.ts';

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
let clockSyncTimer: ReturnType<typeof setTimeout> | null = null;
const clockSamples: Array<{ offsetMs: number; rttMs: number }> = [];
let clockRequestCounter = 0;
let soundSequence = 0;
let playbackSyncSequence = 0;
let phoneAudioSupported: boolean | null = null;
const pendingSoundFallbacks = new Map<number, { timer: ReturnType<typeof setTimeout>; play: () => void }>();
const SOUND_ACK_TIMEOUT_MS = 30;
const BANK_INACTIVITY_TIMEOUT_MS = 45_000;

function clearBankInactivityTimer(): void {
  if (bankInactivityTimer) clearTimeout(bankInactivityTimer);
  bankInactivityTimer = null;
}

function clearClockSync(): void {
  if (clockSyncTimer) clearTimeout(clockSyncTimer);
  clockSyncTimer = null;
  clockSamples.length = 0;
}

function clearSoundFallbacks(play = false): void {
  for (const pending of pendingSoundFallbacks.values()) {
    clearTimeout(pending.timer);
    if (play) pending.play();
  }
  pendingSoundFallbacks.clear();
}

function sendClockProbe(remaining = 5): void {
  if (remaining <= 0 || !phoneAudioReady) return;
  const hostSentAt = Date.now();
  sendAudioCommand({
    v: 1,
    type: 'audio-clock-ping',
    requestId: `clock-${(++clockRequestCounter).toString(36)}`,
    hostSentAt,
  });
  clockSyncTimer = setTimeout(() => sendClockProbe(remaining - 1), 250);
}

function recordClockPong(event: Extract<AudioEvent, { type: 'audio-clock-pong' }>): void {
  const hostReceivedAt = Date.now();
  const rttMs = (hostReceivedAt - event.hostSentAt) - (event.phoneSentAt - event.phoneReceivedAt);
  if (rttMs < 0 || rttMs > 5_000) return;
  const offsetMs = ((event.phoneReceivedAt - event.hostSentAt) + (event.phoneSentAt - hostReceivedAt)) / 2;
  clockSamples.push({ offsetMs, rttMs });
  clockSamples.sort((left, right) => left.rttMs - right.rttMs);
  if (clockSamples.length > 8) clockSamples.length = 8;
  const best = clockSamples.slice(0, 3).map(sample => sample.offsetMs).sort((a, b) => a - b);
  const stableOffsetMs = best[Math.floor(best.length / 2)] ?? 0;
  sendAudioCommand({ v: 1, type: 'audio-clock-update', offsetMs: stableOffsetMs });
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-clock', {
    detail: { offsetMs: stableOffsetMs, rttMs, samples: clockSamples.length },
  }));
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
    phoneAudioSupported = null;
    phoneAudioReady = false;
    activeBankRequestId = '';
    clearBankInactivityTimer();
    clearClockSync();
    clearSoundFallbacks(true);
    restorePcAudio();
  }
}

/** Apply the phone's validated feature report before attempting preload. */
export function setPhoneAudioCapabilities(capabilities: PhoneCapabilitiesEvent | null): void {
  phoneAudioSupported = capabilities ? supportsPhoneAudio(capabilities) : null;
  if (phoneAudioSupported !== false) return;
  if (activeBankRequestId) failActiveBank('AUDIO_NOT_SUPPORTED');
  else onPhoneAudioError();
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-error', {
    detail: { v: 1, type: 'audio-error', code: 'AUDIO_NOT_SUPPORTED' },
  }));
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
  clearClockSync();
  sendClockProbe();
  if (getSettings().phoneAudioOutput) {
    syncPhoneAudioVolume();
    mutePcAudio();
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-ready'));
  }
}

/** Called when phone audio has an error or disconnects — restore PC audio. */
export function onPhoneAudioError(): void {
  phoneAudioReady = false;
  clearClockSync();
  clearSoundFallbacks(true);
  restorePcAudio();
}

/** Apply validated preload status from the currently paired phone. */
export function onPhoneAudioEvent(event: AudioEvent): void {
  if (event.type === 'audio-sync-status') {
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-sync-status', { detail: event }));
    return;
  }
  if (event.type === 'audio-resync-request') {
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-resync', { detail: event }));
    return;
  }
  if (event.type === 'audio-meter') {
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-meter', { detail: event }));
    return;
  }
  if (event.type === 'audio-clock-pong') {
    recordClockPong(event);
    return;
  }
  if (event.type === 'audio-ready') {
    if (!activeBankRequestId) onPhoneAudioReady();
    return;
  }
  if (event.type === 'audio-error') {
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-error', { detail: event }));
    if (activeBankRequestId) failActiveBank(event.code);
    else onPhoneAudioError();
    return;
  }
  if (event.type === 'audio-sfx-ack') {
    const pending = pendingSoundFallbacks.get(event.sequence);
    if (pending) {
      clearTimeout(pending.timer);
      pendingSoundFallbacks.delete(event.sequence);
      if (event.status === 'unavailable') pending.play();
    }
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-sfx-ack', { detail: event }));
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

/** Schedule a procedural effect only after the phone clock has stable samples. */
export function playPhoneSound(
  recipe: ProceduralAudioRecipe,
  variant = 0,
  volume = 1,
  leadMs = 20,
  fallback?: () => void,
): boolean {
  if (!isPhoneAudioActive() || clockSamples.length < 3) return false;
  soundSequence = soundSequence >= Number.MAX_SAFE_INTEGER ? 1 : soundSequence + 1;
  const sequence = soundSequence;
  const sent = sendAudioCommand({
    v: 1,
    type: 'audio-sfx',
    sequence,
    recipe,
    variant: Math.max(0, Math.min(1_000, variant)),
    volume: Math.max(0, Math.min(1, volume)),
    hostTime: Date.now() + Math.max(0, Math.min(250, leadMs)),
  });
  if (sent && fallback) {
    const timer = setTimeout(() => {
      const pending = pendingSoundFallbacks.get(sequence);
      if (!pending) return;
      pendingSoundFallbacks.delete(sequence);
      pending.play();
    }, SOUND_ACK_TIMEOUT_MS);
    pendingSoundFallbacks.set(sequence, { timer, play: fallback });
  }
  return sent;
}

/** Prepare phone for audio playback using the map's canonical server endpoint. */
export function preparePhoneAudio(mapId: string): boolean {
  if (phoneAudioSupported === false) {
    window.dispatchEvent(new CustomEvent('hand-sabers:phone-audio-error', {
      detail: { v: 1, type: 'audio-error', code: 'AUDIO_NOT_SUPPORTED' },
    }));
    restorePcAudio();
    return false;
  }
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

/** Send a periodic timeline snapshot once the host/phone clock estimate is stable. */
export function syncPhoneAudioPlayback(offsetSec: number, serverTime: number, playbackRate = 1): boolean {
  if (!isPhoneAudioActive() || clockSamples.length < 3) return false;
  playbackSyncSequence = playbackSyncSequence >= Number.MAX_SAFE_INTEGER ? 1 : playbackSyncSequence + 1;
  return sendAudioCommand({
    v: 1,
    type: 'audio-sync',
    sequence: playbackSyncSequence,
    offsetSec: Math.max(0, Math.min(86_400, offsetSec)),
    serverTime: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, serverTime)),
    playbackRate: Math.max(0.5, Math.min(1.5, playbackRate)),
  });
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
