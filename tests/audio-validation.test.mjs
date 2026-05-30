import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSupportedAudioFile,
  validateAudioFile,
  validateDecodedAudio,
} from '../src/core/audio-validation.js';

test('validateAudioFile accepts supported MIME or extension', () => {
  assert.equal(isSupportedAudioFile({ name: 'song.mp3', type: '' }), true);
  assert.equal(isSupportedAudioFile({ name: 'blob.bin', type: 'audio/ogg' }), true);
  assert.doesNotThrow(() => validateAudioFile({ name: 'song.ogg', type: '', size: 1024 }));
});

test('validateAudioFile rejects unsupported or oversized files', () => {
  assert.throws(() => validateAudioFile({ name: 'song.exe', type: '', size: 1024 }), /Nieobsługiwany format/);
  assert.throws(() => validateAudioFile({ name: 'song.mp3', type: '', size: 11 }, { maxBytes: 10 }), /za duży/);
});

test('validateDecodedAudio rejects broken durations and accepts normal buffers', () => {
  assert.throws(() => validateDecodedAudio({ duration: 0, sampleRate: 44100 }), /zbyt krótkie/);
  assert.throws(() => validateDecodedAudio({ duration: 5, sampleRate: 0 }), /zdekodować/);
  assert.doesNotThrow(() => validateDecodedAudio({ duration: 5, sampleRate: 44100 }));
});
