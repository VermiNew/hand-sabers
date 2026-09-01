import type { GameState } from './state.ts';

const STORAGE_KEY = 'hs_achievements';

export type AchievementCategory = 'gameplay' | 'multiplayer' | 'creator' | 'social';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface AchievementDef {
  id: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  target: number;
  progress: (stats: AchievementStats) => number;
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
  multiplayerGamesPlayed: number;
  multiplayerWins: number;
  coopWins: number;
  mapsCreated: number;
  bestScoreAttackScore: number;
  perfectGames: number;
  phoneConnected: number;
  noMissGames: number;
  currentWinStreak: number;
  bestWinStreak: number;
  completedMapIds: string[];
  createdMapIds: string[];
}

function defineAchievement(
  id: string,
  icon: string,
  category: AchievementCategory,
  tier: AchievementTier,
  target: number,
  progress: (stats: AchievementStats) => number,
): AchievementDef {
  return { id, icon, category, tier, target, progress, check: stats => progress(stats) >= target };
}

const perfectAccuracyProgress = (stats: AchievementStats): number => {
  if (stats.totalHits <= 0) return 0;
  const sampleProgress = stats.totalHits / 50;
  const accuracyProgress = (stats.perfectHits / stats.totalHits) / 0.5;
  return Math.max(0, Math.min(sampleProgress, accuracyProgress) * 50);
};

const ACHIEVEMENTS: AchievementDef[] = [
  defineAchievement('first_game', 'play_circle', 'gameplay', 'bronze', 1, s => s.totalGames),
  defineAchievement('ten_games', 'repeat', 'gameplay', 'bronze', 10, s => s.totalGames),
  defineAchievement('fifty_games', 'stars', 'gameplay', 'silver', 50, s => s.totalGames),
  defineAchievement('first_hit', 'check_circle', 'gameplay', 'bronze', 1, s => s.totalHits),
  defineAchievement('hundred_hits', 'trackpad', 'gameplay', 'bronze', 100, s => s.totalHits),
  defineAchievement('thousand_hits', 'flash_on', 'gameplay', 'silver', 1000, s => s.totalHits),
  defineAchievement('combo_50', 'social_leaderboard', 'gameplay', 'silver', 50, s => s.maxCombo),
  defineAchievement('combo_100', 'emoji_events', 'gameplay', 'gold', 100, s => s.maxCombo),
  defineAchievement('combo_250', 'military_tech', 'gameplay', 'gold', 250, s => s.maxCombo),
  defineAchievement('combo_500', 'workspace_premium', 'gameplay', 'diamond', 500, s => s.maxCombo),
  defineAchievement('first_win', 'celebration', 'gameplay', 'bronze', 1, s => s.gamesWon),
  defineAchievement('ten_wins', 'trophy', 'gameplay', 'silver', 10, s => s.gamesWon),
  defineAchievement('perfect_accuracy', 'target', 'gameplay', 'gold', 50, perfectAccuracyProgress),
  defineAchievement('no_miss_game', 'verified', 'gameplay', 'gold', 1, s => s.noMissGames),
  defineAchievement('bomb_hitter', 'report', 'gameplay', 'bronze', 10, s => s.bombHits),
  defineAchievement('five_streak', 'whatshot', 'gameplay', 'bronze', 5, s => s.bestWinStreak),
  defineAchievement('fifteen_streak', 'local_fire_department', 'gameplay', 'silver', 15, s => s.bestWinStreak),
  defineAchievement('maps_10', 'library_music', 'gameplay', 'silver', 10, s => s.mapsCompleted),
  defineAchievement('play_1h', 'schedule', 'gameplay', 'silver', 3_600_000, s => s.totalPlayTimeMs),
  defineAchievement('play_10h', 'nightlight', 'gameplay', 'diamond', 36_000_000, s => s.totalPlayTimeMs),
  defineAchievement('score_100k', 'score', 'gameplay', 'silver', 100_000, s => s.totalScore),
  defineAchievement('score_500k', 'leaderboard', 'gameplay', 'gold', 500_000, s => s.totalScore),
  defineAchievement('score_1m', 'diamond', 'gameplay', 'diamond', 1_000_000, s => s.totalScore),
  defineAchievement('mp_first_game', 'groups', 'multiplayer', 'bronze', 1, s => s.multiplayerGamesPlayed),
  defineAchievement('mp_ten_games', 'group_add', 'multiplayer', 'silver', 10, s => s.multiplayerGamesPlayed),
  defineAchievement('mp_first_win', 'emoji_events', 'multiplayer', 'silver', 1, s => s.multiplayerWins),
  defineAchievement('mp_coop_master', 'handshake', 'multiplayer', 'gold', 5, s => s.coopWins),
  defineAchievement('mp_high_scorer', 'military_tech', 'multiplayer', 'gold', 100_000, s => s.bestScoreAttackScore),
  defineAchievement('creator_first', 'edit_note', 'creator', 'bronze', 1, s => s.mapsCreated),
  defineAchievement('creator_five', 'map', 'creator', 'silver', 5, s => s.mapsCreated),
  defineAchievement('creator_prolific', 'collections_bookmark', 'creator', 'gold', 20, s => s.mapsCreated),
  defineAchievement('social_connected', 'phone_iphone', 'social', 'bronze', 1, s => s.phoneConnected),
  defineAchievement('social_perfect_run', 'verified', 'social', 'diamond', 1, s => s.perfectGames),
];

