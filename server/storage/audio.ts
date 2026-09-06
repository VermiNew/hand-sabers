import { copyFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { AUDIO_EXT_RE, MAX_IMPORT_BYTES, findPreferredAudioEntry, sanitizeMapId } from '../../src/core/map-format.js';
import { readZipEntryBytes, type ZipOutputBudget } from '../../src/core/zip-limits.js';
import type { StoredMap } from './maps.js';

export interface StoredAudio {
  fullPath: string;
  fileName: string;
  publicName: string;
}

export interface ZipAudioEntry {
  dir: boolean;
  name: string;
  async(type: 'uint8array'): Promise<Uint8Array>;
}

export interface PersistedAudio {
  originalName: string;
  storedFile: string;
  size: number;
}

export interface AudioMutation {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface AudioStorage {
  mimeForFile(fileName: string): string;
  find(id: string, map?: StoredMap | null): Promise<StoredAudio | null>;
  beginMutation(id: string): Promise<AudioMutation>;
  remove(id: string, keepFullPath?: string | null): Promise<number>;
  persistBuffer(map: StoredMap, buffer: Uint8Array, originalName?: string): Promise<PersistedAudio>;
  persistFile(map: StoredMap, sourcePath: string, originalName?: string): Promise<PersistedAudio>;
  persistZip(entries: ZipAudioEntry[], map: StoredMap, outputBudget: ZipOutputBudget): Promise<PersistedAudio | null>;
}

interface AudioStorageOptions {
  audioDir: string;
  legacyAudioDir: string;
  caseInsensitiveIds?: boolean;
}

async function replaceFile(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== 'win32' || (code !== 'EEXIST' && code !== 'EPERM')) throw error;
    await unlink(destinationPath).catch(unlinkError => {
      if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError;
    });
    await rename(sourcePath, destinationPath);
  }
}

const AUDIO_MIME_BY_EXT = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.flac', 'audio/flac'],
]);

function safeStoredAudioName(name: unknown): string {
  const base = path.basename(String(name || ''));
  return /^[a-zA-Z0-9_-]+\.(mp3|ogg|wav|flac)$/i.test(base) ? base : '';
}

