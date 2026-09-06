import { createReadStream, type ReadStream } from 'fs';
import type { Express, Response } from 'express';
import { createRequire } from 'module';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getCanonicalMapAudioUrl, sanitizeMapId } from '../../src/core/map-format.js';
import type { AudioStorage } from '../storage/audio.js';
import type { MapStorage, StoredMap } from '../storage/maps.js';
import { errorMessage, type FileMutex, type KeyedMutex } from '../utils.js';

interface MapReadRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
  mapAssetLocks: KeyedMutex;
  mapCatalogLock: FileMutex;
}

interface ArchiveLike extends Readable {
  append(source: string | Buffer | NodeJS.ReadableStream, data: { name: string }): void;
  abort(): void;
  finalize(): Promise<void>;
}

const require = createRequire(import.meta.url);
const archiver: { ZipArchive: new (options?: unknown) => ArchiveLike } = require('archiver');
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

function openPausedReadStream(filePath: string): Promise<ReadStream> {
  const stream = createReadStream(filePath);
  return new Promise((resolve, reject) => {
    const handleOpen = (): void => {
      stream.off('error', handleError);
      stream.pause();
      resolve(stream);
    };
    const handleError = (error: Error): void => {
      stream.off('open', handleOpen);
      reject(error);
    };
    stream.once('open', handleOpen);
    stream.once('error', handleError);
  });
}

async function streamResponse(source: Readable, res: Response): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  timeout.unref();
  try {
    await pipeline(source, res, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function safeId(id: unknown): string {
  return sanitizeMapId(id, '');
}

function mapForResponse(map: StoredMap, id: string): StoredMap {
  return {
    ...map,
    id,
    meta: {
      ...(map.meta ?? {}),
      audioUrl: getCanonicalMapAudioUrl(id),
    },
  };
}

export function registerMapReadRoutes({ app, mapStorage, audioStorage, mapAssetLocks, mapCatalogLock }: MapReadRoutesOptions): void {
  const withMapLock = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const release = await mapAssetLocks.acquire(id);
    try {
      return await operation();
    } finally {
      release();
    }
  };
  const withCatalogLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    const release = await mapCatalogLock.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  };
  app.get('/api/maps', async (_req, res) => {
    try {
      res.json(await withCatalogLock(() => mapStorage.list()));
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/by-title/:title', async (req, res) => {
    try {
      const title = String(req.params['title'] ?? '').toLowerCase();
      if (!title) return res.status(400).json({ error: 'Brak tytułu.' });
      const maps = await withCatalogLock(() => mapStorage.list());
      let found: { map: StoredMap; id: string } | null = null;
      for (const item of maps) {
        const id = safeId(item.id);
        if (!id) continue;
        const map = await withMapLock(id, () => mapStorage.read(id));
        if (map?.meta?.title?.toLowerCase() !== title) continue;
        found = { map, id };
        break;
      }
      if (found) return res.json(mapForResponse(found.map, found.id));
      res.status(404).json({ error: 'Nie znaleziono.' });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/:id/export.zip', async (req, res) => {
    const id = safeId(req.params['id']);
    if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
    try {
      const snapshot = await withMapLock(id, async () => {
        if (res.destroyed) return null;
        const data = await mapStorage.read(id);
        if (!data) {
          res.status(404).json({ error: 'Nie znaleziono.' });
          return null;
        }
        const audio = await audioStorage.find(id, data);
        const audioStream = audio ? await openPausedReadStream(audio.fullPath) : null;
        return {
          mapJson: JSON.stringify(mapForResponse(data, id), null, 2),
          audioName: audio?.publicName ?? null,
          audioStream,
        };
      });
      if (!snapshot || res.destroyed) {
        snapshot?.audioStream?.destroy();
        return;
      }

      const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
      const forwardAudioError = (error: Error): void => {
        archive.destroy(error);
      };
      snapshot.audioStream?.once('error', forwardAudioError);
      const transfer = streamResponse(archive, res);
      try {
        res.attachment(`${id}.zip`);
        archive.append(snapshot.mapJson, { name: 'map.json' });
        if (snapshot.audioStream && snapshot.audioName) {
          archive.append(snapshot.audioStream, { name: snapshot.audioName });
        }
        await Promise.all([archive.finalize(), transfer]);
      } catch (error) {
        snapshot.audioStream?.destroy();
        try {
          archive.abort();
        } catch {}
        await transfer.catch(() => {});
        throw error;
      } finally {
        snapshot.audioStream?.off('error', forwardAudioError);
      }
    } catch (error) {
      if (!res.headersSent && !res.destroyed) res.status(500).json({ error: errorMessage(error) });
      else if (!res.destroyed) res.destroy(error instanceof Error ? error : undefined);
    }
  });

  app.get('/api/maps/:id/audio', async (req, res) => {
    try {
      const id = safeId(req.params['id']);
      if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
      const snapshot = await withMapLock(id, async () => {
        if (res.destroyed) return null;
        const map = await mapStorage.read(id);
        if (!map) {
          res.status(404).json({ error: 'Mapa nie znaleziona.' });
          return null;
        }
        const audio = await audioStorage.find(id, map);
        if (!audio) {
          res.status(404).json({ error: 'Audio nie znalezione.' });
          return null;
        }
        return {
          mime: audioStorage.mimeForFile(audio.publicName || audio.fileName),
          stream: await openPausedReadStream(audio.fullPath),
        };
      });
      if (!snapshot || res.destroyed) {
        snapshot?.stream.destroy();
        return;
      }
      res.type(snapshot.mime);
      await streamResponse(snapshot.stream, res);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) res.status(500).json({ error: errorMessage(error) });
      else if (!res.destroyed) res.destroy(error instanceof Error ? error : undefined);
    }
  });

  app.get('/api/maps/:id', async (req, res) => {
    try {
      const id = safeId(req.params['id']);
      if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
      await withMapLock(id, async () => {
        const data = await mapStorage.read(id);
        if (!data) {
          res.status(404).json({ error: 'Nie znaleziono.' });
          return;
        }
        res.json(mapForResponse(data, id));
      });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
