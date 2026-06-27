import path from 'path';
import type { Express, RequestHandler } from 'express';
import JSZip from 'jszip';
import {
  MAX_BEATS_EXTENDED,
  MAX_IMPORT_BYTES,
  assertFileSize,
  normalizeMap,
  sanitizeMapId,
  validateZipEntryNames,
} from '../../src/core/map-format.js';
import type { AudioStorage, ZipAudioEntry } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';
import { errorMessage, getIp, parseJsonSafe } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface MapWriteRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
  uploadAudio: RequestHandler;
  uploadFile: RequestHandler;
  rateLimit: RateLimiter;
}

const ZIP_TIMEOUT_MS = 15_000;

type SizedZipEntry = ZipAudioEntry & { _data?: { uncompressedSize?: number } };

function zipUncompressedSize(entry: SizedZipEntry): number {
  const size = Number(entry._data?.uncompressedSize ?? 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function assertZipUncompressedLimit(entries: SizedZipEntry[]): void {
  const total = entries.reduce((sum, entry) => sum + zipUncompressedSize(entry), 0);
  if (total > MAX_IMPORT_BYTES) {
    throw new Error(`ZIP po rozpakowaniu jest za duży. Limit: ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} przekroczył limit czasu (${ms}ms).`)), ms)
    ),
  ]);
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
      const ip = getIp(req);
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
      const ip = getIp(req);
      if (rateLimit(ip, 'maps-save', 30)) {
        return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
      }

      const rawBody = req.body?.map ? parseJsonSafe(req.body.map) : req.body;
      const map = normalizeMap(rawBody, { requireBeats: false, maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      let audio = null;

      if (req.file) {
        assertFileSize(req.file);
        audio = await audioStorage.persistBuffer(map, req.file.buffer, req.file.originalname);
      } else {
        const existingAudio = await audioStorage.find(map.id, map);
        if (existingAudio) {
          map.meta = {
            ...(map.meta ?? {}),
            serverAudioFile: existingAudio.fileName,
            audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
          };
        }
      }

      await mapStorage.write(map);
      res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio?.originalName ?? null, storage: 'beatdata', map });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/maps/import', uploadFile, async (req, res) => {
    try {
      const ip = getIp(req);
      if (rateLimit(ip, 'import', 10)) {
        return res.status(429).json({ error: 'Za dużo importów. Spróbuj ponownie za chwilę.' });
      }
      if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
      assertFileSize(req.file);

      const originalName = String(req.file.originalname ?? 'map');

      if (originalName.toLowerCase().endsWith('.zip')) {
        const zip = await withTimeout(
          JSZip.loadAsync(req.file.buffer),
          ZIP_TIMEOUT_MS,
          'Parsowanie ZIP'
        );
        const entries = Object.values(zip.files) as SizedZipEntry[];
        validateZipEntryNames(entries);
        assertZipUncompressedLimit(entries);
        const jsonFile = zip.file('map.json');
        if (!jsonFile) return res.status(400).json({ error: 'Brak map.json w ZIP.' });
        const rawMapText = await jsonFile.async('string');
        if (Buffer.byteLength(rawMapText, 'utf8') > MAX_IMPORT_BYTES) {
          throw new Error(`map.json jest za duży. Limit: ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`);
        }
        const rawMap = parseJsonSafe(rawMapText);
        const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
        const audio = await audioStorage.persistZip(entries, map);
        await mapStorage.write(map);
        return res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio?.originalName ?? null, storage: 'beatdata', map });
      }

      if (!originalName.toLowerCase().endsWith('.json')) {
        return res.status(400).json({ error: 'Endpoint importuje tylko mapy .json lub .zip.' });
      }

      const rawMap = parseJsonSafe(req.file.buffer.toString('utf8'));
      const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      await mapStorage.write(map);
      res.json({ ok: true, id: map.id, beats: map.beats.length, audio: null, storage: 'beatdata', map });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/maps/:id', async (req, res) => {
    try {
      const ip = getIp(req);
      if (rateLimit(ip, 'maps-delete', 20)) {
        return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
      }
      const id = sanitizeMapId(req.params['id'], '');
      if (!id) return res.status(400).json({ error: 'Nieprawidłowe id.' });
      const deleted = await mapStorage.delete(id);
      try {
        await audioStorage.remove(id);
      } catch {
        // Audio removal failure is non-fatal
      }
      if (!deleted) return res.status(404).json({ error: 'Nie znaleziono.' });
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: 'Nie znaleziono.' });
    }
  });
}
