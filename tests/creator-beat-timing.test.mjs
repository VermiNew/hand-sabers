import test from 'node:test';
import assert from 'node:assert/strict';

const { state } = await import('../src/creator/state.ts');
const {
  canCreateHeldAt,
  clampHeldDuration,
  clampMapTime,
  fitBeatsWithinMap,
} = await import('../src/creator/beat-timing.ts');

test('creator clamps beats to the loaded map duration', () => {
  const originalDuration = state.map.meta.duration;
  state.map.meta.duration = 10;

  try {
    assert.equal(clampMapTime(-1), 0);
    assert.equal(clampMapTime(4.5), 4.5);
    assert.equal(clampMapTime(12), 10);

    const beats = [{ t: 0, side: 'left' }, { t: 0.5, side: 'right' }];
    const fitted = fitBeatsWithinMap(beats, beat => beat.t + 9.8, time => time);
    assert.deepEqual(fitted.map(beat => beat.t), [9.5, 10]);
    assert.deepEqual(beats.map(beat => beat.t), [0, 0.5]);
  } finally {
    state.map.meta.duration = originalDuration;
  }
});

test('creator keeps held beats inside the loaded map', () => {
  const originalDuration = state.map.meta.duration;
  state.map.meta.duration = 10;

  try {
    assert.equal(canCreateHeldAt(9.94), true);
    assert.equal(canCreateHeldAt(9.96), false);
    assert.ok(Math.abs(clampHeldDuration(9.8, 1) - 0.2) < Number.EPSILON * 10);
  } finally {
    state.map.meta.duration = originalDuration;
  }
});
