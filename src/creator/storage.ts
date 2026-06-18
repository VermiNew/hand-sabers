import { getJSZip } from '../jszip-loader.ts';
import { normalizeMap, validateZipEntryNames, AUDIO_EXT_RE } from '../core/map-format.ts';
import { saveLocalMap, saveLocalMapAudio } from '../core/localstore.ts';
import { showAlert, showConfirm, showToast } from './dialogs.ts';
import { restoreAudioForCurrentMap, decodeAndAttachAudio } from './audio.ts';
import { t } from '../i18n/index.ts';
import { state, MAP_ID } from './state.ts';
import type { CreatorMap } from './state.ts';

export function scheduleAutosave(onAutosaved?: () => void): void {
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => { autoSaveToLocalStorage(onAutosaved); }, 5000);
}

export function autoSaveToLocalStorage(onAutosaved?: () => void): void {
  try {
    localStorage.setItem('hs_autosave', JSON.stringify(state.map));
    saveLocalMap(state.map as unknown as Parameters<typeof saveLocalMap>[0]);
    if (state.audioArrayBuffer) {
      void saveLocalMapAudio(state.map.id, state.audioArrayBuffer!.slice(0) as ArrayBuffer, {
        fileName: state.audioFileName,
        mimeType: state.audioMimeType,
      });
    }
    state.lastSavedAt = new Date();
    const autosaveLbl = document.getElementById('autosaveLabel');
    if (autosaveLbl) autosaveLbl.textContent = `${t('creator.autosave')}: ${state.lastSavedAt.toLocaleTimeString()}`;
    onAutosaved?.();
  } catch { /* storage quota exceeded */ }
}

async function saveMapToServer(mapToSave: CreatorMap): Promise<Record<string, unknown>> {
  const fd = new FormData();
  fd.append('map', JSON.stringify(mapToSave));
  if (state.audioArrayBuffer) {
    const audioBlob = new Blob([state.audioArrayBuffer.slice(0)], { type: state.audioMimeType || 'application/octet-stream' });
    fd.append('audio', audioBlob, state.audioFileName || mapToSave.meta?.audioFile || `${mapToSave.id}.ogg`);
  }
  const res     = await fetch('/api/maps/save', { method: 'POST', body: fd });
  const payload = await res.json().catch(async () => ({ error: await res.text() })) as Record<string, unknown>;
  if (!res.ok) throw new Error((payload?.['error'] as string | undefined) || `${res.status} ${res.statusText}`);
  return payload;
}

