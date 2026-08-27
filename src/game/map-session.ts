import { state } from '../core/state.ts';
import { getLocalMapById, loadLocalMapAudio } from '../core/localstore.ts';
import { getCanonicalMapAudioUrl } from '../core/map-format.ts';
import type { Settings } from '../types/index.js';
import { clearMapAudio, getMapDuration, hasMapAudio, loadMapAudio } from './audio.ts';
import { validateMap } from './maploader.ts';
import { preparePhoneAudio } from '../remote/host-audio.ts';

const MAP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/i;

export async function loadMapById(mapId: string): Promise<boolean> {
  if (!MAP_ID_RE.test(mapId)) return false;
  if (state.map?.id === mapId) return true;
  try {
    const res = await fetch(`/api/maps/${encodeURIComponent(mapId)}`);
    if (res.ok) {
      const map = await res.json() as Record<string, unknown>;
      if (validateMap(map)) {
        clearMapAudio();
        state.map = { ...map, _serverAudioPending: true } as unknown as typeof state.map;
        return true;
      }
    }
  } catch { /* fallback to local */ }

  const localMap = getLocalMapById(mapId);
  if (validateMap(localMap)) {
    clearMapAudio();
    state.map = { ...localMap, _localAudioPending: true, localOnly: true } as unknown as typeof state.map;
    return true;
  }
  return false;
}

export async function tryLoadMapFromUrl(): Promise<void> {
  const mapId = new URLSearchParams(location.search).get('map');
  if (mapId) await loadMapById(mapId);
}

export async function ensureCurrentMapAudio(settings: Pick<Settings, 'phoneAudioOutput'>): Promise<void> {
  if (!state.map || hasMapAudio()) return;

  if (state.map._serverAudioPending) {
    state.map._serverAudioPending = false;
    try {
      const audioUrl = getCanonicalMapAudioUrl(state.map.id);
      const res = audioUrl ? await fetch(audioUrl) : null;
      if (res?.ok) {
        await loadMapAudio(await res.arrayBuffer());
        state.map._audioReady = true;
        const duration = getMapDuration();
        if (duration && !state.map.meta?.duration) state.map.meta = { ...(state.map.meta ?? {}), duration };
        if (settings.phoneAudioOutput && state.map.id) preparePhoneAudio(audioUrl, state.map.id);
        return;
      }
    } catch (error) {
      console.warn('Server map audio restore failed:', error);
    }
  }

  if (!state.map._localAudioPending && !state.map.localOnly) return;

  try {
    const record = await loadLocalMapAudio(state.map.id ?? '');
    if (!record?.arrayBuffer) return;
    await loadMapAudio(record.arrayBuffer);
    state.map._localAudioPending = false;
    state.map._audioReady = true;
    const duration = getMapDuration();
    if (duration && !state.map.meta?.duration) state.map.meta = { ...(state.map.meta ?? {}), duration };
  } catch (error) {
    console.warn('Local map audio restore failed:', error);
  }
}
