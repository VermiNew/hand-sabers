import { readFile, writeFile } from 'fs/promises';

export interface ScoreEntry {
  mapId: string;
  player: string;
  score: number;
  combo: number;
  date: string;
}

export interface ScoreStorage {
  read(): Promise<ScoreEntry[]>;
  write(scores: ScoreEntry[]): Promise<void>;
}

export function createScoreStorage(filePath: string): ScoreStorage {
  return {
    async read(): Promise<ScoreEntry[]> {
      try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
        return Array.isArray(parsed) ? parsed as ScoreEntry[] : [];
      } catch {
        return [];
      }
    },

    async write(scores: ScoreEntry[]): Promise<void> {
      await writeFile(filePath, JSON.stringify(scores, null, 2));
    },
  };
}
