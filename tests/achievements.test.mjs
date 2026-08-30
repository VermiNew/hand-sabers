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
