import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface MapLibraryUsage {
  bytes: number;
  maps: number;
  audioFiles: number;
}

export interface MapLibraryQuotaLimits {
  maxBytes: number;
  maxMaps: number;
  maxAudioFiles: number;
}

interface MapLibraryQuotaOptions {
  mapsDir: string;
  beatdataDir: string;
  audioDir: string;
  legacyAudioDir: string;
  limits: MapLibraryQuotaLimits;
  caseInsensitiveIds?: boolean;
}

export class MapLibraryQuotaError extends Error {
  readonly code = 'MAP_LIBRARY_QUOTA_EXCEEDED';
  readonly usage: MapLibraryUsage;
  readonly limits: MapLibraryQuotaLimits;

  constructor(usage: MapLibraryUsage, limits: MapLibraryQuotaLimits) {
    const maxGiB = (limits.maxBytes / 1024 ** 3).toFixed(1);
    super(`Biblioteka map przekracza limit: maks. ${limits.maxMaps} map, ${limits.maxAudioFiles} plików audio i ${maxGiB} GiB.`);
    this.name = 'MapLibraryQuotaError';
    this.usage = usage;
    this.limits = limits;
  }
}

const AUDIO_FILE_RE = /^[a-zA-Z0-9_-]+\.(mp3|ogg|wav|flac)$/i;

async function listFiles(directory: string, accepts: (name: string) => boolean): Promise<Array<{ name: string; bytes: number }>> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files = entries.filter(entry => entry.isFile() && accepts(entry.name));
  return await Promise.all(files.map(async entry => ({
    name: entry.name,
    bytes: Math.max(0, (await stat(path.join(directory, entry.name))).size),
  })));
}

export function createMapLibraryQuota({
  mapsDir,
  beatdataDir,
  audioDir,
  legacyAudioDir,
  limits,
  caseInsensitiveIds = false,
}: MapLibraryQuotaOptions) {
  const idKey = (id: string): string => caseInsensitiveIds ? id.toLowerCase() : id;
  const mapFile = (name: string): boolean => name.endsWith('.json') && !name.startsWith('_');

  const usage = async (): Promise<MapLibraryUsage> => {
    const [legacyMaps, maps, audio, legacyAudio] = await Promise.all([
      listFiles(mapsDir, mapFile),
      listFiles(beatdataDir, mapFile),
      listFiles(audioDir, name => AUDIO_FILE_RE.test(name)),
      listFiles(legacyAudioDir, name => AUDIO_FILE_RE.test(name)),
    ]);
    const mapIds = new Set([
      ...legacyMaps.map(file => idKey(file.name.slice(0, -'.json'.length))),
      ...maps.map(file => idKey(file.name.slice(0, -'.json'.length))),
    ]);
    return {
      bytes: [...legacyMaps, ...maps, ...audio, ...legacyAudio].reduce((sum, file) => sum + file.bytes, 0),
      maps: mapIds.size,
      audioFiles: audio.length + legacyAudio.length,
    };
  };

  return {
    limits: { ...limits },
    usage,
    async assertWithinLimit(): Promise<MapLibraryUsage> {
      const current = await usage();
      if (
        current.bytes > limits.maxBytes
        || current.maps > limits.maxMaps
        || current.audioFiles > limits.maxAudioFiles
      ) throw new MapLibraryQuotaError(current, limits);
      return current;
    },
  };
}

export type MapLibraryQuota = ReturnType<typeof createMapLibraryQuota>;
