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

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function registerAudioBankRoutes({ app, mapStorage, audioStorage, mapAssetLocks }: AudioBankRoutesOptions): void {
  app.get('/api/audio-banks/:mapId/manifest', async (req, res) => {
    const mapId = sanitizeMapId(req.params['mapId'], '');
    if (!mapId) return res.status(400).json({ error: 'Nieprawidłowe id mapy.' });

    const release = await mapAssetLocks.acquire(mapId);
    try {
      const map = await mapStorage.read(mapId);
      if (!map) return res.status(404).json({ error: 'Mapa nie znaleziona.' });
      const audio = await audioStorage.find(mapId, map);
      if (!audio) return res.status(404).json({ error: 'Audio mapy nie znalezione.' });

      const [fileInfo, musicHash] = await Promise.all([
        stat(audio.fullPath),
        sha256File(audio.fullPath),
      ]);
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
        ...PROCEDURAL_AUDIO_ASSETS.map(definition => ({
          ...definition,
          kind: 'procedural' as const,
          bytes: 0,
          sha256: sha256Text(JSON.stringify(definition)),
        })),
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
      return res.status(500).json({ error: errorMessage(error) });
    } finally {
      release();
    }
  });
}