let unlocked = loadUnlocked();

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
    if (raw) {
      const stats = { ...createEmptyStats(), ...(JSON.parse(raw) as Partial<AchievementStats>) };
      const completedMapIds = Array.isArray(stats.completedMapIds)
        ? [...new Set(stats.completedMapIds.filter(id => typeof id === 'string' && id.length > 0))].slice(0, 1000)
        : [];
      const createdMapIds = Array.isArray(stats.createdMapIds)
        ? [...new Set(stats.createdMapIds.filter(id => typeof id === 'string' && id.length > 0))].slice(0, 1000)
        : [];
      const legacyCreatedCount = Math.min(1000, Math.max(0, Math.floor(Number(stats.mapsCreated) || 0)));
      for (let index = createdMapIds.length; index < legacyCreatedCount; index++) {
        createdMapIds.push(`legacy-created-map-${index + 1}`);
      }
      return {
        ...stats,
        completedMapIds,
        mapsCompleted: completedMapIds.length,
        createdMapIds,
        mapsCreated: createdMapIds.length,
      };
    }
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
    multiplayerGamesPlayed: 0,
    multiplayerWins: 0,
    coopWins: 0,
    mapsCreated: 0,
    bestScoreAttackScore: 0,
    perfectGames: 0,
    phoneConnected: 0,
    noMissGames: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    completedMapIds: [],
    createdMapIds: [],
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
  if (won) {
    _stats.gamesWon++;
    _stats.currentWinStreak++;
    _stats.bestWinStreak = Math.max(_stats.bestWinStreak, _stats.currentWinStreak);
  } else {
    _stats.gamesLost++;
    _stats.currentWinStreak = 0;
  }
  if (won && state.misses === 0 && state.hits >= 50) _stats.perfectGames++;
  if (won && state.misses === 0 && state.hits > 0) _stats.noMissGames++;
  if (won && state.map?.id && !_stats.completedMapIds.includes(state.map.id)) {
    _stats.completedMapIds.push(state.map.id);
    _stats.completedMapIds = _stats.completedMapIds.slice(-1000);
    _stats.mapsCompleted = _stats.completedMapIds.length;
  }
  saveStats(_stats);
  checkAchievements();
}

export function recordMultiplayerGame(won: boolean, score: number, mode: 'coop' | 'score-attack'): void {
  _stats.multiplayerGamesPlayed++;
  if (won) {
    _stats.multiplayerWins++;
    if (mode === 'coop') _stats.coopWins++;
  }
  if (mode === 'score-attack') {
    _stats.bestScoreAttackScore = Math.max(_stats.bestScoreAttackScore, score);
  }
  saveStats(_stats);
  checkAchievements();
}

export function recordMapCreated(mapId: string): void {
  const normalizedId = mapId.trim();
  if (!normalizedId || _stats.createdMapIds.includes(normalizedId)) return;
  _stats.createdMapIds.push(normalizedId);
  _stats.createdMapIds = _stats.createdMapIds.slice(-1000);
  _stats.mapsCreated = _stats.createdMapIds.length;
  saveStats(_stats);
  checkAchievements();
}

export function recordPhoneConnected(): void {
  _stats.phoneConnected++;
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
