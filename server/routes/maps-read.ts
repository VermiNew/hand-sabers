import { readFile } from 'fs/promises';
import type { Express } from 'express';
import { sanitizeMapId } from '../../src/core/map-format.js';
import type { AudioStorage } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';

interface MapReadRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
}

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
