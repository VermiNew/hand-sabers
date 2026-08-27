import {
  suggestMapDifficulty,
  type DifficultyBeat,
  type MapDifficulty,
} from '../core/map-difficulty.ts';
import type { GameMode } from '../types/index.js';

interface DifficultyProfileMap {
  meta?: { difficulty?: unknown; duration?: unknown; bpm?: unknown };
  beats?: readonly DifficultyBeat[] | null;
}

interface DifficultyProfileSettings {
  gameMode?: GameMode;
  trainingMode?: boolean;
}

export interface DifficultyHitProfile {
  difficulty: MapDifficulty;
  hitRadiusMultiplier: number;
  minimumSwingMultiplier: number;
  perfectRadius: number;
  perfectTimingMs: number;
  goodTimingMs: number;
  heldRadius: number;
  heldMissGraceSec: number;
}

const PROFILES: Record<MapDifficulty, DifficultyHitProfile> = {
  easy: {
    difficulty: 'easy',
    hitRadiusMultiplier: 1.12,
    minimumSwingMultiplier: 0.85,
    perfectRadius: 0.24,
    perfectTimingMs: 90,
    goodTimingMs: 190,
    heldRadius: 0.60,
    heldMissGraceSec: 0.65,
  },
  medium: {
    difficulty: 'medium',
    hitRadiusMultiplier: 1,
    minimumSwingMultiplier: 1,
    perfectRadius: 0.22,
    perfectTimingMs: 70,
    goodTimingMs: 150,
    heldRadius: 0.55,
    heldMissGraceSec: 0.45,
  },
  hard: {
    difficulty: 'hard',
    hitRadiusMultiplier: 0.96,
    minimumSwingMultiplier: 1.05,
    perfectRadius: 0.21,
    perfectTimingMs: 65,
    goodTimingMs: 135,
    heldRadius: 0.52,
    heldMissGraceSec: 0.38,
  },
  expert: {
    difficulty: 'expert',
    hitRadiusMultiplier: 0.92,
    minimumSwingMultiplier: 1.12,
    perfectRadius: 0.19,
    perfectTimingMs: 55,
    goodTimingMs: 120,
    heldRadius: 0.49,
    heldMissGraceSec: 0.32,
  },
};

function declaredDifficulty(value: unknown): MapDifficulty | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'easy' || normalized === 'medium' || normalized === 'hard' || normalized === 'expert'
    ? normalized
    : null;
}

function mapDifficulty(map: DifficultyProfileMap | null | undefined): MapDifficulty {
  const suggestion = map?.beats?.length
    ? suggestMapDifficulty({
      ...(map.meta ? { meta: map.meta } : {}),
      beats: map.beats,
    })
    : null;
  return suggestion?.difficulty ?? declaredDifficulty(map?.meta?.difficulty) ?? 'medium';
}

export function getDifficultyHitProfile(
  map: DifficultyProfileMap | null | undefined,
  settings: DifficultyProfileSettings = {},
): DifficultyHitProfile {
  if (settings.trainingMode) return PROFILES.easy;
  if (settings.gameMode === 'pro') return PROFILES.expert;

  const difficulty = mapDifficulty(map);
  if (settings.gameMode === 'speed-trials' && (difficulty === 'easy' || difficulty === 'medium')) {
    return PROFILES.hard;
  }
  return PROFILES[difficulty];
}
