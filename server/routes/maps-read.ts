import { createReadStream } from 'fs';
import type { Express, Response } from 'express';
import { createRequire } from 'module';
import { getCanonicalMapAudioUrl, sanitizeMapId } from '../../src/core/map-format.js';
import type { AudioStorage } from '../storage/audio.js';
import type { MapStorage, StoredMap } from '../storage/maps.js';
import { errorMessage, type KeyedMutex } from '../utils.js';

interface MapReadRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
  mapAssetLocks: KeyedMutex;
}

interface ArchiveLike {
  on(event: 'error', handler: (err: Error) => void): void;
  pipe(destination: NodeJS.WritableStream): void;
  append(source: string | Buffer, data: { name: string }): void;
  file(filePath: string, data: { name: string }): void;
  finalize(): Promise<void>;
}

const require = createRequire(import.meta.url);
const archiver: { ZipArchive: new (options?: unknown) => ArchiveLike } = require('archiver');

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

export function registerMapReadRoutes({ app, mapStorage, audioStorage, mapAssetLocks }: MapReadRoutesOptions): void {
  const withMapLock = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const release = await mapAssetLocks.acquire(id);
    try {
      return await operation();
    } finally {
      release();
    }
  };
  const waitForResponse = (res: Response): Promise<void> => new Promise(resolve => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    res.once('finish', settle);
    res.once('close', settle);
  });
  app.get('/api/maps', async (_req, res) => {
    try {
      res.json(await mapStorage.list());
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/by-title/:title', async (req, res) => {
    try {
      const title = String(req.params['title'] ?? '').toLowerCase();
      if (!title) return res.status(400).json({ error: 'Brak tytułu.' });
      const maps = await mapStorage.list();
      for (const item of maps) {
        const id = safeId(item.id);
        if (!id) continue;
        const map = await mapStorage.read(id);
        if (map?.meta?.title?.toLowerCase() === title) return res.json(mapForResponse(map, id));
      }
      res.status(404).json({ error: 'Nie znaleziono.' });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/:id/export.zip', async (req, res) => {
    const id = safeId(req.params['id']);
    if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
    try {
      await withMapLock(id, async () => {
        const data = await mapStorage.read(id);
        if (!data) {
          res.status(404).json({ error: 'Nie znaleziono.' });
          return;
        }

        const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
        const responseComplete = waitForResponse(res);

        archive.on('error', err => {
          if (!res.headersSent) res.status(500).json({ error: err.message });
          else res.destroy(err);
        });

        res.attachment(`${id}.zip`);
        archive.pipe(res);
        archive.append(JSON.stringify(mapForResponse(data, id), null, 2), { name: 'map.json' });

        const audio = await audioStorage.find(id, data);
        if (audio) archive.file(audio.fullPath, { name: audio.publicName });

        await archive.finalize();
        await responseComplete;
      });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/:id/audio', async (req, res) => {
    try {
      const id = safeId(req.params['id']);
      if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
      await withMapLock(id, async () => {
        const map = await mapStorage.read(id);
        if (!map) {
          res.status(404).json({ error: 'Mapa nie znaleziona.' });
          return;
        }
        const audio = await audioStorage.find(id, map);
        if (!audio) {
          res.status(404).json({ error: 'Audio nie znalezione.' });
          return;
        }
        const responseComplete = waitForResponse(res);
        res.type(audioStorage.mimeForFile(audio.publicName || audio.fileName));
        createReadStream(audio.fullPath)
          .on('error', err => {
            if (!res.headersSent) res.status(500).json({ error: err.message });
            else res.destroy(err);
          })
          .pipe(res);
        await responseComplete;
      });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
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
