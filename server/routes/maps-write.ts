import path from 'path';
import { readFile, unlink } from 'fs/promises';
import type { Express, Request, RequestHandler } from 'express';
import JSZip from 'jszip';
import {
  MAX_BEATS_EXTENDED,
  MAX_IMPORT_BYTES,
  assertFileSize,
  normalizeMap,
  sanitizeMapId,
  validateZipEntryNames,
} from '../../src/core/map-format.js';
import type { AudioMutation, AudioStorage, ZipAudioEntry } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';
import { errorMessage, getIp, parseJsonSafe, type KeyedMutex } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface MapWriteRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
  mapAssetLocks: KeyedMutex;
  uploadAudio: RequestHandler;
  uploadFile: RequestHandler;
  uploadConcurrency: RequestHandler;
  releaseUploadConcurrency(req: Request): void;
  parseJson: RequestHandler;
  rateLimit: RateLimiter;
}

const ZIP_TIMEOUT_MS = 15_000;

type SizedZipEntry = ZipAudioEntry & { _data?: { uncompressedSize?: number } };

function createWriteRateLimit(
  rateLimit: RateLimiter,
  key: string,
  maxPerMinute: number,
  message: string,
): RequestHandler {
  return (req, res, next) => {
    if (rateLimit(getIp(req), key, maxPerMinute)) {
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}

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

async function removeUploadedFile(file: Express.Multer.File | undefined): Promise<void> {
  if (!file?.path) return;
  try {
    await unlink(file.path);
  } catch {}
}

export function registerMapWriteRoutes({
  app,
  mapStorage,
  audioStorage,
  mapAssetLocks,
  uploadAudio,
  uploadFile,
  uploadConcurrency,
  releaseUploadConcurrency,
  parseJson,
  rateLimit,
}: MapWriteRoutesOptions): void {
  const withMapLock = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const release = await mapAssetLocks.acquire(id.toLowerCase());
    try {
      return await operation();
    } finally {
      release();
    }
  };
  const withAudioRollback = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const mutation = await audioStorage.beginMutation(id);
    try {
      const result = await operation();
      await mutation.commit();
      return result;
    } catch (error) {
      try {
        await mutation.rollback();
      } catch (rollbackError) {
        console.error(`Map audio rollback failed for ${id}:`, rollbackError);
        throw new Error(`Nie udało się przywrócić audio mapy ${id}.`, { cause: error });
      }
      throw error;
    }
  };
  const withAssetRollback = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const mapMutation = await mapStorage.beginMutation(id);
    let audioMutation: AudioMutation;
    try {
      audioMutation = await audioStorage.beginMutation(id);
    } catch (error) {
      await mapMutation.commit();
      throw error;
    }
    try {
      const result = await operation();
      await mapMutation.commit();
      await audioMutation.commit();
      return result;
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      try { await mapMutation.rollback(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      try { await audioMutation.rollback(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      if (rollbackErrors.length) {
        console.error(`Map asset rollback failed for ${id}:`, rollbackErrors);
        throw new Error(`Nie udało się przywrócić plików mapy ${id}.`, { cause: error });
      }
      throw error;
    }
  };
  const limitMapSave = createWriteRateLimit(
    rateLimit,
    'maps-save',
    30,
    'Za dużo żądań. Spróbuj ponownie za chwilę.',
  );
  const limitMapImport = createWriteRateLimit(
    rateLimit,
    'import',
    10,
    'Za dużo importów. Spróbuj ponownie za chwilę.',
  );

  app.post('/api/maps', limitMapSave, uploadConcurrency, parseJson, async (req, res) => {
    try {
      const map = normalizeMap(req.body, { maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      await withMapLock(map.id, () => mapStorage.write(map));
      res.json({ ok: true, id: map.id, beats: map.beats.length, storage: 'beatdata' });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    } finally {
      releaseUploadConcurrency(req);
    }
  });

  app.post('/api/maps/save', limitMapSave, uploadConcurrency, parseJson, uploadAudio, async (req, res) => {
    try {
      const rawBody = req.body?.map ? parseJsonSafe(req.body.map) : req.body;
      const map = normalizeMap(rawBody, { requireBeats: false, maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      const audio = await withMapLock(map.id, async () => {
        let persistedAudio = null;
        if (req.file) {
          assertFileSize(req.file);
          persistedAudio = await withAudioRollback(map.id, async () => {
            const audio = await audioStorage.persistFile(map, req.file!.path, req.file!.originalname);
            await mapStorage.write(map);
            return audio;
          });
          return persistedAudio;
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
        return persistedAudio;
      });
      res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio?.originalName ?? null, storage: 'beatdata', map });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    } finally {
      await removeUploadedFile(req.file);
      releaseUploadConcurrency(req);
    }
  });

  app.post('/api/maps/import', limitMapImport, uploadConcurrency, uploadFile, async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
      assertFileSize(req.file);

      const originalName = String(req.file.originalname ?? 'map');
      const uploadedBytes = await readFile(req.file.path);

      if (originalName.toLowerCase().endsWith('.zip')) {
        const zip = await withTimeout(
          JSZip.loadAsync(uploadedBytes),
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
        const audio = await withMapLock(map.id, () => withAudioRollback(map.id, async () => {
          const persistedAudio = await audioStorage.persistZip(entries, map);
          await mapStorage.write(map);
          return persistedAudio;
        }));
        return res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio?.originalName ?? null, storage: 'beatdata', map });
      }

      if (!originalName.toLowerCase().endsWith('.json')) {
        return res.status(400).json({ error: 'Endpoint importuje tylko mapy .json lub .zip.' });
      }

      const rawMap = parseJsonSafe(uploadedBytes.toString('utf8'));
      const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      await withMapLock(map.id, () => mapStorage.write(map));
      res.json({ ok: true, id: map.id, beats: map.beats.length, audio: null, storage: 'beatdata', map });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    } finally {
      await removeUploadedFile(req.file);
      releaseUploadConcurrency(req);
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
      const deleted = await withMapLock(id, () => withAssetRollback(id, async () => {
        const removed = await mapStorage.delete(id);
        await audioStorage.remove(id);
        return removed;
      }));
      if (!deleted) return res.status(404).json({ error: 'Nie znaleziono.' });
      res.json({ ok: true });
    } catch (error) {
      console.error('Map deletion failed:', error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
