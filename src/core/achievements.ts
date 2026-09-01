import type { GameState } from './state.ts';

const STORAGE_KEY = 'hs_achievements';

export type AchievementCategory = 'gameplay' | 'multiplayer' | 'creator' | 'social';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface AchievementDef {
  id: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
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
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_game', icon: 'play_circle', category: 'gameplay', tier: 'bronze', check: s => s.totalGames >= 1 },
  { id: 'ten_games', icon: 'repeat', category: 'gameplay', tier: 'bronze', check: s => s.totalGames >= 10 },
  { id: 'fifty_games', icon: 'stars', category: 'gameplay', tier: 'silver', check: s => s.totalGames >= 50 },
  { id: 'first_hit', icon: 'check_circle', category: 'gameplay', tier: 'bronze', check: s => s.totalHits >= 1 },
  { id: 'hundred_hits', icon: 'trackpad', category: 'gameplay', tier: 'bronze', check: s => s.totalHits >= 100 },
  { id: 'thousand_hits', icon: 'flash_on', category: 'gameplay', tier: 'silver', check: s => s.totalHits >= 1000 },
  { id: 'combo_50', icon: 'social_leaderboard', category: 'gameplay', tier: 'silver', check: s => s.maxCombo >= 50 },
  { id: 'combo_100', icon: 'emoji_events', category: 'gameplay', tier: 'gold', check: s => s.maxCombo >= 100 },
  { id: 'combo_250', icon: 'military_tech', category: 'gameplay', tier: 'gold', check: s => s.maxCombo >= 250 },
  { id: 'combo_500', icon: 'workspace_premium', category: 'gameplay', tier: 'diamond', check: s => s.maxCombo >= 500 },
  { id: 'first_win', icon: 'celebration', category: 'gameplay', tier: 'bronze', check: s => s.gamesWon >= 1 },
  { id: 'ten_wins', icon: 'trophy', category: 'gameplay', tier: 'silver', check: s => s.gamesWon >= 10 },
  { id: 'perfect_accuracy', icon: 'target', category: 'gameplay', tier: 'gold', check: s => s.totalHits > 0 && s.perfectHits / s.totalHits >= 0.5 },
  { id: 'no_miss_game', icon: 'verified', category: 'gameplay', tier: 'gold', check: s => s.noMissGames >= 1 },
  { id: 'bomb_hitter', icon: 'report', category: 'gameplay', tier: 'bronze', check: s => s.bombHits >= 10 },
  { id: 'five_streak', icon: 'whatshot', category: 'gameplay', tier: 'bronze', check: s => s.bestWinStreak >= 5 },
  { id: 'fifteen_streak', icon: 'local_fire_department', category: 'gameplay', tier: 'silver', check: s => s.bestWinStreak >= 15 },
  { id: 'maps_10', icon: 'library_music', category: 'gameplay', tier: 'silver', check: s => s.mapsCompleted >= 10 },
  { id: 'play_1h', icon: 'schedule', category: 'gameplay', tier: 'silver', check: s => s.totalPlayTimeMs >= 3600000 },
  { id: 'play_10h', icon: 'nightlight', category: 'gameplay', tier: 'diamond', check: s => s.totalPlayTimeMs >= 36000000 },
  { id: 'score_100k', icon: 'score', category: 'gameplay', tier: 'silver', check: s => s.totalScore >= 100000 },
  { id: 'score_500k', icon: 'leaderboard', category: 'gameplay', tier: 'gold', check: s => s.totalScore >= 500000 },
  { id: 'score_1m', icon: 'diamond', category: 'gameplay', tier: 'diamond', check: s => s.totalScore >= 1000000 },
  { id: 'mp_first_game', icon: 'groups', category: 'multiplayer', tier: 'bronze', check: s => s.multiplayerGamesPlayed >= 1 },
  { id: 'mp_ten_games', icon: 'group_add', category: 'multiplayer', tier: 'silver', check: s => s.multiplayerGamesPlayed >= 10 },
  { id: 'mp_first_win', icon: 'emoji_events', category: 'multiplayer', tier: 'silver', check: s => s.multiplayerWins >= 1 },
  { id: 'mp_coop_master', icon: 'handshake', category: 'multiplayer', tier: 'gold', check: s => s.coopWins >= 5 },
  { id: 'mp_high_scorer', icon: 'military_tech', category: 'multiplayer', tier: 'gold', check: s => s.bestScoreAttackScore >= 100000 },
  { id: 'creator_first', icon: 'edit_note', category: 'creator', tier: 'bronze', check: s => s.mapsCreated >= 1 },
  { id: 'creator_five', icon: 'map', category: 'creator', tier: 'silver', check: s => s.mapsCreated >= 5 },
  { id: 'creator_prolific', icon: 'collections_bookmark', category: 'creator', tier: 'gold', check: s => s.mapsCreated >= 20 },
  { id: 'social_connected', icon: 'phone_iphone', category: 'social', tier: 'bronze', check: s => s.phoneConnected >= 1 },
  { id: 'social_perfect_run', icon: 'verified', category: 'social', tier: 'diamond', check: s => s.perfectGames >= 1 && s.totalHits >= 50 },
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
    if (raw) {
      const stats = { ...createEmptyStats(), ...(JSON.parse(raw) as Partial<AchievementStats>) };
      const completedMapIds = Array.isArray(stats.completedMapIds)
        ? [...new Set(stats.completedMapIds.filter(id => typeof id === 'string' && id.length > 0))].slice(0, 1000)
        : [];
      return { ...stats, completedMapIds, mapsCompleted: completedMapIds.length };
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

export function recordMapCreated(): void {
  _stats.mapsCreated++;
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
