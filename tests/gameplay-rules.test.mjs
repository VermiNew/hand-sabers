import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUT_SYMBOLS,
  classifyHitQuality,
  createInitialComboState,
  getSwingVector2,
  isCutDirectionMatch,
  nextCutDirection,
  normalizeCutDirection,
  registerComboHit,
  resetCombo,
  scoreForHit,
} from '../src/core/gameplay-rules.ts';

test('cut direction normalization supports aliases and safe fallback', () => {
  assert.equal(normalizeCutDirection('DL'), 'down-left');
  assert.equal(normalizeCutDirection('góra'), 'up');
  assert.equal(normalizeCutDirection('wat'), 'any');
  assert.equal(CUT_SYMBOLS['down-left'], '↙');
  assert.equal(nextCutDirection('any'), 'down');
});

test('cut direction matching accepts free cuts and checks dot product', () => {
  assert.equal(isCutDirectionMatch('any', { x: 0, y: 0, len: 0 }), true);
  assert.equal(isCutDirectionMatch('down', { x: 0, y: -1, len: 1 }), true);
  assert.equal(isCutDirectionMatch('down', { x: 0, y: 1, len: 1 }), false);
});

test('getSwingVector2 averages blade movement and normalizes it', () => {
  const v = getSwingVector2({
    hasPrevious: true,
    previousStart: { x: 0, y: 0 },
    previousEnd: { x: 0, y: 1 },
    currentStart: { x: 0, y: -1 },
    currentEnd: { x: 0, y: 0 },
  });
  assert.equal(v.x, 0);
  assert.equal(v.y, -1);
  assert.equal(v.len, 1);
});

test('combo starts at 0, increments hits, preserves max on reset', () => {
  let combo = createInitialComboState();
  assert.deepEqual(combo, { combo: 0, maxCombo: 0 });
  combo = registerComboHit(combo);
  combo = registerComboHit(combo);
  assert.deepEqual(combo, { combo: 2, maxCombo: 2 });
  combo = resetCombo(combo);
  assert.deepEqual(combo, { combo: 0, maxCombo: 2 });
  combo = registerComboHit(combo);
  assert.deepEqual(combo, { combo: 1, maxCombo: 2 });
});

test('hit quality combines timing, center distance and cut direction', () => {
  assert.equal(classifyHitQuality({ deltaMs: 40, centerDistance: 0.1, cutOk: true }).label, 'PERFECT');
  assert.equal(classifyHitQuality({ deltaMs: 120, centerDistance: 0.4, cutOk: true }).label, 'GOOD');
  assert.equal(classifyHitQuality({ deltaMs: 220, centerDistance: 0.1, cutOk: true }).label, 'BAD');
  assert.equal(classifyHitQuality({ deltaMs: 20, centerDistance: 0.1, cutOk: false }).reason, 'cut');
});

test('scoreForHit never drops below one multiplier for valid points', () => {
  assert.equal(scoreForHit(100, 0), 100);
  assert.equal(scoreForHit(100, 4), 400);
});
