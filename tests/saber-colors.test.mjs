import test from 'node:test';
import assert from 'node:assert/strict';
import { SABER_COLORS } from '../src/core/saber-colors.ts';

test('saber color presets expose twelve unique options', () => {
  assert.equal(SABER_COLORS.length, 12);
  assert.equal(new Set(SABER_COLORS.map(c => c.id)).size, 12);
  assert.equal(new Set(SABER_COLORS.map(c => c.hex.toLowerCase())).size, 12);
});

test('saber color presets expose valid color and translation metadata', () => {
  for (const color of SABER_COLORS) {
    assert.match(color.hex, /^#[0-9a-f]{6}$/i);
    assert.match(color.labelKey, /^settings\.gameplay\.colorNames\.[a-z]+$/);
  }
});
