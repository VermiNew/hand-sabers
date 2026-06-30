import { MAP_ID, state } from './state.ts';
import { validateAudioFile, validateDecodedAudio } from '../core/audio-validation.ts';
import { saveLocalMapAudio, loadLocalMapAudio } from '../core/localstore.ts';
import { t } from '../i18n/index.ts';

export const CREATOR_VOLUME_KEY = 'hs_creator_song_volume';

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}

export function readCreatorSongVolume(): number {
  const raw = Number(localStorage.getItem(CREATOR_VOLUME_KEY));
  return clamp01(Number.isFinite(raw) ? raw : 0.5);
}

export function updateRangeProgress(input: HTMLInputElement): void {
  const min   = Number(input.min   || 0);
  const max   = Number(input.max   || 100);
  const value = Number(input.value || 0);
  const pct   = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, pct))}%`);
}

export function setCreatorSongVolume(nextVolume: number, { persist = true } = {}): void {
  state.songVolume = clamp01(nextVolume);
  if (state.audioGain) state.audioGain.gain.value = state.songVolume;
  const songVolumeEl  = document.getElementById('songVolume')  as HTMLInputElement | null;
  const songVolumeVal = document.getElementById('songVolumeValue');
  if (songVolumeEl) {
    songVolumeEl.value = String(Math.round(state.songVolume * 100));
    updateRangeProgress(songVolumeEl);
  }
  if (songVolumeVal) songVolumeVal.textContent = `${Math.round(state.songVolume * 100)}%`;
  if (persist) localStorage.setItem(CREATOR_VOLUME_KEY, String(state.songVolume));
}

export function initAudioCtx(): void {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (!state.audioGain) {
    state.audioGain = state.audioCtx.createGain();
    state.audioGain.gain.value = state.songVolume;
    state.audioGain.connect(state.audioCtx.destination);
  }
  if (state.audioCtx.state === 'suspended') void state.audioCtx.resume();
}

export function getPlayPos(): number {
  if (!state.isPlaying || !state.audioCtx) return state.currentTime;
  return state.playOffset + (state.audioCtx.currentTime - state.playStartAt);
}

export function stopAudio(reset = true): void {
  if (state.audioSource) {
    try { state.audioSource.stop(); } catch { /* already stopped */ }
    state.audioSource = null;
  }
  state.isPlaying = false;
  if (reset) { state.currentTime = 0; state.viewStart = 0; }
  const btnPlay = document.getElementById('btnPlay') as HTMLButtonElement | null;
  if (btnPlay) btnPlay.innerHTML = '<span class="material-symbols-rounded inline-icon">play_arrow</span>PLAY';
}

export function playAudio(fromSec: number, onEnded: () => void): void {
  if (!state.audioBuffer || !state.audioCtx) return;
  stopAudio(false);
  state.audioSource        = state.audioCtx.createBufferSource();
  state.audioSource.buffer = state.audioBuffer;
  state.audioSource.connect(state.audioGain ?? state.audioCtx.destination);
  state.audioSource.onended = () => {
    if (!state.isPlaying) return;
    onEnded();
  };
  state.playOffset  = fromSec;
  state.playStartAt = state.audioCtx.currentTime;
  state.audioSource.start(0, fromSec);
  state.isPlaying = true;
  const btnPlay = document.getElementById('btnPlay') as HTMLButtonElement | null;
  if (btnPlay) btnPlay.innerHTML = '<span class="material-symbols-rounded inline-icon">pause</span>PAUSE';
}

export function pauseAudio(): void {
  if (!state.isPlaying) return;
  state.currentTime = getPlayPos();
  stopAudio(false);
  const btnPlay = document.getElementById('btnPlay') as HTMLButtonElement | null;
  if (btnPlay) btnPlay.innerHTML = '<span class="material-symbols-rounded inline-icon">play_arrow</span>PLAY';
}

export async function decodeAndAttachAudio(
  arrayBuffer: ArrayBuffer,
  opts: { fileName?: string; mimeType?: string; updateTitle?: boolean; keepMapId?: boolean } = {},
  callbacks: { onDecoded: () => void },
): Promise<void> {
  const { fileName = 'audio', mimeType = 'application/octet-stream', updateTitle = true, keepMapId = false } = opts;
  initAudioCtx();
  state.audioArrayBuffer = arrayBuffer.slice(0);
  state.audioFileName    = fileName;
  state.audioMimeType    = mimeType;

  try {
    state.audioBuffer = await state.audioCtx!.decodeAudioData(state.audioArrayBuffer!.slice(0) as ArrayBuffer);
    validateDecodedAudio(state.audioBuffer);
  } catch (err) {
    state.audioBuffer      = null;
    state.audioArrayBuffer = null;
    throw new Error(`Nie udało się zdekodować audio: ${(err as Error).message}`);
  }

  if (!keepMapId) state.map.id = MAP_ID();
  state.map.formatVersion = state.map.formatVersion || 1;
  if (updateTitle && !state.map.meta?.title) state.map.meta.title = fileName.replace(/\.[^.]+$/, '');
  state.map.meta = { ...state.map.meta, duration: state.audioBuffer.duration, audioFile: fileName };

  const songNameEl = document.getElementById('songName');
  const songDurEl  = document.getElementById('songDuration');
  if (songNameEl) songNameEl.textContent = state.map.meta.title || fileName;
  if (songDurEl)  songDurEl.textContent  = formatAudioTime(state.audioBuffer.duration);

  callbacks.onDecoded();

  const dropZone = document.getElementById('dropZone');
  if (dropZone) dropZone.classList.add('hidden');

  await saveLocalMapAudio(state.map.id, state.audioArrayBuffer!.slice(0) as ArrayBuffer, { fileName, mimeType });
}

export async function loadAudioFile(file: File, callbacks: { onDecoded: () => void }): Promise<void> {
  validateAudioFile(file);
  state.map.meta.title = file.name.replace(/\.[^.]+$/, '');
  await decodeAndAttachAudio(
    await file.arrayBuffer(),
    { fileName: file.name, mimeType: file.type || 'application/octet-stream' },
    callbacks,
  );
}

export async function restoreAudioForCurrentMap(callbacks: { onDecoded: () => void }): Promise<boolean> {
  if (!state.map?.id) return false;
  const autosaveLbl = document.getElementById('autosaveLabel');

  try {
    const rec = await loadLocalMapAudio(state.map.id);
    if (rec?.arrayBuffer) {
      await decodeAndAttachAudio(rec.arrayBuffer, {
        fileName:    rec.fileName   || state.map.meta?.audioFile || 'audio',
        mimeType:    rec.mimeType   || 'application/octet-stream',
        updateTitle: false,
        keepMapId:   true,
      }, callbacks);
      if (autosaveLbl) autosaveLbl.textContent = `${t('creator.autosaveAudioLocal')}: ${new Date().toLocaleTimeString()}`;
      return true;
    }
  } catch (e) {
    console.warn('Local audio restore failed:', e);
  }

  try {
    const audioUrl = state.map.meta?.audioUrl ?? `/api/maps/${encodeURIComponent(state.map.id)}/audio`;
    const res = await fetch(audioUrl);
    if (!res.ok) return false;
    await decodeAndAttachAudio(await res.arrayBuffer(), {
      fileName:    state.map.meta?.audioFile || 'audio',
      mimeType:    res.headers.get('content-type') || 'application/octet-stream',
      updateTitle: false,
      keepMapId:   true,
    }, callbacks);
    if (autosaveLbl) autosaveLbl.textContent = `${t('creator.autosaveAudioServer')}: ${new Date().toLocaleTimeString()}`;
    return true;
  } catch (e) {
    console.warn('Server audio restore failed:', e);
    return false;
  }
}

function formatAudioTime(sec: number): string {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
