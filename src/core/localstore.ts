const LOCAL_MAPS_KEY = 'hs_local_maps';
const LOCAL_SCORES_KEY = 'hs_local_scores';
const AUDIO_DB_NAME = 'hs_audio_store';
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE = 'audio';

type UnknownRecord = Record<string, unknown>;

interface MapForStorage {
  formatVersion?: number;
  id?: string;
  meta?: UnknownRecord | null;
  beats?: UnknownRecord[] | null;
}

export interface StoredLocalMap {
  formatVersion: number;
  id: string;
  meta: UnknownRecord;
  beats: UnknownRecord[];
  updatedAt: string;
  localOnly: true;
}

interface ReadScoresOptions {
  mapId?: string | null;
  limit?: number;
}

interface LocalScoreInput {
  mapId?: string;
  player?: string;
  score?: number;
  combo?: number;
  date?: string;
}

export interface LocalScore {
  mapId: string;
  player: string;
  score: number;
  combo: number;
  date: string;
  localOnly: true;
}

interface AudioMeta {
  fileName?: string;
  mimeType?: string;
}

export interface LocalMapAudioRecord {
  mapId: string;
  arrayBuffer: ArrayBuffer;
  fileName: string;
  mimeType: string;
  savedAt: string;
}

function safeJsonParse<T>(raw: string | null, fallback: T): unknown {
  try { return raw ? JSON.parse(raw) as unknown : fallback; }
  catch { return fallback; }
}

function cloneMapForStorage(map: MapForStorage): StoredLocalMap {
  return {
    formatVersion: map?.formatVersion || 1,
    id: map?.id || `map-${Date.now()}`,
    meta: { ...(map?.meta || {}) },
    beats: Array.isArray(map?.beats) ? map.beats.map(b => ({ ...b })) : [],
    updatedAt: new Date().toISOString(),
    localOnly: true,
  };
}

export function readLocalMaps(): StoredLocalMap[] {
  if (typeof localStorage === 'undefined') return [];
  const maps = safeJsonParse(localStorage.getItem(LOCAL_MAPS_KEY), []);
  return Array.isArray(maps) ? maps as StoredLocalMap[] : [];
}

export function saveLocalMap(map: MapForStorage | null | undefined): StoredLocalMap | null {
  if (typeof localStorage === 'undefined' || !map) return null;
  const clean = cloneMapForStorage(map);
  const maps = readLocalMaps().filter(m => m.id !== clean.id);
  maps.push(clean);
  maps.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  localStorage.setItem(LOCAL_MAPS_KEY, JSON.stringify(maps.slice(0, 50)));
  return clean;
}

export function getLocalMapById(id: string): StoredLocalMap | null {
  return readLocalMaps().find(m => m.id === id) || null;
}

export function deleteLocalMap(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCAL_MAPS_KEY, JSON.stringify(readLocalMaps().filter(m => m.id !== id)));
}

export function readLocalScores({ mapId = null, limit = 100 }: ReadScoresOptions = {}): LocalScore[] {
  if (typeof localStorage === 'undefined') return [];
  let scores = safeJsonParse(localStorage.getItem(LOCAL_SCORES_KEY), []);
  if (!Array.isArray(scores)) scores = [];
  let localScores = scores as LocalScore[];
  if (mapId) localScores = localScores.filter(s => s.mapId === mapId);
  localScores.sort((a, b) => (b.score || 0) - (a.score || 0));
  return localScores.slice(0, limit);
}

export function appendLocalScore(score: LocalScoreInput | null | undefined): void {
  if (typeof localStorage === 'undefined' || !score) return;
  const scores = readLocalScores({ limit: 500 });
  scores.push({
    mapId: score.mapId || 'random',
    player: score.player || 'Gracz',
    score: Math.max(0, Math.floor(score.score || 0)),
    combo: Math.max(0, Math.floor(score.combo || 0)),
    date: score.date || new Date().toISOString(),
    localOnly: true,
  });
  scores.sort((a, b) => (b.score || 0) - (a.score || 0));
  localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(scores.slice(0, 500)));
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE, { keyPath: 'mapId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

export async function saveLocalMapAudio(
  mapId: string,
  arrayBuffer: ArrayBuffer,
  meta: AudioMeta = {},
): Promise<void> {
  if (!mapId || !arrayBuffer) return;
  const db = await openAudioDb();
  try {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    const store = tx.objectStore(AUDIO_STORE);
    const copy = arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer;
    await idbRequest(store.put({
      mapId,
      arrayBuffer: copy,
      fileName: meta.fileName || 'audio',
      mimeType: meta.mimeType || 'application/octet-stream',
      savedAt: new Date().toISOString(),
    }));
  } finally {
    db.close();
  }
}

export async function loadLocalMapAudio(mapId: string): Promise<LocalMapAudioRecord | null> {
  if (!mapId) return null;
  const db = await openAudioDb();
  try {
    const tx = db.transaction(AUDIO_STORE, 'readonly');
    const rec = await idbRequest<LocalMapAudioRecord | undefined>(tx.objectStore(AUDIO_STORE).get(mapId));
    return rec || null;
  } finally {
    db.close();
  }
}

export async function deleteLocalMapAudio(mapId: string): Promise<void> {
  if (!mapId) return;
  const db = await openAudioDb();
  try {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    await idbRequest(tx.objectStore(AUDIO_STORE).delete(mapId));
  } finally {
    db.close();
  }
}
