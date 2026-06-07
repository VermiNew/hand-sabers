import test from 'node:test';
import assert from 'node:assert/strict';
import { SABER_COLORS, findClosestSaberColor } from '../src/core/saber-colors.ts';

test('saber color presets expose twelve unique options', () => {
  assert.equal(SABER_COLORS.length, 12);
  assert.equal(new Set(SABER_COLORS.map(c => c.id)).size, 12);
  assert.equal(new Set(SABER_COLORS.map(c => c.hex.toLowerCase())).size, 12);
});

test('findClosestSaberColor matches case-insensitively and falls back to green', () => {
  assert.equal(findClosestSaberColor('#2F7CFF').id, 'blue');
  assert.equal(findClosestSaberColor('#not-a-color').id, 'green');
});
