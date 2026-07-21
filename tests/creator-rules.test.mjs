import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markOverlaps,
  removeBeatByReference,
  removeBeatsByReference,
  sortBeatsByTime,
} from '../src/core/creator-rules.ts';

test('sortBeatsByTime sorts in place by hit time', () => {
  const beats = [{ t: 2 }, { t: 0.5 }, { t: 1 }];
  const result = sortBeatsByTime(beats);
  assert.equal(result, beats);
  assert.deepEqual(beats.map(b => b.t), [0.5, 1, 2]);
});

test('markOverlaps detects close beats even when input is unsorted', () => {
  const a = { t: 2 };
  const b = { t: 0.1 };
  const c = { t: 0.15 };
  const beats = [a, b, c];
  assert.equal(markOverlaps(beats, 0.08), true);
  assert.equal(a._overlap, false);
  assert.equal(b._overlap, true);
  assert.equal(c._overlap, true);
});

test('markOverlaps clears stale overlap flags', () => {
  const beats = [{ t: 0, _overlap: true }, { t: 1, _overlap: true }];
  assert.equal(markOverlaps(beats, 0.08), false);
  assert.equal(beats[0]._overlap, false);
  assert.equal(beats[1]._overlap, false);
});

test('removeBeatByReference ignores stale references instead of removing last beat', () => {
  const existing = { t: 1 };
  const stale = { t: 999 };
  const beats = [{ t: 0 }, existing, { t: 2 }];
  removeBeatByReference(beats, stale);
  assert.deepEqual(beats.map(b => b.t), [0, 1, 2]);
  removeBeatByReference(beats, existing);
  assert.deepEqual(beats.map(b => b.t), [0, 2]);
});

test('removeBeatsByReference removes only selected live references', () => {
  const keep = { t: 0 };
  const remove = { t: 1 };
  const stale = { t: 3 };
  const result = removeBeatsByReference([keep, remove], new Set([remove, stale]));
  assert.deepEqual(result, [keep]);
});
