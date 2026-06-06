import { loadMapAudio } from './audio.js';
import { getSettings } from '../core/settings.js';
import { getJSZip } from '../jszip-loader.js';
import {
  AUDIO_EXT_RE,
  MAX_BEATS_DEFAULT,
  MAX_BEATS_EXTENDED,
  assertFileSize,
  normalizeMap,
  validateMap as validateMapShape,
  validateZipEntryNames,
} from '../core/map-format.ts';

// Ładuje mapę z pliku .json lub .zip (drag & drop)
// Zwraca { meta, beats } lub null

function beatLimitOptions(extra = {}) {
  const settings = getSettings();
  return {
    ...extra,
    maxBeats: settings.beatLimitEnabled === false ? MAX_BEATS_EXTENDED : MAX_BEATS_DEFAULT,
    throwOnLimit: true,
  };
}

export async function loadMapFromFile(file) {
  assertFileSize(file);

  if (file.name.endsWith('.json')) {
    const text = await file.text();
    return normalizeMap(JSON.parse(text), beatLimitOptions({ fallbackId: file.name.replace(/\.[^.]+$/, '') }));
  }

  if (file.name.endsWith('.zip')) {
    return loadMapFromZip(file);
  }

  // Próbuj jako mp3/ogg — tryb losowy z muzyką
  if (file.type.startsWith('audio/') || AUDIO_EXT_RE.test(file.name)) {
    const ab = await file.arrayBuffer();
    await loadMapAudio(ab.slice ? ab.slice(0) : ab);
    return {
      formatVersion: 1,
      meta:  { title: file.name.replace(/\.[^.]+$/, ''), duration: 0, audioFile: file.name, audioOffsetMs: 0 },
      beats: null, // null = tryb losowy z muzyką
      audioBuffer: ab,
    };
  }

  throw new Error(`Nieznany format pliku: ${file.name}`);
}

async function loadMapFromZip(file) {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  validateZipEntryNames(Object.values(zip.files));

  // Szukaj map.json
  const jsonFile = zip.file('map.json');
  if (!jsonFile) throw new Error('Brak map.json w archiwum');
  const mapData = normalizeMap(JSON.parse(await jsonFile.async('string')), beatLimitOptions({ fallbackId: file.name.replace(/\.[^.]+$/, '') }));

  // Szukaj pliku audio
  const audioFile = Object.values(zip.files).find(f => !f.dir && AUDIO_EXT_RE.test(f.name));
  if (audioFile) {
    const ab = await audioFile.async('arraybuffer');
    await loadMapAudio(ab.slice ? ab.slice(0) : ab);
    mapData.audioBuffer = ab;
    mapData.meta = { ...(mapData.meta || {}), audioFile: audioFile.name.split('/').pop() };
  }

  return mapData;
}

// Walidacja mapy
export function validateMap(map) {
  return validateMapShape(map, beatLimitOptions({ requireBeats: true }));
}

// Pobiera następne bity do spawnu na podstawie czasu audio
export function getBeatsInWindow(beats, currentTime, windowSec = 0.1) {
  return beats.filter(b =>
    b.t >= currentTime - 0.016 &&
    b.t <  currentTime + windowSec
  );
}
