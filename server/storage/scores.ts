import { readFile, rename, writeFile } from 'fs/promises';
import { FileMutex } from '../utils.js';

export interface ScoreEntry {
  mapId: string;
  player: string;
  score: number;
  combo: number;
  date: string;
  progress?: number;
}

export interface ScoreStorage {
  read(): Promise<ScoreEntry[]>;
  append(entry: ScoreEntry): Promise<void>;
}

export function createScoreStorage(filePath: string): ScoreStorage {
  const mutex = new FileMutex();

  async function readRaw(): Promise<ScoreEntry[]> {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
      return Array.isArray(parsed) ? (parsed as ScoreEntry[]) : [];
    } catch {
      return [];
    }
  }

  return {
    read: readRaw,

    async append(entry: ScoreEntry): Promise<void> {
      const release = await mutex.acquire();
      try {
        const scores = await readRaw();
        scores.push(entry);
        scores.sort((a, b) => b.score - a.score);
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmpPath, JSON.stringify(scores.slice(0, 1000), null, 2));
        await rename(tmpPath, filePath);
      } finally {
        release();
      }
    },
  };
}
