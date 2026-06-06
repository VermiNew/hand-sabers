import { readFile } from 'fs/promises';
import type { Express } from 'express';
import { createRequire } from 'module';
import { sanitizeMapId } from '../../src/core/map-format.js';
import type { AudioStorage } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeMapId(id: unknown): string {
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

  app.get('/api/maps/:id/export.zip', async (req, res) => {
    const id = safeMapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const data = await mapStorage.read(id);
    if (!data) return res.status(404).json({ error: 'Not found' });

    res.attachment(`${id}.zip`);
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
    archive.on('error', error => {
      if (!res.headersSent) res.status(500).json({ error: error.message });
      else res.destroy(error);
    });
    archive.pipe(res);
    archive.append(JSON.stringify(data, null, 2), { name: 'map.json' });
    const audio = await audioStorage.find(id, data);
    if (audio) archive.file(audio.fullPath, { name: audio.publicName });
    await archive.finalize();
  });

  app.get('/api/maps/:id/audio', async (req, res) => {
    try {
      const id = safeMapId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const map = await mapStorage.read(id);
      if (!map) return res.status(404).json({ error: 'Map not found' });
      const audio = await audioStorage.find(id, map);
      if (!audio) return res.status(404).json({ error: 'Audio not found' });
      const bytes = await readFile(audio.fullPath);
      res.type(audioStorage.mimeForFile(audio.publicName || audio.fileName));
      res.send(bytes);
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/maps/:id', async (req, res) => {
    try {
      const id = safeMapId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const data = await mapStorage.read(id);
      if (!data) return res.status(404).json({ error: 'Not found' });
      res.json(data);
    } catch {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.get('/api/maps/by-title/:title', async (req, res) => {
    try {
      const maps = await mapStorage.list();
      for (const item of maps) {
        const map = await mapStorage.read(item.id);
        if (!map) continue;
        if (map.meta?.title?.toLowerCase() === req.params.title.toLowerCase()) {
          return res.json(map);
        }
      }
      res.status(404).json({ error: 'Not found' });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
