import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  clear() {
    this.#values.clear();
  }
}

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.detail = init.detail;
    }
  };
}
globalThis.localStorage = new MemoryStorage();
globalThis.window = new EventTarget();

const {
  getStats,
  initAchievements,
  isUnlocked,
  recordGameEnd,
  recordMapCreated,
  recordMultiplayerGame,
  resetAchievements,
  updateStats,
} = await import('../src/core/achievements.ts');

function gameState({ hits = 0, misses = 0, maxCombo = 0, mapId = 'test-map' } = {}) {
  return {
    hits,
    misses,
    score: hits * 100,
    maxCombo,
    perfectHits: 0,
    map: { id: mapId },
  };
}

test('no_miss_game requires a won game with hits and no misses', () => {
  resetAchievements();

  recordGameEnd(gameState({ hits: 60 }), false, 1_000);
  assert.equal(isUnlocked('no_miss_game'), false);
  assert.equal(getStats().noMissGames, 0);

  recordGameEnd(gameState({ hits: 60, misses: 1 }), true, 1_000);
  assert.equal(isUnlocked('no_miss_game'), false);
  assert.equal(getStats().noMissGames, 0);

  recordGameEnd(gameState({ hits: 1 }), true, 1_000);
  assert.equal(isUnlocked('no_miss_game'), true);
  assert.equal(getStats().noMissGames, 1);
});

test('win streak achievements use consecutive wins instead of combo', () => {
  resetAchievements();

  recordGameEnd(gameState({ hits: 100, maxCombo: 100 }), true, 1_000);
  assert.equal(isUnlocked('five_streak'), false);
  assert.equal(isUnlocked('fifteen_streak'), false);

  for (let index = 0; index < 4; index++) {
    recordGameEnd(gameState({ hits: 1, mapId: `streak-${index}` }), true, 1_000);
  }
  assert.equal(isUnlocked('five_streak'), true);
  assert.equal(getStats().currentWinStreak, 5);
  assert.equal(getStats().bestWinStreak, 5);

  recordGameEnd(gameState({ hits: 1 }), false, 1_000);
  assert.equal(getStats().currentWinStreak, 0);
  assert.equal(getStats().bestWinStreak, 5);

  for (let index = 0; index < 15; index++) {
    recordGameEnd(gameState({ hits: 1, mapId: `long-streak-${index}` }), true, 1_000);
  }
  assert.equal(isUnlocked('fifteen_streak'), true);
  assert.equal(getStats().bestWinStreak, 15);
});

test('maps_10 counts unique won maps instead of repeats or losses', () => {
  resetAchievements();

  for (let index = 0; index < 10; index++) {
    recordGameEnd(gameState({ hits: 1, mapId: 'repeat-map' }), true, 1_000);
  }
  recordGameEnd(gameState({ hits: 1, mapId: 'lost-map' }), false, 1_000);
  assert.equal(getStats().mapsCompleted, 1);
  assert.deepEqual(getStats().completedMapIds, ['repeat-map']);
  assert.equal(isUnlocked('maps_10'), false);

  for (let index = 1; index < 10; index++) {
    recordGameEnd(gameState({ hits: 1, mapId: `unique-map-${index}` }), true, 1_000);
  }
  assert.equal(getStats().mapsCompleted, 10);
  assert.equal(new Set(getStats().completedMapIds).size, 10);
  assert.equal(isUnlocked('maps_10'), true);
});

test('multiplayer achievements distinguish co-op wins from score-attack results', () => {
  resetAchievements();

  recordMultiplayerGame(false, 200_000, 'coop');
  assert.equal(getStats().multiplayerGamesPlayed, 1);
  assert.equal(getStats().bestScoreAttackScore, 0);
  assert.equal(isUnlocked('mp_first_game'), true);
  assert.equal(isUnlocked('mp_first_win'), false);
  assert.equal(isUnlocked('mp_high_scorer'), false);

  recordMultiplayerGame(true, 100_000, 'score-attack');
  assert.equal(getStats().multiplayerWins, 1);
  assert.equal(getStats().coopWins, 0);
  assert.equal(getStats().bestScoreAttackScore, 100_000);
  assert.equal(isUnlocked('mp_first_win'), true);
  assert.equal(isUnlocked('mp_high_scorer'), true);

  for (let index = 0; index < 5; index++) recordMultiplayerGame(true, 10_000, 'coop');
  assert.equal(getStats().coopWins, 5);
  assert.equal(isUnlocked('mp_coop_master'), true);
});

test('creator achievements count unique saved map ids', () => {
  resetAchievements();

  recordMapCreated('creator-map-1');
  recordMapCreated('creator-map-1');
  recordMapCreated('   ');
  assert.equal(getStats().mapsCreated, 1);
  assert.deepEqual(getStats().createdMapIds, ['creator-map-1']);
  assert.equal(isUnlocked('creator_first'), true);
  assert.equal(isUnlocked('creator_five'), false);

  for (let index = 2; index <= 5; index++) recordMapCreated(`creator-map-${index}`);
  assert.equal(getStats().mapsCreated, 5);
  assert.equal(isUnlocked('creator_five'), true);
});

test('creator map id migration preserves legacy progress', () => {
  resetAchievements();
  localStorage.setItem('hs_stats', JSON.stringify({ mapsCreated: 3 }));

  initAchievements();

  assert.equal(getStats().mapsCreated, 3);
  assert.deepEqual(getStats().createdMapIds, [
    'legacy-created-map-1',
    'legacy-created-map-2',
    'legacy-created-map-3',
  ]);
});

test('perfect_accuracy requires both accuracy and a meaningful sample', () => {
  resetAchievements();

  updateStats({ totalHits: 1, perfectHits: 1 });
  assert.equal(isUnlocked('perfect_accuracy'), false);

  updateStats({ totalHits: 50, perfectHits: 24 });
  assert.equal(isUnlocked('perfect_accuracy'), false);

  updateStats({ totalHits: 50, perfectHits: 25 });
  assert.equal(isUnlocked('perfect_accuracy'), true);
});
