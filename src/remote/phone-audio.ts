import { t } from '../i18n/index.ts';
import { getCanonicalMapAudioUrl } from '../core/map-format.ts';
import type { AudioCommand } from './audio-protocol.ts';
import { isAudioCommand } from './audio-protocol.ts';
import { preparePhoneAudioBank, type PreparedPhoneAudioBank } from './phone-audio-bank.ts';
import { createPhoneSoundEngine } from './phone-audio-sfx.ts';
import type { ProceduralAudioRecipe } from './audio-bank-manifest.ts';

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
  let hostClockOffsetMs = 0;
  let lastSyncSequence = 0;
  const soundEngine = createPhoneSoundEngine();
  const receivedSoundSequences = new Set<number>();
  const soundSequenceOrder: number[] = [];
  let meterTimer: ReturnType<typeof setInterval> | null = null;

  function requestResync(reason: 'visibility' | 'page-show' | 'device-change'): void {
    if (!userEnabled) return;
    onBankEvent({ v: 1, type: 'audio-resync-request', reason });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestResync('visibility');
  });
  window.addEventListener('pageshow', () => requestResync('page-show'));
  navigator.mediaDevices?.addEventListener('devicechange', () => requestResync('device-change'));

  function startMeterReporting(): void {
    if (meterTimer) return;
    meterTimer = setInterval(() => {
      const levels = soundEngine.getMeterLevels();
      onBankEvent({ v: 1, type: 'audio-meter', ...levels, sampledAt: Date.now() });
    }, 125);
  }

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
    let lastProgressSentAt = -Infinity;
    try {
      const bank = await preparePhoneAudioBank(command.mapId, prepareController.signal, progress => {
        if (version !== prepareVersion) return;
        const now = performance.now();
        const complete = progress.loadedAssets === progress.totalAssets;
        if (!complete && now - lastProgressSentAt < 250) return;
        lastProgressSentAt = now;
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

  function targetPlaybackTime(
    offsetSec: number,
    serverTime: number,
    playbackRate: number,
    maxTransitMs: number,
  ): number {
    const estimatedHostNow = Date.now() - hostClockOffsetMs;
    const elapsedMs = estimatedHostNow - serverTime;
    const transitSec = elapsedMs >= 0 && elapsedMs <= maxTransitMs
      ? elapsedMs / 1000 * playbackRate
      : 0;
    return Math.max(0, offsetSec + latencyMs / 1000 + transitSec);
  }

  function applyPlaybackSync(command: Extract<AudioCommand, { type: 'audio-sync' }>): void {
    if (!audioEl || command.sequence <= lastSyncSequence) return;
    lastSyncSequence = command.sequence;
    const el = audioEl;
    const baseRate = Math.max(0.5, Math.min(1.5, command.playbackRate || 1));
    const targetTime = targetPlaybackTime(command.offsetSec, command.serverTime, baseRate, 60_000);
    const driftSec = targetTime - el.currentTime;
    const driftMs = Math.max(-60_000, Math.min(60_000, driftSec * 1000));
    let correction: 'none' | 'rate' | 'seek' | 'resume' = 'none';

    if (el.paused) {
      el.currentTime = targetTime;
      el.playbackRate = baseRate;
      correction = 'resume';
      void el.play().catch(() => onError('PLAY_FAILED'));
    } else if (Math.abs(driftSec) >= 0.25) {
      el.currentTime = targetTime;
      el.playbackRate = baseRate;
      correction = 'seek';
    } else if (Math.abs(driftSec) >= 0.015) {
      const rateAdjustment = Math.max(-0.025, Math.min(0.025, driftSec * 0.25));
      el.playbackRate = Math.max(0.5, Math.min(1.5, baseRate + rateAdjustment));
      correction = 'rate';
    } else {
      el.playbackRate = baseRate;
    }

    onBankEvent({ v: 1, type: 'audio-sync-status', sequence: command.sequence, driftMs, correction });
  }

  function handleCommand(raw: unknown): void {
    if (!isAudioCommand(raw)) return;
    const cmd = raw as AudioCommand;

    if (cmd.type === 'audio-clock-ping') {
      const phoneReceivedAt = Date.now();
      onBankEvent({
        v: 1,
        type: 'audio-clock-pong',
        requestId: cmd.requestId,
        hostSentAt: cmd.hostSentAt,
        phoneReceivedAt,
        phoneSentAt: Date.now(),
      });
      return;
    }
    if (cmd.type === 'audio-clock-update') {
      hostClockOffsetMs = cmd.offsetMs;
      soundEngine.setHostClockOffset(cmd.offsetMs);
      return;
    }
    if (cmd.type === 'audio-sfx') {
      if (receivedSoundSequences.has(cmd.sequence)) {
        onBankEvent({ v: 1, type: 'audio-sfx-ack', sequence: cmd.sequence, status: 'duplicate', latenessMs: 0 });
        return;
      }
      receivedSoundSequences.add(cmd.sequence);
      soundSequenceOrder.push(cmd.sequence);
      if (soundSequenceOrder.length > 256) receivedSoundSequences.delete(soundSequenceOrder.shift()!);
      const result = soundEngine.schedule({
        recipe: cmd.recipe as ProceduralAudioRecipe,
        variant: cmd.variant,
        volume: cmd.volume,
        hostTime: cmd.hostTime,
      });
      onBankEvent({
        v: 1,
        type: 'audio-sfx-ack',
        sequence: cmd.sequence,
        status: result?.status ?? 'unavailable',
        latenessMs: result?.latenessMs ?? 0,
      });
      return;
    }

    if (cmd.type === 'audio-bank-prepare') {
      lastSyncSequence = 0;
      void prepareBank(cmd);
      return;
    }

    if (cmd.type === 'audio-prepare') {
      lastSyncSequence = 0;
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

    if (cmd.type === 'audio-sync') {
      applyPlaybackSync(cmd);
      return;
    }

    switch (cmd.type) {
      case 'audio-play': {
        const el = audioEl;
        el.currentTime = targetPlaybackTime(cmd.offsetSec, cmd.serverTime, cmd.playbackRate, 5_000);
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
      if (!await soundEngine.enable()) throw new Error('SFX_ENABLE_FAILED');
      soundEngine.attachMediaElement(el);
      startMeterReporting();
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
): {
  setProgress(loadedAssets: number, totalAssets: number, loadedBytes: number, totalBytes: number): void;
  setReady(totalAssets: number): void;
  setError(): void;
} | null {
  const container = document.querySelector('.remote-card');
  if (!container) return null;

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

  const preload = document.createElement('div');
  preload.className = 'remote-audio-preload';
  preload.hidden = true;

  const preloadStatus = document.createElement('div');
  preloadStatus.className = 'remote-audio-preload-status';
  preloadStatus.setAttribute('role', 'status');

  const preloadLabel = document.createElement('span');
  const preloadValue = document.createElement('strong');
  preloadStatus.append(preloadLabel, preloadValue);

  const progress = document.createElement('progress');
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute('aria-label', t('remoteTracking.phoneAudioPreloadAria'));

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const enabled = await onEnable();
    btn.disabled = enabled;
    if (enabled) btn.textContent = t('remoteTracking.phoneAudioEnabled');
  });

  preload.append(preloadStatus, progress);
  section.append(title, desc, preload, btn);
  container.append(section);

  const formatBytes = (bytes: number): string => `${(Math.max(0, bytes) / 1024 / 1024).toFixed(1)} MB`;
  return {
    setProgress(loadedAssets, totalAssets, loadedBytes, totalBytes): void {
      preload.hidden = false;
      preload.dataset['state'] = 'loading';
      preloadLabel.textContent = t('remoteTracking.phoneAudioPreloading');
      preloadValue.textContent = `${loadedAssets}/${totalAssets} · ${formatBytes(loadedBytes)}/${formatBytes(totalBytes)}`;
      progress.max = Math.max(1, totalBytes);
      progress.value = Math.min(progress.max, Math.max(0, loadedBytes));
    },
    setReady(totalAssets): void {
      preload.hidden = false;
      preload.dataset['state'] = 'ready';
      preloadLabel.textContent = t('remoteTracking.phoneAudioVerified');
      preloadValue.textContent = t('remoteTracking.phoneAudioSoundCount').replace('{{count}}', String(totalAssets));
      progress.max = 1;
      progress.value = 1;
    },
    setError(): void {
      preload.hidden = false;
      preload.dataset['state'] = 'error';
      preloadLabel.textContent = t('remoteTracking.phoneAudioPreloadError');
      preloadValue.textContent = t('remoteTracking.phoneAudioPcFallback');
      progress.removeAttribute('value');
    },
  };
}
