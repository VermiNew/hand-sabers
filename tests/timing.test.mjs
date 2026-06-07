import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APPROACH_SEC,
  getEffectiveMapDuration,
  getLastBeatTimeSec,
  getSongTimeSec,
  nearestBeatDeltaMs,
  noteZAtSongTime,
} from '../src/core/timing.ts';

test('getEffectiveMapDuration prefers audio duration', () => {
  const map = { meta: { duration: 123 }, beats: [{ t: 200 }] };
  assert.equal(getEffectiveMapDuration(map, 87), 87);
});

test('getEffectiveMapDuration falls back to map meta duration', () => {
  const map = { meta: { duration: 123 }, beats: [{ t: 200 }] };
  assert.equal(getEffectiveMapDuration(map, 0), 123);
});

test('getEffectiveMapDuration falls back to last beat plus tail', () => {
  const map = { meta: {}, beats: [{ t: 1.5 }, { time: 8 }] };
  assert.equal(getLastBeatTimeSec(map.beats), 8);
  assert.equal(getEffectiveMapDuration(map, 0, 2.5), 10.5);
});

test('noteZAtSongTime places notes at spawn and hit z', () => {
  const args = { hitTimeSec: 10, spawnZ: -22, hitZ: 1.5, approachSec: DEFAULT_APPROACH_SEC };
  assert.equal(noteZAtSongTime({ ...args, songTimeSec: 10 - DEFAULT_APPROACH_SEC }), -22);
  assert.equal(noteZAtSongTime({ ...args, songTimeSec: 10 }), 1.5);
});

test('getSongTimeSec combines global and map offset with clamp', () => {
  assert.equal(getSongTimeSec(10, { audioOffsetMs: 120 }, { meta: { audioOffsetMs: -20 } }), 10.1);
  assert.equal(getSongTimeSec(10, { audioOffsetMs: 5000 }, { meta: { audioOffsetMs: 0 } }), 11);
});

test('nearestBeatDeltaMs returns closest beat', () => {
  const result = nearestBeatDeltaMs([{ t: 1 }, { t: 2.05 }, { t: 3 }], 2);
  assert.equal(result.deltaMs, 50);
  assert.equal(result.timeSec, 2.05);
});
