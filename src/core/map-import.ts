import JSZip from 'jszip';
import { saveLocalMap, saveLocalMapAudio } from './localstore.ts';
import { assertFileSize, findPreferredAudioEntry, normalizeMap, validateZipEntryNames } from './map-format.ts';
import {
  assertZipDeclaredLimits,
  createZipOutputBudget,
  readZipEntryArrayBuffer,
  readZipEntryText,
} from './zip-limits.ts';
import { t } from '../i18n/index.ts';
import { adminFetch } from './admin-auth.ts';

export interface ImportedMap {
  id: string;
  beats: number;
  audio: string | null;
}

export interface ServerImportedMap {
  id: string;
  audio?: string;
}

interface LocalMap {
  id: string;
  beats?: Record<string, unknown>[];
  meta?: Record<string, unknown> & { audioFile?: string };
}

/** Thrown when the server already holds a map with the imported id. */
export class MapExistsError extends Error {
  readonly mapId: string;

  constructor(mapId: string, message: string) {
    super(message);
    this.name = 'MapExistsError';
    this.mapId = mapId;
  }
}

export async function importMapToServer(file: File, { overwrite = false } = {}): Promise<ServerImportedMap> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await adminFetch(`/api/maps/import${overwrite ? '?overwrite=1' : ''}`, { method: 'POST', body: formData });
  const payload = await response.json().catch(async () => ({ error: await response.text() })) as ServerImportedMap & { error?: string; code?: string };
  if (response.status === 409 && payload.code === 'MAP_EXISTS') {
    throw new MapExistsError(payload.id, payload.error ?? payload.id);
  }
  if (!response.ok) throw new Error(payload.error ?? `${response.status} ${response.statusText}`);
  return payload;
}

/**
 * Imports to the server, asking before replacing an existing map. Returns null
 * when the user declines, so callers must not fall back to a local import.
 */
export async function importMapToServerConfirmed(file: File): Promise<ServerImportedMap | null> {
  try {
    return await importMapToServer(file);
  } catch (error) {
    if (!(error instanceof MapExistsError)) throw error;
    if (!window.confirm(t('maps.overwriteConfirm', { id: error.mapId }))) return null;
    return importMapToServer(file, { overwrite: true });
  }
}

export async function importMapLocally(file: File): Promise<ImportedMap> {
  assertFileSize(file);
  const name = file.name.toLowerCase();
  let map: LocalMap;
  let audioName: string | null = null;

  if (name.endsWith('.json')) {
    map = normalizeMap(JSON.parse(await file.text()), { fallbackId: file.name.replace(/\.[^.]+$/, '') }) as unknown as LocalMap;
  } else if (name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files);
    validateZipEntryNames(entries);
    assertZipDeclaredLimits(entries);
    const outputBudget = createZipOutputBudget();
    const jsonFile = zip.file('map.json');
    if (!jsonFile) throw new Error(t('maps.importJsonMissing'));
    map = normalizeMap(JSON.parse(await readZipEntryText(jsonFile, outputBudget)), { fallbackId: file.name.replace(/\.[^.]+$/, '') }) as unknown as LocalMap;
    const audioFile = findPreferredAudioEntry(entries, map.meta?.audioFile);
    if (audioFile) {
      audioName = audioFile.name.split('/').pop() ?? null;
      if (map.meta && audioName) map.meta.audioFile = audioName;
      await saveLocalMapAudio(map.id, await readZipEntryArrayBuffer(audioFile, outputBudget), {
        fileName: audioName ?? '',
        mimeType: 'application/octet-stream',
      });
    }
  } else {
    throw new Error(t('maps.importUnsupported'));
  }

  saveLocalMap(map);
  return { id: map.id, beats: map.beats?.length ?? 0, audio: audioName };
}
