import { readdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import type { GameMap } from '../../src/types/index.js';

export type StoredMap = GameMap & Record<string, unknown>;

export interface StoredMapFile {
  id: string;
  filename: string;
  storage: 'beatdata' | 'legacy';
}

export interface MapStorage {
  read(id: string): Promise<StoredMap | null>;
  write(map: StoredMap): Promise<void>;
  list(): Promise<StoredMapFile[]>;
  delete(id: string): Promise<boolean>;
}

interface MapStorageOptions {
  mapsDir: string;
  beatdataDir: string;
  hiddenIds?: Iterable<string>;
}

function isMapFile(name: string): boolean {
  return name.endsWith('.json') && !name.startsWith('_');
}

async function readJsonFile(filePath: string): Promise<StoredMap | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as StoredMap;
  } catch {
    return null;
  }
}

export function createMapStorage({ mapsDir, beatdataDir, hiddenIds = [] }: MapStorageOptions): MapStorage {
  const hiddenMapIds = new Set(hiddenIds);
  const isHidden = (id: string): boolean => hiddenMapIds.has(id) || id.startsWith('__smoke-');
  const mapFilePath = (id: string): string => path.join(beatdataDir, `${id}.json`);
  const legacyMapFilePath = (id: string): string => path.join(mapsDir, `${id}.json`);

  return {
    async read(id: string): Promise<StoredMap | null> {
      return await readJsonFile(mapFilePath(id)) || await readJsonFile(legacyMapFilePath(id));
    },

    async write(map: StoredMap): Promise<void> {
      await writeFile(mapFilePath(map.id), JSON.stringify(map, null, 2));
    },

    async list(): Promise<StoredMapFile[]> {
      const files: StoredMapFile[] = [];
      const seen = new Set<string>();

      try {
        for (const fileName of (await readdir(beatdataDir)).filter(isMapFile)) {
          const id = fileName.replace('.json', '');
          if (isHidden(id)) continue;
          seen.add(id);
          files.push({ id, filename: fileName, storage: 'beatdata' });
        }
      } catch {}

      try {
        for (const fileName of (await readdir(mapsDir)).filter(isMapFile)) {
          const id = fileName.replace('.json', '');
          if (seen.has(id) || isHidden(id)) continue;
          files.push({ id, filename: fileName, storage: 'legacy' });
        }
      } catch {}

      files.sort((a, b) => a.id.localeCompare(b.id));
      return files;
    },

    async delete(id: string): Promise<boolean> {
      let deleted = false;
      for (const filePath of [mapFilePath(id), legacyMapFilePath(id)]) {
        try {
          await unlink(filePath);
          deleted = true;
        } catch {}
      }
      return deleted;
    },
  };
}
