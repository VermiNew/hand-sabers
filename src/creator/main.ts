import { AUDIO_EXT_RE, assertFileSize, normalizeMap } from '../core/map-format.ts';
import { validateAudioFile } from '../core/audio-validation.ts';
import { sortBeatsByTime } from '../core/creator-rules.ts';
import { getLocalMapById, saveLocalMap } from '../core/localstore.ts';
import { showAlert, showToast } from './dialogs.ts';
import { t } from '../i18n/index.ts';

import { state, MAP_ID } from './state.ts';
import type { CreatorMap } from './state.ts';

import {
  readCreatorSongVolume,
  setCreatorSongVolume,
  initAudioCtx,
  getPlayPos,
  playAudio,
  stopAudio,
  decodeAndAttachAudio,
  restoreAudioForCurrentMap,
} from './audio.ts';

import { drawWaveform, drawWaveformOverlay, bindWaveformHover } from './waveform.ts';

import {
  renderAll,
  requestTimelineRender,
  resizeCanvases,
  getLabelWidth,
  updateZoomLabel,
} from './timeline.ts';

import {
  scheduleAutosave,
  saveMap,
  exportZip,
  loadZipFile,
  loadInitialMap,
} from './storage.ts';

import {
  syncCutButton,
  checkOverlaps,
  setActiveCut,
  bindTimelineEvents,
  handlePlay,
} from './input.ts';

import { initKeybindsUI } from './keybinds-ui.ts';

// ── i18n ──────────────────────────────────────────────────────────
function applyCreatorTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset['i18n'];
    if (key) el.textContent = t(key);
  });
}

// ── Audio callbacks ───────────────────────────────────────────────
const audioCallbacks = {
  onDecoded(): void {
    drawWaveform();
    scheduleAutosave();
    renderAll();
  },
};

// ── Play/Stop toggle button sync ────────────────────────────────
function syncPlayStopBtn(): void {
  const btn   = document.getElementById('btnPlayStop');
  const icon  = document.getElementById('btnPlayStopIcon');
  const label = document.getElementById('btnPlayStopLabel');
  if (!btn) return;
  const playing = state.isPlaying || !!state.precountTimer;
  btn.classList.toggle('is-playing', playing);
  if (icon)  icon.textContent  = playing ? 'stop'       : 'play_arrow';
  if (label) label.textContent = playing ? 'STOP'       : 'PLAY';
}

// ── RAF render loop ───────────────────────────────────────────────
function startRafLoop(): void {
  if (state.rafId) return;
  function tick(): void {
    if (state.isPlaying) {
      state.currentTime = getPlayPos();
      const timelineCanvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
      if (timelineCanvas) {
        const trackW = timelineCanvas.width - getLabelWidth();
        const px     = (state.currentTime - state.viewStart) * state.pxPerSec;
        if (px > trackW * 0.78) state.viewStart = state.currentTime - (trackW * 0.22) / state.pxPerSec;
        if (px < 0)             state.viewStart = state.currentTime;
        state.viewStart = Math.max(0, state.viewStart);
      }

      if (state.currentTime >= state.map.meta.duration && state.map.meta.duration > 0) {
        stopAudio(false);
        state.currentTime = state.map.meta.duration;
      }

      if (state.loopEnabled && state.loopEnd !== null && state.currentTime >= state.loopEnd) {
        playAudio(state.loopStart ?? 0, onPlayEnd);
      }
    }
    if (state.isPlaying || state.timelineDirty) {
      renderAll();
      if (state.isPlaying && state.audioBuffer) {
        const wc = document.getElementById('waveCanvas') as HTMLCanvasElement | null;
        if (wc) drawWaveformOverlay(wc.getContext('2d')!, wc.width, wc.height);
      }
    }
    syncPlayStopBtn();
    state.rafId = requestAnimationFrame(tick);
  }
  state.rafId = requestAnimationFrame(tick);
}

function onPlayEnd(): void {
  stopAudio(false);
  state.currentTime = state.map.meta.duration || state.audioBuffer?.duration || state.currentTime;
  const tlCanvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
  state.viewStart = Math.max(0, state.currentTime - (tlCanvas ? tlCanvas.width / state.pxPerSec * 0.78 : 0));
  requestTimelineRender();
}

