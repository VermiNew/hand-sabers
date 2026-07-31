import { t } from '../i18n/index.ts';
import type { AudioCommand } from './audio-protocol.ts';
import { isAudioCommand } from './audio-protocol.ts';

/**
 * Phone-side remote audio player.
 *
 * Listens for audio commands relayed through the tracking WebSocket channel
 * and plays map audio locally on the phone. Requires a user tap to satisfy
 * mobile autoplay policies.
 */
export function initPhoneAudio(onReady: () => void, onError: (code: string) => void): {
  handleCommand(raw: unknown): void;
  setLatencyMs(ms: number): void;
} {
  let audioEl: HTMLAudioElement | null = null;
  let latencyMs = 0;
  let enabled = false;

  function ensureAudioElement(): HTMLAudioElement {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = 'auto';
      audioEl.crossOrigin = 'anonymous';
    }
    return audioEl;
  }

  function handleCommand(raw: unknown): void {
    if (!isAudioCommand(raw)) return;
    const cmd = raw as AudioCommand;

    if (cmd.type === 'audio-prepare') {
      const el = ensureAudioElement();
      el.src = cmd.audioUrl;
      el.load();
      // Apply latency compensation from host settings
      if (typeof cmd.latencyMs === 'number') setLatencyMs(cmd.latencyMs);
      // Send ready confirmation back through the tracking channel
      enabled = true;
      onReady();
      return;
    }

    if (!enabled || !audioEl) return;

    switch (cmd.type) {
      case 'audio-play': {
        const el = audioEl;
        const targetTime = cmd.offsetSec + latencyMs / 1000;
        el.currentTime = Math.max(0, targetTime);
        el.playbackRate = Math.max(0.5, Math.min(1.5, cmd.playbackRate || 1));
        void el.play().catch(() => onError('PLAY_FAILED'));
        break;
      }
      case 'audio-pause':
        audioEl.pause();
        break;
      case 'audio-stop':
        audioEl.pause();
        audioEl.currentTime = 0;
        break;
      case 'audio-seek':
        audioEl.currentTime = Math.max(0, cmd.offsetSec + latencyMs / 1000);
        break;
      case 'audio-volume':
        audioEl.volume = Math.max(0, Math.min(1, cmd.volume));
        break;
    }
  }

  function setLatencyMs(ms: number): void {
    latencyMs = Math.max(0, Math.min(1000, ms));
  }

  return { handleCommand, setLatencyMs };
}

/** UI helper: adds an "Enable audio" button to the phone page. */
export function setupPhoneAudioUI(
  onEnable: () => void,
): void {
  const container = document.querySelector('.remote-card');
  if (!container) return;

  const section = document.createElement('div');
  section.className = 'remote-audio-section';
  section.hidden = false;

  const title = document.createElement('strong');
  title.textContent = t('remoteTracking.phoneAudioTitle');

  const desc = document.createElement('p');
  desc.textContent = t('remoteTracking.phoneAudioDesc');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'remote-audio-enable';
  btn.textContent = t('remoteTracking.phoneAudioEnable');

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = t('remoteTracking.phoneAudioEnabled');
    onEnable();
  });

  section.append(title, desc, btn);
  container.append(section);
}
