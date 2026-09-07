import { t } from '../i18n/index.ts';
import { getCanonicalMapAudioUrl } from '../core/map-format.ts';
import type { AudioCommand } from './audio-protocol.ts';
import { isAudioCommand } from './audio-protocol.ts';
import { preparePhoneAudioBank, type PreparedPhoneAudioBank } from './phone-audio-bank.ts';

/**
 * Phone-side remote audio player.
 *
 * Listens for audio commands relayed through the tracking WebSocket channel
 * and plays map audio locally on the phone. Requires a user tap to satisfy
 * mobile autoplay policies.
 */
export function initPhoneAudio(
  onReady: () => void,
  onError: (code: string) => void,
  onBankEvent: (event: Record<string, unknown>) => void = () => {},
): {
  handleCommand(raw: unknown): void;
  setLatencyMs(ms: number): void;
  enableAudio(): Promise<boolean>;
} {
  let audioEl: HTMLAudioElement | null = null;
  let latencyMs = 0;
  let loaded = false;
  let userEnabled = false;
  let prepareVersion = 0;
  let prepareController: AbortController | null = null;
  let musicObjectUrl = '';
  let preparedBank: PreparedPhoneAudioBank | null = null;
  let bankRequestId = '';

  function reportBankReady(): void {
    if (!userEnabled || !loaded || !preparedBank || !bankRequestId) return;
    onBankEvent({
      v: 1,
      type: 'audio-bank-ready',
      requestId: bankRequestId,
      bankId: preparedBank.manifest.bankId,
      cachedAssets: preparedBank.cachedAssets,
      totalAssets: preparedBank.manifest.assets.length,
      totalBytes: preparedBank.manifest.totalBytes,
    });
  }

  function loadAudioSource(source: string, version: number, bankMode: boolean): void {
    const el = ensureAudioElement();
    loaded = false;
    el.addEventListener('canplay', () => {
      if (version !== prepareVersion || audioEl !== el) return;
      loaded = true;
      if (bankMode) reportBankReady();
      else if (userEnabled) onReady();
    }, { once: true });
    el.addEventListener('error', () => {
      if (version !== prepareVersion || audioEl !== el) return;
      onError('LOAD_FAILED');
    }, { once: true });
    el.src = source;
    el.load();
  }

  async function prepareBank(command: Extract<AudioCommand, { type: 'audio-bank-prepare' }>): Promise<void> {
    const version = ++prepareVersion;
    prepareController?.abort();
    prepareController = new AbortController();
    preparedBank = null;
    bankRequestId = command.requestId;
    loaded = false;
    setLatencyMs(command.latencyMs);
    try {
      const bank = await preparePhoneAudioBank(command.mapId, prepareController.signal, progress => {
        if (version !== prepareVersion) return;
        onBankEvent({ v: 1, type: 'audio-bank-progress', requestId: command.requestId, ...progress });
      });
      if (version !== prepareVersion) {
        URL.revokeObjectURL(bank.musicObjectUrl);
        return;
      }
      if (musicObjectUrl) URL.revokeObjectURL(musicObjectUrl);
      musicObjectUrl = bank.musicObjectUrl;
      preparedBank = bank;
      loadAudioSource(musicObjectUrl, version, true);
    } catch (error) {
      if (version !== prepareVersion || (error instanceof DOMException && error.name === 'AbortError')) return;
      const code = error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message)
        ? error.message
        : 'BANK_PREPARE_FAILED';
      onBankEvent({ v: 1, type: 'audio-bank-error', requestId: command.requestId, code });
      onError(code);
    }
  }

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

    if (cmd.type === 'audio-bank-prepare') {
      void prepareBank(cmd);
      return;
    }

    if (cmd.type === 'audio-prepare') {
      const version = ++prepareVersion;
      prepareController?.abort();
      preparedBank = null;
      bankRequestId = '';
      if (musicObjectUrl) {
        URL.revokeObjectURL(musicObjectUrl);
        musicObjectUrl = '';
      }
      const audioUrl = getCanonicalMapAudioUrl(cmd.mapId);
      if (!audioUrl) {
        loaded = false;
        onError('INVALID_AUDIO_URL');
        return;
      }
      loadAudioSource(audioUrl, version, false);
      // Apply latency compensation from host settings
      if (typeof cmd.latencyMs === 'number') setLatencyMs(cmd.latencyMs);
      return;
    }

    if (!loaded || !userEnabled || !audioEl) return;

    switch (cmd.type) {
      case 'audio-play': {
        const el = audioEl;
        const elapsedMs = Date.now() - cmd.serverTime;
        const networkDelaySec = elapsedMs >= 0 && elapsedMs <= 5_000
          ? elapsedMs / 1000 * cmd.playbackRate
          : 0;
        const targetTime = cmd.offsetSec + latencyMs / 1000 + networkDelaySec;
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

  async function enableAudio(): Promise<boolean> {
    const el = ensureAudioElement();
    if (!loaded || !el.currentSrc) return false;
    const muted = el.muted;
    try {
      el.muted = true;
      await el.play();
      el.pause();
      userEnabled = true;
      if (preparedBank) reportBankReady();
      else onReady();
      return true;
    } catch {
      userEnabled = false;
      onError('ENABLE_FAILED');
      return false;
    } finally {
      el.muted = muted;
    }
  }

  return { handleCommand, setLatencyMs, enableAudio };
}

/** UI helper: adds an "Enable audio" button to the phone page. */
export function setupPhoneAudioUI(
  onEnable: () => Promise<boolean>,
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

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const enabled = await onEnable();
    btn.disabled = enabled;
    if (enabled) btn.textContent = t('remoteTracking.phoneAudioEnabled');
  });

  section.append(title, desc, btn);
  container.append(section);
}
