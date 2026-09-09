import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { Express } from 'express';
import {
  AUDIO_BANK_MANIFEST_VERSION,
  PROCEDURAL_AUDIO_ASSETS,
  type AudioBankManifest,
  type AudioBankManifestAsset,
} from '../../src/remote/audio-bank-manifest.js';
import { getCanonicalMapAudioUrl, sanitizeMapId } from '../../src/core/map-format.js';
import type { AudioStorage } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';
import { errorMessage, type KeyedMutex } from '../utils.js';

interface AudioBankRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
  mapAssetLocks: KeyedMutex;
}

interface AudioHashCacheEntry {
  filePath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  sha256: string;
}

const MAX_CONCURRENT_AUDIO_HASHES = 2;
const MAX_AUDIO_HASH_CACHE_ENTRIES = 2_048;
const audioHashCache = new Map<string, AudioHashCacheEntry>();
let activeAudioHashes = 0;

async function sha256File(filePath: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath, { signal })) hash.update(chunk);
  return hash.digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const proceduralAssets: AudioBankManifestAsset[] = PROCEDURAL_AUDIO_ASSETS.map(definition => ({
  ...definition,
  kind: 'procedural' as const,
  bytes: 0,
  sha256: sha256Text(JSON.stringify(definition)),
}));

function rememberAudioHash(mapId: string, entry: AudioHashCacheEntry): void {
  if (!audioHashCache.has(mapId) && audioHashCache.size >= MAX_AUDIO_HASH_CACHE_ENTRIES) {
    const oldestMapId = audioHashCache.keys().next().value;
    if (oldestMapId) audioHashCache.delete(oldestMapId);
  }
  audioHashCache.delete(mapId);
  audioHashCache.set(mapId, entry);
}

export function registerAudioBankRoutes({ app, mapStorage, audioStorage, mapAssetLocks }: AudioBankRoutesOptions): void {
  app.get('/api/audio-banks/:mapId/manifest', async (req, res) => {
    const mapId = sanitizeMapId(req.params['mapId'], '');
    if (!mapId) return res.status(400).json({ error: 'Nieprawidłowe id mapy.' });

    const release = await mapAssetLocks.acquire(mapId);
    try {
      if (res.destroyed) return;
      const map = await mapStorage.read(mapId);
      if (!map) return res.status(404).json({ error: 'Mapa nie znaleziona.' });
      const audio = await audioStorage.find(mapId, map);
      if (!audio) return res.status(404).json({ error: 'Audio mapy nie znalezione.' });

      const fileInfo = await stat(audio.fullPath);
      const cachedHash = audioHashCache.get(mapId);
      const cacheMatches = cachedHash?.filePath === audio.fullPath
        && cachedHash.size === fileInfo.size
        && cachedHash.mtimeMs === fileInfo.mtimeMs
        && cachedHash.ctimeMs === fileInfo.ctimeMs;
      let musicHash = cachedHash?.sha256;
      if (!cacheMatches || !musicHash) {
        if (activeAudioHashes >= MAX_CONCURRENT_AUDIO_HASHES) {
          return res.set('Retry-After', '2').status(503).json({
            error: 'Serwer przygotowuje maksymalną liczbę banków audio. Spróbuj ponownie za chwilę.',
          });
        }
        const abortController = new AbortController();
        const abortHash = (): void => abortController.abort();
        res.once('close', abortHash);
        activeAudioHashes++;
        try {
          musicHash = await sha256File(audio.fullPath, abortController.signal);
          rememberAudioHash(mapId, {
            filePath: audio.fullPath,
            size: fileInfo.size,
            mtimeMs: fileInfo.mtimeMs,
            ctimeMs: fileInfo.ctimeMs,
            sha256: musicHash,
          });
        } finally {
          activeAudioHashes = Math.max(0, activeAudioHashes - 1);
          res.off('close', abortHash);
        }
      }
      const assets: AudioBankManifestAsset[] = [
        {
          id: 'music.map',
          category: 'music',
          kind: 'file',
          bytes: fileInfo.size,
          sha256: musicHash,
          mimeType: audioStorage.mimeForFile(audio.publicName || audio.fileName),
          url: getCanonicalMapAudioUrl(mapId),
        },
        ...proceduralAssets,
      ];
      const bankId = sha256Text(assets.map(asset => `${asset.id}:${asset.sha256}`).join('|'));
      const manifest: AudioBankManifest = {
        version: AUDIO_BANK_MANIFEST_VERSION,
        bankId,
        mapId,
        totalBytes: fileInfo.size,
        assets,
      };
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(manifest);
    } catch (error) {
      if (!res.destroyed) return res.status(500).json({ error: errorMessage(error) });
    } finally {
      release();
    }
  });
}
