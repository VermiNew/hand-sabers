import type { GameState } from './state.ts';

const STORAGE_KEY = 'hs_achievements';

export interface AchievementDef {
  id: string;
  icon: string;
  check: (stats: AchievementStats) => boolean;
}

export interface AchievementStats {
  totalGames: number;
  totalHits: number;
  totalMisses: number;
  totalScore: number;
  maxCombo: number;
  perfectHits: number;
  mapsCompleted: number;
  bombHits: number;
  totalPlayTimeMs: number;
  milestonesReached: number;
  gamesWon: number;
  gamesLost: number;
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_game',
    icon: 'play_circle',
    check: s => s.totalGames >= 1,
  },
  {
    id: 'ten_games',
    icon: 'repeat',
    check: s => s.totalGames >= 10,
  },
  {
    id: 'fifty_games',
    icon: 'stars',
    check: s => s.totalGames >= 50,
  },
  {
    id: 'first_hit',
    icon: 'check_circle',
    check: s => s.totalHits >= 1,
  },
  {
    id: 'hundred_hits',
    icon: 'trackpad',
    check: s => s.totalHits >= 100,
  },
  {
    id: 'thousand_hits',
    icon: 'flash_on',
    check: s => s.totalHits >= 1000,
  },
  {
    id: 'combo_50',
    icon: 'social_leaderboard',
    check: s => s.maxCombo >= 50,
  },
  {
    id: 'combo_100',
    icon: 'emoji_events',
    check: s => s.maxCombo >= 100,
  },
  {
    id: 'combo_250',
    icon: 'military_tech',
    check: s => s.maxCombo >= 250,
  },
  {
    id: 'combo_500',
    icon: 'workspace_premium',
    check: s => s.maxCombo >= 500,
  },
  {
    id: 'first_win',
    icon: 'celebration',
    check: s => s.gamesWon >= 1,
  },
  {
    id: 'ten_wins',
    icon: 'trophy',
    check: s => s.gamesWon >= 10,
  },
  {
    id: 'perfect_accuracy',
    icon: 'target',
    check: s => s.totalHits > 0 && s.perfectHits / s.totalHits >= 0.5,
  },
  {
    id: 'no_miss_game',
    icon: 'verified',
    check: s => s.totalGames >= 1 && s.totalMisses === 0 && s.totalHits > 0,
  },
  {
    id: 'bomb_hitter',
    icon: 'report',
    check: s => s.bombHits >= 10,
  },
  {
    id: 'five_streak',
    icon: 'whatshot',
    check: s => s.maxCombo >= 30,
  },
  {
    id: 'fifteen_streak',
    icon: 'local_fire_department',
    check: s => s.maxCombo >= 75,
  },
  {
    id: 'maps_10',
    icon: 'library_music',
    check: s => s.mapsCompleted >= 10,
  },
  {
    id: 'play_1h',
    icon: 'schedule',
    check: s => s.totalPlayTimeMs >= 3600000,
  },
  {
    id: 'play_10h',
    icon: 'nightlight',
    check: s => s.totalPlayTimeMs >= 36000000,
  },
];

let unlocked = new Set<string>();

function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    }
  } catch { /* ignore */ }
  return new Set();
}

function saveUnlocked(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  } catch { /* ignore */ }
}

function loadStats(): AchievementStats {
  try {
    const raw = localStorage.getItem('hs_stats');
    if (raw) return JSON.parse(raw) as AchievementStats;
  } catch { /* ignore */ }
  return createEmptyStats();
}

function saveStats(stats: AchievementStats): void {
  try {
    localStorage.setItem('hs_stats', JSON.stringify(stats));
  } catch { /* ignore */ }
}

function createEmptyStats(): AchievementStats {
  return {
    totalGames: 0,
    totalHits: 0,
    totalMisses: 0,
    totalScore: 0,
    maxCombo: 0,
    perfectHits: 0,
    mapsCompleted: 0,
    bombHits: 0,
    totalPlayTimeMs: 0,
    milestonesReached: 0,
    gamesWon: 0,
    gamesLost: 0,
  };
}

let _stats: AchievementStats = loadStats();

function dispatchAchievement(id: string): void {
  window.dispatchEvent(new CustomEvent('hand-sabers:achievement', { detail: { id } }));
}

export function checkAchievements(): string[] {
  const newlyUnlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && a.check(_stats)) {
      unlocked.add(a.id);
      saveUnlocked();
      newlyUnlocked.push(a.id);
      dispatchAchievement(a.id);
    }
  }
  return newlyUnlocked;
}

export function getAllAchievements(): AchievementDef[] {
  return ACHIEVEMENTS;
}

export function isUnlocked(id: string): boolean {
  return unlocked.has(id);
}

export function getUnlockedCount(): number {
  return unlocked.size;
}

export function getTotalAchievements(): number {
  return ACHIEVEMENTS.length;
}

export function getStats(): AchievementStats {
  return { ..._stats };
}

export function getStatsSnapshot(): AchievementStats {
  return { ..._stats };
}

export function getDefinition(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

export function updateStats(partial: Partial<AchievementStats>): void {
  _stats = { ..._stats, ...partial };
  saveStats(_stats);
  checkAchievements();
}

export function recordGameEnd(state: GameState, won: boolean, playTimeMs: number): void {
  _stats.totalGames++;
  _stats.totalHits += state.hits;
  _stats.totalMisses += state.misses;
  _stats.totalScore += state.score;
  _stats.maxCombo = Math.max(_stats.maxCombo, state.maxCombo);
  _stats.perfectHits += state.perfectHits;
  _stats.totalPlayTimeMs += playTimeMs;
  if (won) _stats.gamesWon++;
  else _stats.gamesLost++;
  if (state.map?.id) _stats.mapsCompleted++;
  saveStats(_stats);
  checkAchievements();
}

export function recordBombHit(): void {
  _stats.bombHits++;
  saveStats(_stats);
  checkAchievements();
}

export function recordMilestone(): void {
  _stats.milestonesReached++;
  saveStats(_stats);
  checkAchievements();
}

export function getUnlockedSet(): Set<string> {
  return new Set(unlocked);
}

export function resetAchievements(): void {
  unlocked.clear();
  saveUnlocked();
  _stats = createEmptyStats();
  saveStats(_stats);
}

export function initAchievements(): AchievementDef[] {
  unlocked = loadUnlocked();
  _stats = loadStats();
  return ACHIEVEMENTS;
}