// ── File handling ─────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

async function handleFile(file: File): Promise<void> {
  try {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showAlert(t('creator.fileTooBig'), { title: t('creator.fileTooBigTitle') });
      return;
    }
    assertFileSize(file);

    if (file.type.startsWith('audio/') || AUDIO_EXT_RE.test(file.name)) {
      validateAudioFile(file);
      state.map.meta.title = file.name.replace(/\.[^.]+$/, '');
      await decodeAndAttachAudio(
        await file.arrayBuffer(),
        { fileName: file.name, mimeType: file.type || 'application/octet-stream' },
        audioCallbacks,
      );
      showToast(t('creator.audioLoaded'), { type: 'success' });
    } else if (file.name.endsWith('.json')) {
      const loaded = JSON.parse(await file.text()) as Record<string, unknown>;
      state.map = normalizeMap(
        { id: (loaded['id'] as string | undefined) || MAP_ID(), ...loaded },
        { fallbackId: MAP_ID(), requireBeats: false },
      ) as unknown as CreatorMap;
      sortBeatsByTime(state.map.beats);
      state.selectedBeats.clear();
      checkOverlaps();
      const dropZone   = document.getElementById('dropZone');
      const songNameEl = document.getElementById('songName');
      const songDurEl  = document.getElementById('songDuration');
      if (dropZone)   dropZone.classList.add('hidden');
      if (songNameEl) songNameEl.textContent = state.map.meta?.title ?? file.name;
      if (songDurEl) {
        const dur = state.map.meta?.duration ?? 0;
        songDurEl.textContent = `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`;
      }
      const restored = await restoreAudioForCurrentMap(audioCallbacks);
      if (!restored) {
        const warningMsg = document.getElementById('warningMsg');
        if (warningMsg) warningMsg.textContent = t('creator.noAudioWarning');
      }
      saveLocalMap(state.map as unknown as Parameters<typeof saveLocalMap>[0]);
      renderAll();
      showToast(t('creator.mapJsonLoaded'), { type: 'success' });
    } else if (file.name.endsWith('.zip')) {
      await loadZipFile(file, audioCallbacks);
      checkOverlaps();
      renderAll();
      showToast(t('creator.zipLoaded'), { type: 'success' });
    } else {
      throw new Error(`Nieobsługiwany format pliku: ${file.name}. Obsługiwane: audio (.mp3, .ogg, .wav), .json, .zip`);
    }
  } catch (err) {
    const warningMsg = document.getElementById('warningMsg');
    if (warningMsg) warningMsg.textContent = (err as Error).message;
    showAlert((err as Error).message, { title: t('creator.loadError') });
  }
}

// ── Drop zone ─────────────────────────────────────────────────────
function bindDropZone(): void {
  const dropBox   = document.getElementById('dropBox')!;
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;

  dropBox.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void handleFile(f);
  });
  document.addEventListener('dragover',  (e: DragEvent) => { e.preventDefault(); dropBox.classList.add('drag-over'); });
  document.addEventListener('dragleave', ()              => dropBox.classList.remove('drag-over'));
  document.addEventListener('drop',      (e: DragEvent) => {
    e.preventDefault();
    dropBox.classList.remove('drag-over');
    const f = e.dataTransfer?.files[0];
    if (f) void handleFile(f);
  });
}

// ── Test button ───────────────────────────────────────────────────
function buildGameTestUrl(mapId: string): string {
  const params  = new URLSearchParams();
  params.set('map', mapId);
  const current = new URLSearchParams(location.search);
  for (const key of ['dev', 'testing']) {
    if (current.has(key)) params.set(key, current.get(key) ?? '');
  }
  return `./beat-sabers-3d.html?${params.toString()}`;
}

// ── BPM input + tap tempo ─────────────────────────────────────────
function getBpm(): number {
  return Number((state.map.meta as Record<string, unknown>)['bpm'] ?? 0);
}

function setBpm(bpm: number): void {
  (state.map.meta as Record<string, unknown>)['bpm'] = bpm > 0 ? bpm : undefined;
  const input = document.getElementById('bpmInput') as HTMLInputElement | null;
  if (input) input.value = bpm > 0 ? String(bpm) : '';
  renderAll();
}

