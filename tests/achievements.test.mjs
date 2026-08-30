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
  isUnlocked,
  recordGameEnd,
  resetAchievements,
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
