import { loadLocalMapAudio } from '../core/localstore.ts';
import { loadSettings, setSetting } from '../core/settings.ts';

const PREVIEW_DELAY_MS = 850;
const PREVIEW_MAX_MS = 30_000;
const PREVIEW_BASE_VOLUME = 0.34;
const PREVIEW_FADE_IN_MS = 420;
const PREVIEW_FADE_OUT_MS = 360;

type PreviewStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'warning' | 'error';

export interface MapPreviewEntry {
  id: string;
  source: 'server' | 'local' | 'autosave' | 'server+local';
  meta?: {
    audioUrl?: string;
    previewStartSec?: number;
  };
}

interface MapPreviewOptions {
  reportError(context: string, error: unknown): void;
}

export interface MapPreviewController {
  bindControls(): void;
  getMusicPercent(): number;
  schedule(map: MapPreviewEntry): void;
  stop(clearStatus?: boolean): void;
  toggle(): void;
}

export function createMapPreviewController({ reportError }: MapPreviewOptions): MapPreviewController {
  const audio = new Audio();
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let progressFrame: number | null = null;
  let fadeFrame: number | null = null;
  let objectUrl: string | null = null;
  let token = 0;
  let remainingMs = PREVIEW_MAX_MS;
  let startedAtMs = 0;
  let paused = false;
  let currentMap: MapPreviewEntry | null = null;

  function updateToggle(status: PreviewStatus): void {
    const button = document.getElementById('previewToggle') as HTMLButtonElement | null;
    if (!button) return;
    const icon = button.querySelector<HTMLElement>('.material-symbols-rounded');
    const label = button.querySelector<HTMLElement>('span:last-child');
    button.className = `preview-toggle is-${status}`;
    button.disabled = status === 'loading';
    if (status === 'playing') {
      if (icon) icon.textContent = 'pause';
      if (label) label.textContent = 'Pause';
    } else if (status === 'paused') {
      if (icon) icon.textContent = 'play_arrow';
      if (label) label.textContent = 'Resume';
    } else {
      if (icon) icon.textContent = 'play_arrow';
      if (label) label.textContent = 'Preview';
    }
  }

  function setStatus(message: string, status: PreviewStatus = 'idle'): void {
    const element = document.getElementById('previewStatus');
    if (element) {
      element.className = `preview-status is-${status}`;
      const icon = element.querySelector<HTMLElement>('.material-symbols-rounded');
      if (icon) icon.textContent = status === 'warning' || status === 'error' ? 'warning' : 'graphic_eq';
      const text = element.querySelector<HTMLElement>('span:last-child');
      if (text) text.textContent = message;
    }
    updateToggle(status);
  }

  function clearTimers(): void {
    if (delayTimer) clearTimeout(delayTimer);
    if (stopTimer) clearTimeout(stopTimer);
    if (progressFrame !== null) cancelAnimationFrame(progressFrame);
    if (fadeFrame !== null) cancelAnimationFrame(fadeFrame);
    delayTimer = null;
    stopTimer = null;
    progressFrame = null;
    fadeFrame = null;
  }

  function unloadAudio(): void {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function fadeVolume(fromVolume: number, toVolume: number, durationMs: number, fadeToken: number, onDone?: () => void): void {
    if (fadeFrame !== null) cancelAnimationFrame(fadeFrame);
    fadeFrame = null;
    const from = Math.max(0, Math.min(1, fromVolume));
    const to = Math.max(0, Math.min(1, toVolume));
    const fadeStartedAt = performance.now();
    audio.volume = from;

    const step = (now: number): void => {
      try {
        if (fadeToken !== token) {
          fadeFrame = null;
          return;
        }
        const progress = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - fadeStartedAt) / durationMs));
        const eased = progress * progress * (3 - 2 * progress);
        audio.volume = from + (to - from) * eased;
        if (progress < 1) {
          fadeFrame = requestAnimationFrame(step);
          return;
        }
        fadeFrame = null;
        onDone?.();
      } catch (error) {
        fadeFrame = null;
        reportError('preview-fade', error);
      }
    };
    fadeFrame = requestAnimationFrame(step);
  }

  function setProgress(progress: number, timeRemainingMs = PREVIEW_MAX_MS): void {
    const clamped = Math.max(0, Math.min(1, progress));
    const fill = document.getElementById('previewProgressFill');
    const time = document.getElementById('previewProgressTime');
    if (fill) fill.style.width = `${Math.round(clamped * 100)}%`;
    if (time) time.textContent = `${Math.max(0, Math.ceil(timeRemainingMs / 1000))}s`;
  }

  function updateProgress(): void {
    try {
      const elapsedMs = PREVIEW_MAX_MS - remainingMs + (performance.now() - startedAtMs);
      const timeRemainingMs = Math.max(0, PREVIEW_MAX_MS - elapsedMs);
      setProgress(elapsedMs / PREVIEW_MAX_MS, timeRemainingMs);
      progressFrame = !audio.paused && timeRemainingMs > 0
        ? requestAnimationFrame(updateProgress)
        : null;
    } catch (error) {
      progressFrame = null;
      reportError('preview-progress', error);
    }
  }

  function getVolume(): number {
    const settings = loadSettings();
    const master = Math.max(0, Math.min(1, Number(settings.volume) || 0));
    const music = Math.max(0, Math.min(1, Number(settings.musicVolume) || 0));
    return Math.max(0, Math.min(1, master * music * PREVIEW_BASE_VOLUME));
  }

  function getMusicPercent(): number {
    const settings = loadSettings();
    return Math.round(Math.max(0, Math.min(1, Number(settings.musicVolume) || 0)) * 100);
  }

  function stop(clearStatus = false): void {
    const shouldFadeOut = Boolean(audio.src) && !audio.paused && audio.volume > 0;
    const sourceToStop = audio.src;
    clearTimers();
    const stopToken = ++token;
    remainingMs = PREVIEW_MAX_MS;
    startedAtMs = 0;
    paused = false;
    setProgress(0);
    if (clearStatus) setStatus('Preview zatrzymane');
    if (!shouldFadeOut) {
      unloadAudio();
      return;
    }
    fadeVolume(audio.volume, 0, PREVIEW_FADE_OUT_MS, stopToken, () => {
      if (stopToken === token && audio.src === sourceToStop) unloadAudio();
    });
  }

  function armStopTimer(ms: number): void {
    if (stopTimer) clearTimeout(stopTimer);
    if (progressFrame !== null) cancelAnimationFrame(progressFrame);
    progressFrame = null;
    const fadeMs = Math.min(PREVIEW_FADE_OUT_MS, Math.max(0, ms));
    const stopDelayMs = Math.max(0, ms - fadeMs);
    const stopToken = token;
    const sourceToStop = audio.src;
    startedAtMs = performance.now();
    stopTimer = setTimeout(() => {
      stopTimer = null;
      fadeVolume(audio.volume, 0, fadeMs, stopToken, () => {
        if (stopToken !== token || audio.src !== sourceToStop) return;
        if (progressFrame !== null) cancelAnimationFrame(progressFrame);
        progressFrame = null;
        unloadAudio();
        paused = false;
        remainingMs = PREVIEW_MAX_MS;
        setProgress(1, 0);
        setStatus('Preview zakończone');
      });
    }, stopDelayMs);
    updateProgress();
  }

  function pause(): void {
    if (audio.paused) return;
    if (stopTimer) clearTimeout(stopTimer);
    if (progressFrame !== null) cancelAnimationFrame(progressFrame);
    stopTimer = null;
    progressFrame = null;
    const pauseToken = token;
    remainingMs = Math.max(0, remainingMs - (performance.now() - startedAtMs));
    paused = true;
    setProgress((PREVIEW_MAX_MS - remainingMs) / PREVIEW_MAX_MS, remainingMs);
    setStatus('Preview w pauzie. Kliknij, aby wznowić.', 'paused');
    fadeVolume(audio.volume, 0, PREVIEW_FADE_OUT_MS, pauseToken, () => {
      if (pauseToken === token && paused) audio.pause();
    });
  }

  async function resume(): Promise<void> {
    const effectiveVolume = getVolume();
    if (effectiveVolume <= 0) {
      setStatus('Preview wyciszone. Zmień głośność lub muzykę w ustawieniach.', 'warning');
      return;
    }
    const resumeToken = token;
    const startVolume = Math.max(0, Math.min(1, audio.volume));
    await audio.play();
    paused = false;
    armStopTimer(remainingMs || PREVIEW_MAX_MS);
    fadeVolume(startVolume, effectiveVolume, PREVIEW_FADE_IN_MS, resumeToken);
    setStatus('Odtwarzam preview', 'playing');
  }

  function waitForMetadata(): Promise<void> {
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('error', onError);
      };
      const onReady = (): void => { cleanup(); resolve(); };
      const onError = (): void => { cleanup(); reject(new Error('Preview audio load failed')); };
      audio.addEventListener('loadedmetadata', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
    });
  }

  async function loadSource(map: MapPreviewEntry): Promise<{ url: string } | null> {
    if (map.source === 'server' || map.source === 'server+local') {
      const audioUrl = map.meta?.audioUrl ?? `/api/maps/${encodeURIComponent(map.id)}/audio`;
      try {
        const response = await fetch(audioUrl);
        if (response.ok) return { url: URL.createObjectURL(await response.blob()) };
      } catch {}
    }
    const local = await loadLocalMapAudio(map.id).catch(() => null);
    if (!local?.arrayBuffer) return null;
    const blob = new Blob([local.arrayBuffer], { type: local.mimeType || 'application/octet-stream' });
    return { url: URL.createObjectURL(blob) };
  }

  async function start(map: MapPreviewEntry, startToken: number): Promise<void> {
    try {
      const effectiveVolume = getVolume();
      if (effectiveVolume <= 0) {
        setStatus('Preview wyciszone. Zmień głośność lub muzykę w ustawieniach.', 'warning');
        return;
      }
      setStatus('Ładuję audio preview...', 'loading');
      const source = await loadSource(map);
      if (startToken !== token) {
        if (source?.url) URL.revokeObjectURL(source.url);
        return;
      }
      if (!source) {
        setStatus('Ta mapa nie ma audio do preview', 'error');
        return;
      }
      if (fadeFrame !== null) cancelAnimationFrame(fadeFrame);
      fadeFrame = null;
      unloadAudio();
      objectUrl = source.url;
      audio.volume = 0;
      audio.src = source.url;
      await waitForMetadata();
      const requestedStart = Number(map.meta?.previewStartSec ?? 0);
      const maxStart = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 2) : 0;
      audio.currentTime = Math.max(0, Math.min(Number.isFinite(requestedStart) ? requestedStart : 0, maxStart));
      await audio.play();
      paused = false;
      remainingMs = PREVIEW_MAX_MS;
      armStopTimer(remainingMs);
      fadeVolume(0, effectiveVolume, PREVIEW_FADE_IN_MS, startToken);
      setStatus('Odtwarzam preview', 'playing');
    } catch (error) {
      if (startToken !== token) return;
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Kliknij mapę ponownie, aby uruchomić preview'
        : 'Nie udało się odtworzyć preview';
      setStatus(message, 'error');
    }
  }

  function schedule(map: MapPreviewEntry): void {
    stop();
    currentMap = map;
    if (getVolume() <= 0) {
      setStatus('Preview wyciszone. Zmień głośność lub muzykę w ustawieniach.', 'warning');
      return;
    }
    const startToken = token;
    setStatus('Preview wystartuje za chwilę...', 'loading');
    delayTimer = setTimeout(() => { void start(map, startToken); }, PREVIEW_DELAY_MS);
  }

  function toggle(): void {
    if (!audio.src && currentMap) {
      schedule(currentMap);
      return;
    }
    if (!audio.src) return;
    if (paused) {
      void resume().catch(() => setStatus('Nie udało się wznowić preview', 'error'));
    } else if (!audio.paused) {
      pause();
    }
  }

  function bindControls(): void {
    const input = document.getElementById('previewVolume') as HTMLInputElement | null;
    const value = document.getElementById('previewVolumeValue');
    if (!input || !value) return;
    const updateVisual = (): void => {
      const numeric = Math.max(0, Math.min(100, Number(input.value) || 0));
      input.style.setProperty('--range-progress', `${numeric}%`);
      value.textContent = `${Math.round(numeric)}%`;
    };
    updateVisual();
    input.addEventListener('input', () => {
      updateVisual();
      setSetting('musicVolume', Math.max(0, Math.min(100, Number(input.value) || 0)) / 100);
      const effectiveVolume = getVolume();
      audio.volume = effectiveVolume;
      if (effectiveVolume <= 0) {
        if (!audio.paused) pause();
        setStatus('Preview wyciszone. Zmień głośność lub muzykę w ustawieniach.', 'warning');
      } else if (paused) {
        setStatus('Preview w pauzie. Kliknij Resume, aby wznowić.', 'paused');
      }
    });
  }

  return { bindControls, getMusicPercent, schedule, stop, toggle };
}
