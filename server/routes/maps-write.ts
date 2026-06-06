import path from 'path';
import type { Express, RequestHandler } from 'express';
import JSZip from 'jszip';
import {
  MAX_BEATS_EXTENDED,
  assertFileSize,
  normalizeMap,
  sanitizeMapId,
  validateZipEntryNames,
} from '../../src/core/map-format.js';
import type { AudioStorage, ZipAudioEntry } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface MapWriteRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
  uploadAudio: RequestHandler;
  uploadFile: RequestHandler;
  rateLimit: RateLimiter;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeMapId(id: unknown): string {
  return sanitizeMapId(id, '');
}

export function registerMapWriteRoutes({
  app,
  mapStorage,
  audioStorage,
  uploadAudio,
  uploadFile,
  rateLimit,
}: MapWriteRoutesOptions): void {
  app.post('/api/maps', async (req, res) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      if (rateLimit(ip, 'maps-save', 30)) {
        return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
      }
      const map = normalizeMap(req.body, { maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      await mapStorage.write(map);
      res.json({ ok: true, id: map.id, beats: map.beats.length, storage: 'beatdata' });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/maps/save', uploadAudio, async (req, res) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      if (rateLimit(ip, 'maps-save', 30)) {
        return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
      }
      const raw = req.body?.map ? JSON.parse(req.body.map) : req.body;
      const map = normalizeMap(raw, { requireBeats: false, maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      let audio = null;

      if (req.file) {
        assertFileSize(req.file);
        audio = await audioStorage.persistBuffer(map, req.file.buffer, req.file.originalname);
      } else {
        const existingAudio = await audioStorage.find(map.id, map);
        if (existingAudio) {
          map.meta = {
            ...(map.meta || {}),
            serverAudioFile: existingAudio.fileName,
            audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
          };
        }
      }

      await mapStorage.write(map);
      res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio ? audio.originalName : null, storage: 'beatdata', map });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/maps/import', uploadFile, async (req, res) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      if (rateLimit(ip, 'import', 10)) {
        return res.status(429).json({ error: 'Za dużo importów. Spróbuj ponownie za chwilę.' });
      }
      if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
      assertFileSize(req.file);

      const originalName = String(req.file.originalname || 'map');
      let rawMap;

      if (originalName.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(req.file.buffer);
        const entries = Object.values(zip.files) as ZipAudioEntry[];
        validateZipEntryNames(entries);
        const jsonFile = zip.file('map.json');
        if (!jsonFile) return res.status(400).json({ error: 'Brak map.json w ZIP.' });
        rawMap = JSON.parse(await jsonFile.async('string'));
        const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
        const audio = await audioStorage.persistZip(entries, map);
        await mapStorage.write(map);
        return res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio ? audio.originalName : null, storage: 'beatdata', map });
      }

      if (!originalName.toLowerCase().endsWith('.json')) {
        return res.status(400).json({ error: 'Endpoint importuje tylko mapy .json lub .zip.' });
      }

      rawMap = JSON.parse(req.file.buffer.toString('utf8'));
      const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      await mapStorage.write(map);
      res.json({ ok: true, id: map.id, beats: map.beats.length, audio: null, storage: 'beatdata', map });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/maps/:id', async (req, res) => {
    try {
      const id = safeMapId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const deleted = await mapStorage.delete(id);
      await audioStorage.remove(id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: 'Not found' });
    }
  });
}
