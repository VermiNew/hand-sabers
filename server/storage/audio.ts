import { readdir, rename, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { AUDIO_EXT_RE, MAX_IMPORT_BYTES, findPreferredAudioEntry, sanitizeMapId } from '../../src/core/map-format.js';
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

export interface AudioStorage {
  mimeForFile(fileName: string): string;
  find(id: string, map?: StoredMap | null): Promise<StoredAudio | null>;
  remove(id: string, keepFullPath?: string | null): Promise<number>;
  persistBuffer(map: StoredMap, buffer: Uint8Array, originalName?: string): Promise<PersistedAudio>;
  persistZip(entries: ZipAudioEntry[], map: StoredMap): Promise<PersistedAudio | null>;
}

interface AudioStorageOptions {
  audioDir: string;
  legacyAudioDir: string;
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

export function createAudioStorage({ audioDir, legacyAudioDir }: AudioStorageOptions): AudioStorage {
  const directories = [audioDir, legacyAudioDir];

  const storage: AudioStorage = {
    mimeForFile(fileName: string): string {
      return AUDIO_MIME_BY_EXT.get(path.extname(fileName || '').toLowerCase()) || 'application/octet-stream';
    },

    async find(id: string, map: StoredMap | null = null): Promise<StoredAudio | null> {
      const stored = safeStoredAudioName(map?.meta?.serverAudioFile);
      const candidates: Array<{ dir: string; fileName: string }> = [];

      if (stored && stored.startsWith(`${id}.`)) {
        candidates.push({ dir: audioDir, fileName: stored });
        candidates.push({ dir: legacyAudioDir, fileName: stored });
      }

      for (const dir of directories) {
        try {
          const files = await readdir(dir);
          for (const fileName of files) {
            if (fileName.startsWith(`${id}.`) && AUDIO_EXT_RE.test(fileName)) {
              candidates.push({ dir, fileName });
            }
          }
        } catch {}
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

    async remove(id: string, keepFullPath: string | null = null): Promise<number> {
      const safeId = sanitizeMapId(id, '');
      if (!safeId) return 0;
      let removed = 0;
      const keep = keepFullPath ? path.resolve(keepFullPath) : null;

      for (const dir of directories) {
        try {
          const files = await readdir(dir);
          for (const fileName of files) {
            if (!fileName.startsWith(`${safeId}.`) || !AUDIO_EXT_RE.test(fileName)) continue;
            const fullPath = path.resolve(dir, fileName);
            if (keep && fullPath === keep) continue;
            try {
              await unlink(fullPath);
              removed++;
            } catch {}
          }
        } catch {}
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
      const tmpPath = `${storedPath}.${process.pid}.${Date.now()}.tmp`;
      await storage.remove(map.id, storedPath);
      await writeFile(tmpPath, Buffer.from(buffer));
      await rename(tmpPath, storedPath);

      map.meta = {
        ...(map.meta || {}),
        audioFile: cleanName,
        serverAudioFile: storedFile,
        audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
      };

      return { originalName: cleanName, storedFile, size: buffer.byteLength };
    },

    async persistZip(entries: ZipAudioEntry[], map: StoredMap): Promise<PersistedAudio | null> {
      const audioFile = findPreferredAudioEntry(entries, map.meta?.audioFile);
      if (!audioFile) return null;

      const originalName = path.posix.basename(audioFile.name);
      const audioBytes = Buffer.from(await audioFile.async('uint8array'));
      return await storage.persistBuffer(map, audioBytes, originalName);
    },
  };

  return storage;
}
