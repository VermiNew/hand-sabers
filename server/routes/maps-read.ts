import { createReadStream } from 'fs';
import type { Express } from 'express';
import { createRequire } from 'module';
import { sanitizeMapId } from '../../src/core/map-format.js';
import type { AudioStorage } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';
import { errorMessage } from '../utils.js';

interface MapReadRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
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

export function registerMapReadRoutes({ app, mapStorage, audioStorage }: MapReadRoutesOptions): void {
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
        const map = await mapStorage.read(item.id);
        if (map?.meta?.title?.toLowerCase() === title) return res.json(map);
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
      const data = await mapStorage.read(id);
      if (!data) return res.status(404).json({ error: 'Nie znaleziono.' });

      const archive = new archiver.ZipArchive({ zlib: { level: 6 } });

      archive.on('error', err => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else res.destroy(err);
      });

      res.attachment(`${id}.zip`);
      archive.pipe(res);
      archive.append(JSON.stringify(data, null, 2), { name: 'map.json' });

      const audio = await audioStorage.find(id, data);
      if (audio) archive.file(audio.fullPath, { name: audio.publicName });

      await archive.finalize();
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/:id/audio', async (req, res) => {
    try {
      const id = safeId(req.params['id']);
      if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
      const map = await mapStorage.read(id);
      if (!map) return res.status(404).json({ error: 'Mapa nie znaleziona.' });
      const audio = await audioStorage.find(id, map);
      if (!audio) return res.status(404).json({ error: 'Audio nie znalezione.' });
      res.type(audioStorage.mimeForFile(audio.publicName || audio.fileName));
      createReadStream(audio.fullPath)
        .on('error', err => {
          if (!res.headersSent) res.status(500).json({ error: err.message });
          else res.destroy(err);
        })
        .pipe(res);
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/:id', async (req, res) => {
    try {
      const id = safeId(req.params['id']);
      if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
      const data = await mapStorage.read(id);
      if (!data) return res.status(404).json({ error: 'Nie znaleziono.' });
      res.json(data);
    } catch {
      res.status(404).json({ error: 'Nie znaleziono.' });
    }
  });
}