function downloadMapJsonFallback(mapToDownload: CreatorMap): void {
  const blob = new Blob([JSON.stringify(mapToDownload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${mapToDownload.meta?.title || 'map'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveMap(): Promise<void> {
  state.map = normalizeMap(state.map, { fallbackId: state.map.id, requireBeats: false }) as unknown as CreatorMap;
  saveLocalMap(state.map as unknown as Parameters<typeof saveLocalMap>[0]);
  if (state.audioArrayBuffer) {
    await saveLocalMapAudio(state.map.id, state.audioArrayBuffer!.slice(0) as ArrayBuffer, {
      fileName: state.audioFileName,
      mimeType: state.audioMimeType,
    });
  }
  const autosaveLbl = document.getElementById('autosaveLabel');
  try {
    const saved = await saveMapToServer(state.map);
    if (saved?.['map']) {
      state.map = normalizeMap(saved['map'] as object, { fallbackId: state.map.id, requireBeats: false }) as unknown as CreatorMap;
      saveLocalMap(state.map as unknown as Parameters<typeof saveLocalMap>[0]);
    }
    state.lastSavedAt = new Date();
    if (autosaveLbl) autosaveLbl.textContent = `${t('creator.autosaveServer')}: ${state.lastSavedAt.toLocaleTimeString()} (${String(saved['id'] ?? '')})`;
    showToast(t('creator.savedServer'), { type: 'success' });
  } catch (err) {
    downloadMapJsonFallback(state.map);
    state.lastSavedAt = new Date();
    if (autosaveLbl) autosaveLbl.textContent = `${t('creator.autosaveLocal')}: ${state.lastSavedAt.toLocaleTimeString()} — ${(err as Error).message}`;
    showToast(t('creator.savedLocal'), { type: 'error' });
  }
}

export async function exportZip(callbacks: { onDecoded: () => void }): Promise<void> {
  try {
    const JSZip = await getJSZip();
    state.map = normalizeMap(state.map, { fallbackId: state.map.id, requireBeats: false }) as unknown as CreatorMap;
    const zip = new JSZip();
    zip.file('map.json', JSON.stringify(state.map, null, 2));
    if (state.audioArrayBuffer) {
      zip.file(state.audioFileName || state.map.meta?.audioFile || 'audio.bin', state.audioArrayBuffer.slice(0));
    } else {
      await restoreAudioForCurrentMap(callbacks);
      if (state.audioArrayBuffer) {
        zip.file(state.audioFileName || state.map.meta?.audioFile || 'audio.bin', (state.audioArrayBuffer as ArrayBuffer).slice(0));
      } else if (!await showConfirm(t('creator.exportNoAudioConfirm'), { title: t('creator.exportNoAudioTitle'), confirmText: t('creator.exportConfirm'), cancelText: t('creator.exportCancel') })) {
        return;
      }
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${state.map.meta.title || 'map'}-${state.map.id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showAlert(t('creator.exportError') + (err as Error).message, { title: t('creator.exportErrorTitle') });
  }
}

export async function loadZipFile(
  file: File,
  callbacks: { onDecoded: () => void },
): Promise<void> {
  const JSZip = await getJSZip();
  const { assertFileSize } = await import('../core/map-format.ts');
  assertFileSize(file);
  const zip       = await JSZip.loadAsync(await file.arrayBuffer());
  validateZipEntryNames(Object.values(zip.files));
  const jsonFile  = zip.file('map.json');
  if (!jsonFile) throw new Error('Archiwum ZIP nie zawiera pliku map.json');
  const loadedMap = JSON.parse(await jsonFile.async('string')) as Record<string, unknown>;
  state.map = normalizeMap(
    { id: (loadedMap['id'] as string | undefined) || MAP_ID(), ...loadedMap },
    { fallbackId: MAP_ID(), requireBeats: false },
  ) as unknown as CreatorMap;

  const { sortBeatsByTime } = await import('../core/creator-rules.ts');
  sortBeatsByTime(state.map.beats);
  state.selectedBeats.clear();

  const audioFile = Object.values(zip.files).find(f => !f.dir && AUDIO_EXT_RE.test(f.name));
  if (audioFile) {
    await decodeAndAttachAudio(
      await audioFile.async('arraybuffer') as ArrayBuffer,
      {
        fileName:    audioFile.name.split('/').pop() ?? audioFile.name,
        mimeType:    'application/octet-stream',
        updateTitle: false,
        keepMapId:   true,
      },
      callbacks,
    );
  }

  const dropZone   = document.getElementById('dropZone');
  const songNameEl = document.getElementById('songName');
  const songDurEl  = document.getElementById('songDuration');
  if (dropZone)   dropZone.classList.add('hidden');
  if (songNameEl) songNameEl.textContent = state.map.meta?.title ?? file.name;
  if (songDurEl) {
    const dur = state.map.meta?.duration ?? state.audioBuffer?.duration ?? 0;
    const m = Math.floor(dur / 60), s = Math.floor(dur % 60);
    songDurEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }
  saveLocalMap(state.map as unknown as Parameters<typeof saveLocalMap>[0]);
}

export async function loadInitialMap(callbacks: {
  onDecoded:     () => void;
  onMapLoaded:   () => void;
  getLocalMapById: (id: string) => unknown;
}): Promise<void> {
  try {
    const urlParams = new URLSearchParams(location.search);
    const mapId     = urlParams.get('id');
    if (mapId) {
      let loaded: Record<string, unknown> | null = null;
      try {
        const r = await fetch(`/api/maps/${encodeURIComponent(mapId)}`);
        if (r.ok) loaded = await r.json() as Record<string, unknown>;
      } catch { /* fallback to local */ }
      loaded = loaded ?? callbacks.getLocalMapById(mapId) as Record<string, unknown> | null;
      if (loaded) {
        state.map = normalizeMap(
          { formatVersion: 1, id: (loaded['id'] as string | undefined) || mapId || MAP_ID(), ...loaded },
          { fallbackId: mapId || MAP_ID(), requireBeats: false },
        ) as unknown as CreatorMap;
        const { sortBeatsByTime } = await import('../core/creator-rules.ts');
        sortBeatsByTime(state.map.beats);
        state.selectedBeats.clear();
        const dropZone   = document.getElementById('dropZone');
        const songNameEl = document.getElementById('songName');
        const songDurEl  = document.getElementById('songDuration');
        if (dropZone)   dropZone.classList.add('hidden');
        if (songNameEl) songNameEl.textContent = state.map.meta?.title ?? '—';
        if (songDurEl) {
          const dur = state.map.meta?.duration ?? 0;
          const m = Math.floor(dur / 60), s = Math.floor(dur % 60);
          songDurEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
        }
        await restoreAudioForCurrentMap(callbacks);
        callbacks.onMapLoaded();
      }
      return;
    }

    const saved = localStorage.getItem('hs_autosave');
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      if (parsed?.['beats'] && !state.audioBuffer) {
        const ok = await showConfirm(t('creator.autosaveFoundConfirm'), {
          title:       t('creator.autosaveFoundTitle'),
          confirmText: t('creator.autosaveLoad'),
          cancelText:  t('creator.autosaveSkip'),
        });
        if (ok) {
          state.map = normalizeMap(
            { formatVersion: 1, id: (parsed['id'] as string | undefined) || MAP_ID(), ...parsed },
            { fallbackId: MAP_ID(), requireBeats: false },
          ) as unknown as CreatorMap;
          const { sortBeatsByTime } = await import('../core/creator-rules.ts');
          sortBeatsByTime(state.map.beats);
          state.selectedBeats.clear();
          const dropZone   = document.getElementById('dropZone');
          const songNameEl = document.getElementById('songName');
          const songDurEl  = document.getElementById('songDuration');
          if (dropZone)   dropZone.classList.add('hidden');
          if (songNameEl) songNameEl.textContent = state.map.meta?.title ?? '—';
          if (songDurEl) {
            const dur = state.map.meta?.duration ?? 0;
            const m = Math.floor(dur / 60), s = Math.floor(dur % 60);
            songDurEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
          }
          await restoreAudioForCurrentMap(callbacks);
          callbacks.onMapLoaded();
        }
      }
    }
  } catch (e) {
    console.warn('Initial map load failed:', e);
  }
}
