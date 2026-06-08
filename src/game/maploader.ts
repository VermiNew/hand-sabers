import type { Beat, GameMap, MapMeta } from '../types/index.js';
import { loadMapAudio } from './audio.js';
import { getSettings } from '../core/settings.ts';
import { getJSZip } from '../jszip-loader.ts';
import {
  AUDIO_EXT_RE,
  MAX_BEATS_DEFAULT,
  MAX_BEATS_EXTENDED,
  assertFileSize,
  normalizeMap,
  validateMap as validateMapShape,
  validateZipEntryNames,
} from '../core/map-format.ts';

interface BeatLimitOptions {
  fallbackId?: string;
  requireBeats?: boolean;
  maxBeats: number;
  throwOnLimit: true;
}

interface RandomAudioMap {
  formatVersion: number;
  meta: MapMeta;
  beats: null;
  audioBuffer: ArrayBuffer;
}

type LoadedMap = (GameMap & Record<string, unknown>) | RandomAudioMap;

function beatLimitOptions(extra: Partial<BeatLimitOptions> = {}): BeatLimitOptions {
  const settings = getSettings();
  return {
    ...extra,
    maxBeats: settings.beatLimitEnabled === false ? MAX_BEATS_EXTENDED : MAX_BEATS_DEFAULT,
    throwOnLimit: true,
  };
}

export async function loadMapFromFile(file: File): Promise<LoadedMap> {
  assertFileSize(file);

  if (file.name.endsWith('.json')) {
    const text = await file.text();
    return normalizeMap(JSON.parse(text) as unknown, beatLimitOptions({ fallbackId: file.name.replace(/\.[^.]+$/, '') }));
  }

  if (file.name.endsWith('.zip')) {
    return loadMapFromZip(file);
  }

  if (file.type.startsWith('audio/') || AUDIO_EXT_RE.test(file.name)) {
    const ab = await file.arrayBuffer();
    await loadMapAudio(ab.slice ? ab.slice(0) : ab);
    return {
      formatVersion: 1,
      meta:  { title: file.name.replace(/\.[^.]+$/, ''), duration: 0, audioFile: file.name, audioOffsetMs: 0 },
      beats: null,
      audioBuffer: ab,
    };
  }

  throw new Error(`Nieznany format pliku: ${file.name}`);
}

async function loadMapFromZip(file: File): Promise<GameMap & Record<string, unknown>> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  validateZipEntryNames(Object.values(zip.files));

  const jsonFile = zip.file('map.json');
  if (!jsonFile) throw new Error('Brak map.json w archiwum');
  const mapData = normalizeMap(
    JSON.parse(await jsonFile.async('string')) as unknown,
    beatLimitOptions({ fallbackId: file.name.replace(/\.[^.]+$/, '') }),
  );

  const audioFile = Object.values(zip.files).find(f => !f.dir && AUDIO_EXT_RE.test(f.name));
  if (audioFile) {
    const ab = await audioFile.async('arraybuffer');
    await loadMapAudio(ab.slice ? ab.slice(0) : ab);
    mapData.audioBuffer = ab;
    mapData.meta = { ...(mapData.meta || {}), audioFile: audioFile.name.split('/').pop() ?? audioFile.name };
  }

  return mapData;
}

export function validateMap(map: unknown): boolean {
  return validateMapShape(map, beatLimitOptions({ requireBeats: true }));
}

export function getBeatsInWindow<T extends Beat>(
  beats: readonly T[],
  currentTime: number,
  windowSec = 0.1,
): T[] {
  return beats.filter(b =>
    b.t >= currentTime - 0.016 &&
    b.t <  currentTime + windowSec
  );
}
