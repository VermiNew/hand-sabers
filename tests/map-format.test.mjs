import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFileSize,
  isSafeZipPath,
  normalizeMap,
  sanitizeMapId,
  upgradeMapFormat,
  validateMap,
  validateZipEntryNames,
} from '../src/core/map-format.ts';

test('normalizeMap sanitizes id, normalizes beats and cut directions', () => {
  const map = normalizeMap({
    id: '../My Map!!',
    meta: { audioOffsetMs: 5000 },
    beats: [
      { time: 1, side: 'left', direction: 'DR', x: '0.2', y: '1.4' },
      { timeSec: -5, side: '???', type: 'bomb', cut: 'up' },
    ],
  });
  assert.equal(map.id, 'MyMap');
  assert.equal(map.meta.audioOffsetMs, 1000);
  assert.equal(map.beats[0].t, 0);
  assert.equal(map.beats[0].side, 'right');
  assert.equal(map.beats[0].type, 'bomb');
  assert.equal(map.beats[1].t, 1);
  assert.equal(map.beats[1].cut, 'down-right');
  assert.equal(map.beats[1].x, 0.2);
});

test('validateMap rejects empty maps by default and accepts when allowed', () => {
  assert.equal(validateMap({ beats: [] }), false);
  assert.doesNotThrow(() => normalizeMap({ beats: [] }, { requireBeats: false }));
});

test('safe zip paths reject traversal and empty segments', () => {
  assert.equal(isSafeZipPath('map.json'), true);
  assert.equal(isSafeZipPath('folder/audio.mp3'), true);
  assert.equal(isSafeZipPath('../map.json'), false);
  assert.equal(isSafeZipPath('/abs/map.json'), false);
  assert.equal(isSafeZipPath('folder//map.json'), false);
  assert.throws(() => validateZipEntryNames([{ name: '../evil.json' }]));
});

test('sanitizeMapId and assertFileSize keep storage safe', () => {
  assert.equal(sanitizeMapId('A Żółć! 123'), 'A123');
  assert.throws(() => assertFileSize({ size: 11 }, 10));
  assert.doesNotThrow(() => assertFileSize({ size: 10 }, 10));
});


test('normalizeMap sorts beats by time after import', () => {
  const map = normalizeMap({
    id: 'sort-test',
    beats: [
      { t: 5, side: 'left' },
      { t: 1, side: 'right' },
      { time: 3, side: 'left' },
    ],
  });
  assert.deepEqual(map.beats.map(b => b.t), [1, 3, 5]);
});

test('normalizeMap limits excessive beat counts', () => {
  const beats = Array.from({ length: 4 }, (_, t) => ({ t }));
  assert.equal(normalizeMap({ id: 'limit-test', beats }, { maxBeats: 2 }).beats.length, 2);
  assert.throws(
    () => normalizeMap({ id: 'limit-test', beats }, { maxBeats: 2, throwOnLimit: true }),
    /zbyt wiele beatów/
  );
});

test('normalizeMap formalizes optional map metadata', () => {
  const map = normalizeMap({
    id: 'meta-test',
    artist: '  Artist  ',
    mapper: ' Mapper ',
    difficulty: ' Hard ',
    bpm: '128.5',
    meta: {
      title: '  Title  ',
      duration: '45',
      previewStartSec: '90',
    },
    beats: [{ t: 1, side: 'left' }],
  });

  assert.equal(map.meta.title, 'Title');
  assert.equal(map.meta.artist, 'Artist');
  assert.equal(map.meta.mapper, 'Mapper');
  assert.equal(map.meta.difficulty, 'Hard');
  assert.equal(map.meta.bpm, 128.5);
  assert.equal(map.meta.duration, 45);
  assert.equal(map.meta.previewStartSec, 45);
});

test('upgradeMapFormat migrates legacy map shape explicitly', () => {
  const map = upgradeMapFormat({
    title: 'Legacy',
    audioOffsetMs: 1500,
    beats: [{ timeSec: 2, direction: 'UL' }],
  });

  assert.equal(map.id, 'Legacy');
  assert.equal(map.formatVersion, 1);
  assert.equal(map.meta.title, 'Legacy');
  assert.equal(map.meta.audioOffsetMs, 1000);
  assert.equal(map.beats[0].t, 2);
  assert.equal(map.beats[0].cut, 'up-left');
});
