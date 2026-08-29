import path from 'path';
import { readFile, unlink } from 'fs/promises';
import type { Express, Request, RequestHandler } from 'express';
import JSZip from 'jszip';
import {
  MAX_BEATS_EXTENDED,
  assertFileSize,
  normalizeMap,
  sanitizeMapId,
  validateZipEntryNames,
} from '../../src/core/map-format.js';
import {
  assertZipDeclaredLimits,
  createZipOutputBudget,
  readZipEntryText,
} from '../../src/core/zip-limits.js';
import type { AudioMutation, AudioStorage, ZipAudioEntry } from '../storage/audio.js';
import type { MapStorage } from '../storage/maps.js';
import { errorMessage, getIp, parseJsonSafe, type FileMutex, type KeyedMutex } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface MapWriteRoutesOptions {
  app: Express;
  mapStorage: MapStorage;
  audioStorage: AudioStorage;
  mapAssetLocks: KeyedMutex;
  mapCatalogLock: FileMutex;
  uploadAudio: RequestHandler;
  uploadFile: RequestHandler;
  uploadConcurrency: RequestHandler;
  releaseUploadConcurrency(req: Request): void;
  parseJson: RequestHandler;
  rateLimit: RateLimiter;
}

const ZIP_TIMEOUT_MS = 15_000;

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} przekroczył limit czasu (${ms}ms).`)), ms)
    ),
  ]);
}

function mapWriteErrorStatus(error: unknown): 400 | 500 {
  if (!(error instanceof Error)) return 400;
  if (error.message.startsWith('Nie udało się przywrócić')) return 500;
  const code = (error as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && code.startsWith('E')) return 500;
  return error.cause ? mapWriteErrorStatus(error.cause) : 400;
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
  mapCatalogLock,
  uploadAudio,
  uploadFile,
  uploadConcurrency,
  releaseUploadConcurrency,
  parseJson,
  rateLimit,
}: MapWriteRoutesOptions): void {
  const withMapLock = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const release = await mapAssetLocks.acquire(id);
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
      res.status(mapWriteErrorStatus(error)).json({ error: errorMessage(error) });
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
      res.status(mapWriteErrorStatus(error)).json({ error: errorMessage(error) });
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
        const entries = Object.values(zip.files) as ZipAudioEntry[];
        validateZipEntryNames(entries);
        assertZipDeclaredLimits(entries);
        const outputBudget = createZipOutputBudget();
        const jsonFile = zip.file('map.json');
        if (!jsonFile) return res.status(400).json({ error: 'Brak map.json w ZIP.' });
        const rawMapText = await withTimeout(
          readZipEntryText(jsonFile, outputBudget),
          ZIP_TIMEOUT_MS,
          'Rozpakowywanie map.json',
        );
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
      res.status(mapWriteErrorStatus(error)).json({ error: errorMessage(error) });
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
      const releaseCatalog = await mapCatalogLock.acquire();
      let deleted: boolean;
      try {
        deleted = await withMapLock(id, () => withAssetRollback(id, async () => {
          const removed = await mapStorage.delete(id);
          if (!removed) return false;
          await audioStorage.remove(id);
          return true;
        }));
      } finally {
        releaseCatalog();
      }
      if (!deleted) return res.status(404).json({ error: 'Nie znaleziono.' });
      res.json({ ok: true });
    } catch (error) {
      console.error('Map deletion failed:', error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