const tapTimes: number[] = [];

function bindBpm(): void {
  const bpmInput = document.getElementById('bpmInput') as HTMLInputElement | null;
  if (bpmInput) {
    bpmInput.value = getBpm() > 0 ? String(getBpm()) : '';
    bpmInput.addEventListener('input', () => {
      const v = parseFloat(bpmInput.value);
      setBpm(isFinite(v) && v >= 20 && v <= 400 ? v : 0);
    });
    bpmInput.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation());
  }

  document.getElementById('btnTapTempo')?.addEventListener('click', () => {
    const now = performance.now();
    tapTimes.push(now);
    // Keep only taps within 3 seconds of each other
    while (tapTimes.length > 1 && now - tapTimes[0]! > 3000) tapTimes.shift();
    if (tapTimes.length < 2) return;
    const intervals: number[] = [];
    for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i]! - tapTimes[i - 1]!);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avg * 10) / 10;
    if (bpm >= 20 && bpm <= 400) setBpm(bpm);
  });
}

// ── Shortcuts panel ───────────────────────────────────────────────
function bindShortcutsPanel(): void {
  const panel   = document.getElementById('shortcutsPanel');
  const btnOpen = document.getElementById('btnShortcuts');
  if (!panel || !btnOpen) return;
  btnOpen.addEventListener('click', () => panel.classList.toggle('hidden'));
}

// ── Waveform scroll → timeline sync ──────────────────────────────
function bindWaveformScroll(): void {
  document.getElementById('waveCanvas')?.addEventListener('waveform-scroll', () => {
    updateZoomLabel();
    renderAll();
  });
}

// ── Volume ────────────────────────────────────────────────────────
function bindVolume(): void {
  const songVolumeEl = document.getElementById('songVolume') as HTMLInputElement | null;
  songVolumeEl?.addEventListener('input', () => {
    setCreatorSongVolume(Number(songVolumeEl!.value) / 100);
  });
  state.songVolume = readCreatorSongVolume();
  setCreatorSongVolume(state.songVolume, { persist: false });
}

// ── Cut direction panel ────────────────────────────────────────────
function bindCutDirPanel(): void {
  const panel = document.getElementById('cutDirPanel');
  if (!panel) return;

  const p = panel;

  function syncActive(): void {
    p.querySelectorAll<HTMLElement>('[data-cut]').forEach(el => {
      el.classList.toggle('is-active', el.dataset['cut'] === state.activeCut);
    });
  }

  p.querySelectorAll<HTMLElement>('[data-cut]').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const cut = el.dataset['cut'];
      if (cut) { setActiveCut(cut as import('../types/index.js').CutDirection); syncActive(); }
    });
  });

  document.querySelector('.cut-dir-wrap')?.addEventListener('mouseenter', syncActive);
}

// ── Bootstrap ─────────────────────────────────────────────────────
function onPlay(): void {
  handlePlay(() => playAudio(state.currentTime, onPlayEnd));
}

bindCutDirPanel();
bindVolume();
bindBpm();
bindShortcutsPanel();
bindWaveformScroll();
initKeybindsUI();
initAudioCtx();
resizeCanvases();
drawWaveform();
bindWaveformHover();
startRafLoop();
syncCutButton();
bindDropZone();
applyCreatorTranslations();

bindTimelineEvents({
  onSave:  () => void saveMap(),
  onUndo:  () => { /* handled inside input.ts */ },
  onRedo:  () => { /* handled inside input.ts */ },
  onPlay,
});

document.getElementById('btnSave')?.addEventListener('click',   () => void saveMap());
document.getElementById('btnExport')?.addEventListener('click', () => void exportZip(audioCallbacks));
document.getElementById('btnTest')?.addEventListener('click',   () => {
  void saveMap().then(() => window.open(buildGameTestUrl(state.map.id), '_blank'));
});

window.addEventListener('resize', () => {
  resizeCanvases();
  if (state.audioBuffer) drawWaveform();
  renderAll();
});

void loadInitialMap({
  onDecoded:       audioCallbacks.onDecoded,
  onMapLoaded:     () => { checkOverlaps(); renderAll(); },
  getLocalMapById: (id: string) => getLocalMapById(id),
});
