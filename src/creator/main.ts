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

import { drawWaveform } from './waveform.ts';

import {
  renderAll,
  requestTimelineRender,
  resizeCanvases,
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
  bindTimelineEvents,
  handlePlay,
} from './input.ts';

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

// ── RAF render loop ───────────────────────────────────────────────
function startRafLoop(): void {
  if (state.rafId) return;
  function tick(): void {
    if (state.isPlaying) {
      state.currentTime = getPlayPos();
      const timelineCanvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
      if (timelineCanvas) {
        const w  = timelineCanvas.width;
        const px = (state.currentTime - state.viewStart) * state.pxPerSec;
        if (px > w * 0.78) state.viewStart = state.currentTime - (w * 0.22) / state.pxPerSec;
        if (px < 0)        state.viewStart = state.currentTime;
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
    if (state.isPlaying || state.timelineDirty) renderAll();
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
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

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

// ── Volume ────────────────────────────────────────────────────────
function bindVolume(): void {
  const songVolumeEl = document.getElementById('songVolume') as HTMLInputElement | null;
  songVolumeEl?.addEventListener('input', () => {
    setCreatorSongVolume(Number(songVolumeEl!.value) / 100);
  });
  state.songVolume = readCreatorSongVolume();
  setCreatorSongVolume(state.songVolume, { persist: false });
}

// ── Bootstrap ─────────────────────────────────────────────────────
function onPlay(): void {
  handlePlay(() => playAudio(state.currentTime, onPlayEnd));
}

bindVolume();
initAudioCtx();
resizeCanvases();
drawWaveform();
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
