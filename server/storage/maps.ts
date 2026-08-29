import { copyFile, readdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import type { GameMap } from '../../src/types/index.js';

export type StoredMap = GameMap & Record<string, unknown>;

export interface StoredMapFile {
  id: string;
  filename: string;
  storage: 'beatdata' | 'legacy';
}

export interface MapMutation {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface MapStorage {
  read(id: string): Promise<StoredMap | null>;
  beginMutation(id: string): Promise<MapMutation>;
  write(map: StoredMap): Promise<void>;
  list(): Promise<StoredMapFile[]>;
  delete(id: string): Promise<boolean>;
}

interface MapStorageOptions {
  mapsDir: string;
  beatdataDir: string;
  hiddenIds?: Iterable<string>;
  caseInsensitiveIds?: boolean;
}

function isMapFile(name: string): boolean {
  return name.endsWith('.json') && !name.startsWith('_');
}

async function readJsonFile(filePath: string): Promise<StoredMap | null> {
  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(source) as StoredMap;
  } catch (error) {
    throw new Error(`Nieprawidłowy plik mapy ${path.basename(filePath)}.`, { cause: error });
  }
}

export function createMapStorage({ mapsDir, beatdataDir, hiddenIds = [], caseInsensitiveIds = false }: MapStorageOptions): MapStorage {
  const idKey = (id: string): string => caseInsensitiveIds ? id.toLowerCase() : id;
  const hiddenMapIds = new Set(Array.from(hiddenIds, idKey));
  const isHidden = (id: string): boolean => hiddenMapIds.has(idKey(id)) || idKey(id).startsWith('__smoke-');
  const mapFilePath = (id: string): string => path.join(beatdataDir, `${id}.json`);
  const legacyMapFilePath = (id: string): string => path.join(mapsDir, `${id}.json`);

  return {
    async read(id: string): Promise<StoredMap | null> {
      return await readJsonFile(mapFilePath(id)) || await readJsonFile(legacyMapFilePath(id));
    },

    async beginMutation(id: string): Promise<MapMutation> {
      const backups: Array<{ originalPath: string; backupPath: string }> = [];
      try {
        for (const originalPath of [mapFilePath(id), legacyMapFilePath(id)]) {
          const backupPath = `${originalPath}.${process.pid}.${randomUUID()}.rollback`;
          try {
            await copyFile(originalPath, backupPath);
            backups.push({ originalPath, backupPath });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
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
        if (cleanupErrors.length) console.error(`Map backup cleanup failed for ${id}:`, cleanupErrors);
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
          if (cleanupErrors.length) console.error(`Map backup cleanup failed for ${id}:`, cleanupErrors);
        },
        async rollback(): Promise<void> {
          if (finished) return;
          const rollbackErrors: unknown[] = [];
          const backupsByPath = new Map(backups.map(backup => [backup.originalPath, backup]));
          for (const currentPath of [mapFilePath(id), legacyMapFilePath(id)]) {
            try {
              await unlink(currentPath);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                rollbackErrors.push(error);
                continue;
              }
            }
            const backup = backupsByPath.get(currentPath);
            if (backup) {
              try {
                await rename(backup.backupPath, backup.originalPath);
              } catch (error) {
                rollbackErrors.push(error);
              }
            }
          }
          finished = true;
          if (rollbackErrors.length) {
            throw new AggregateError(rollbackErrors, `Nie udało się w pełni przywrócić plików mapy ${id}.`);
          }
        },
      };
    },

    async write(map: StoredMap): Promise<void> {
      const finalPath = mapFilePath(map.id);
      const tmpPath = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(tmpPath, JSON.stringify(map, null, 2));
        await rename(tmpPath, finalPath);
      } finally {
        await unlink(tmpPath).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Map temporary file cleanup failed for ${map.id}:`, error);
          }
        });
      }
    },

    async list(): Promise<StoredMapFile[]> {
      const files: StoredMapFile[] = [];
      const seen = new Set<string>();

      try {
        for (const fileName of (await readdir(beatdataDir)).filter(isMapFile)) {
          const id = fileName.replace('.json', '');
          if (isHidden(id)) continue;
          seen.add(idKey(id));
          files.push({ id, filename: fileName, storage: 'beatdata' });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      try {
        for (const fileName of (await readdir(mapsDir)).filter(isMapFile)) {
          const id = fileName.replace('.json', '');
          if (seen.has(idKey(id)) || isHidden(id)) continue;
          files.push({ id, filename: fileName, storage: 'legacy' });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      files.sort((a, b) => a.id.localeCompare(b.id));
      return files;
    },

    async delete(id: string): Promise<boolean> {
      let deleted = false;
      for (const filePath of [mapFilePath(id), legacyMapFilePath(id)]) {
        try {
          await unlink(filePath);
          deleted = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      return deleted;
    },
  };
}
