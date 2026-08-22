import JSZip from 'jszip';
import { saveLocalMap, saveLocalMapAudio } from './localstore.ts';
import { assertFileSize, findPreferredAudioEntry, normalizeMap, validateZipEntryNames } from './map-format.ts';
import { t } from '../i18n/index.ts';

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

export async function importMapToServer(file: File): Promise<ServerImportedMap> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/maps/import', { method: 'POST', body: formData });
  const payload = await response.json().catch(async () => ({ error: await response.text() })) as ServerImportedMap & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `${response.status} ${response.statusText}`);
  return payload;
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
    const jsonFile = zip.file('map.json');
    if (!jsonFile) throw new Error(t('maps.importJsonMissing'));
    map = normalizeMap(JSON.parse(await jsonFile.async('string')), { fallbackId: file.name.replace(/\.[^.]+$/, '') }) as unknown as LocalMap;
    const audioFile = findPreferredAudioEntry(entries, map.meta?.audioFile);
    if (audioFile) {
      audioName = audioFile.name.split('/').pop() ?? null;
      if (map.meta && audioName) map.meta.audioFile = audioName;
      await saveLocalMapAudio(map.id, await audioFile.async('arraybuffer'), {
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