export function createAudioStorage({ audioDir, legacyAudioDir, caseInsensitiveIds = false }: AudioStorageOptions): AudioStorage {
  const directories = [audioDir, legacyAudioDir];
  const matchesId = (fileName: string, id: string): boolean => {
    const prefix = `${id}.`;
    return caseInsensitiveIds
      ? fileName.toLowerCase().startsWith(prefix.toLowerCase())
      : fileName.startsWith(prefix);
  };

  const matchingPaths = async (id: string): Promise<string[]> => {
    const safeId = sanitizeMapId(id, '');
    if (!safeId) return [];
    const matches: string[] = [];
    for (const dir of directories) {
      let files: string[];
      try {
        files = await readdir(dir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      for (const fileName of files) {
        if (matchesId(fileName, safeId) && AUDIO_EXT_RE.test(fileName)) {
          matches.push(path.resolve(dir, fileName));
        }
      }
    }
    return matches;
  };

  const storage: AudioStorage = {
    mimeForFile(fileName: string): string {
      return AUDIO_MIME_BY_EXT.get(path.extname(fileName || '').toLowerCase()) || 'application/octet-stream';
    },

    async find(id: string, map: StoredMap | null = null): Promise<StoredAudio | null> {
      const stored = safeStoredAudioName(map?.meta?.serverAudioFile);
      const candidates: Array<{ dir: string; fileName: string }> = [];

      if (stored && matchesId(stored, id)) {
        candidates.push({ dir: audioDir, fileName: stored });
        candidates.push({ dir: legacyAudioDir, fileName: stored });
      }

      for (const dir of directories) {
        try {
          const files = await readdir(dir);
          for (const fileName of files) {
            if (matchesId(fileName, id) && AUDIO_EXT_RE.test(fileName)) {
              candidates.push({ dir, fileName });
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }

      for (const candidate of candidates) {
        const fullPath = path.join(candidate.dir, candidate.fileName);
        if (existsSync(fullPath)) {
          return {
            fullPath,
            fileName: candidate.fileName,
            publicName: path.posix.basename(String(map?.meta?.audioFile || candidate.fileName)),
          };
        }
      }

      return null;
    },

    async beginMutation(id: string): Promise<AudioMutation> {
      const backups: Array<{ originalPath: string; backupPath: string }> = [];
      try {
        for (const originalPath of await matchingPaths(id)) {
          const backupPath = `${originalPath}.${process.pid}.${randomUUID()}.rollback`;
          await copyFile(originalPath, backupPath);
          backups.push({ originalPath, backupPath });
        }
      } catch (error) {
        const cleanupErrors: unknown[] = [];
        for (const backup of backups) {
          try {
            await unlink(backup.backupPath);
          } catch (cleanupError) {
            if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') cleanupErrors.push(cleanupError);
          }
        }
        if (cleanupErrors.length) console.error(`Audio backup cleanup failed for ${id}:`, cleanupErrors);
        throw error;
      }

      let finished = false;
      return {
        async commit(): Promise<void> {
          if (finished) return;
          const cleanupErrors: unknown[] = [];
          for (const backup of backups) {
            try {
              await unlink(backup.backupPath);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') cleanupErrors.push(error);
            }
          }
          finished = true;
          if (cleanupErrors.length) console.error(`Audio backup cleanup failed for ${id}:`, cleanupErrors);
        },
        async rollback(): Promise<void> {
          if (finished) return;
          const rollbackErrors: unknown[] = [];
          const blockedPaths = new Set<string>();
          const pathKey = (filePath: string): string => caseInsensitiveIds ? filePath.toLowerCase() : filePath;
          for (const currentPath of await matchingPaths(id)) {
            try {
              await unlink(currentPath);
            } catch (error) {
              rollbackErrors.push(error);
              blockedPaths.add(pathKey(currentPath));
            }
          }
          for (const backup of backups) {
            if (blockedPaths.has(pathKey(backup.originalPath))) continue;
            try {
              await rename(backup.backupPath, backup.originalPath);
            } catch (error) {
              rollbackErrors.push(error);
            }
          }
          finished = true;
          if (rollbackErrors.length) {
            throw new AggregateError(rollbackErrors, `Nie udało się w pełni przywrócić audio mapy ${id}.`);
          }
        },
      };
    },

    async remove(id: string, keepFullPath: string | null = null): Promise<number> {
      const safeId = sanitizeMapId(id, '');
      if (!safeId) return 0;
      let removed = 0;
      const keep = keepFullPath ? path.resolve(keepFullPath) : null;

      for (const fullPath of await matchingPaths(safeId)) {
        if (keep && fullPath === keep) continue;
        await unlink(fullPath);
        removed++;
      }

      return removed;
    },

    async persistBuffer(map: StoredMap, buffer: Uint8Array, originalName = 'audio.ogg'): Promise<PersistedAudio> {
      const cleanName = path.basename(String(originalName || 'audio.ogg'));
      const ext = path.extname(cleanName).toLowerCase();
      if (!AUDIO_EXT_RE.test(cleanName)) {
        throw new Error('Nieobsługiwany format audio. Dozwolone: mp3, ogg, wav, flac.');
      }
      if (buffer.byteLength > MAX_IMPORT_BYTES) {
        throw new Error(`Audio jest za duże. Limit: ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`);
      }

      const storedFile = `${map.id}${ext}`;
      const storedPath = path.join(audioDir, storedFile);
      const tmpPath = `${storedPath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(tmpPath, Buffer.from(buffer));
        await replaceFile(tmpPath, storedPath);
      } finally {
        await unlink(tmpPath).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Audio temporary file cleanup failed for ${map.id}:`, error);
          }
        });
      }
      await storage.remove(map.id, storedPath);

      map.meta = {
        ...(map.meta || {}),
        audioFile: cleanName,
        serverAudioFile: storedFile,
        audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
      };

      return { originalName: cleanName, storedFile, size: buffer.byteLength };
    },

    async persistFile(map: StoredMap, sourcePath: string, originalName = 'audio.ogg'): Promise<PersistedAudio> {
      const cleanName = path.basename(String(originalName || 'audio.ogg'));
      const ext = path.extname(cleanName).toLowerCase();
      if (!AUDIO_EXT_RE.test(cleanName)) {
        throw new Error('Nieobsługiwany format audio. Dozwolone: mp3, ogg, wav, flac.');
      }

      const size = (await stat(sourcePath)).size;
      if (size > MAX_IMPORT_BYTES) {
        throw new Error(`Audio jest za duże. Limit: ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`);
      }

      const storedFile = `${map.id}${ext}`;
      const storedPath = path.join(audioDir, storedFile);
      await replaceFile(sourcePath, storedPath);
      await storage.remove(map.id, storedPath);

      map.meta = {
        ...(map.meta || {}),
        audioFile: cleanName,
        serverAudioFile: storedFile,
        audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
      };

      return { originalName: cleanName, storedFile, size };
    },

    async persistZip(entries: ZipAudioEntry[], map: StoredMap, outputBudget: ZipOutputBudget): Promise<PersistedAudio | null> {
      const audioFile = findPreferredAudioEntry(entries, map.meta?.audioFile);
      if (!audioFile) return null;

      const originalName = path.posix.basename(audioFile.name);
      const audioBytes = await readZipEntryBytes(audioFile, outputBudget);
      return await storage.persistBuffer(map, audioBytes, originalName);
    },
  };

  return storage;
}
