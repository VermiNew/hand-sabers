import test from 'node:test';
import assert from 'node:assert/strict';
import { PAUSE_REASONS, canAutoResumeFromHands } from '../src/core/pause.ts';

test('only hands pause can auto resume from hand tracking', () => {
  assert.equal(canAutoResumeFromHands(PAUSE_REASONS.HANDS), true);
  assert.equal(canAutoResumeFromHands(PAUSE_REASONS.MANUAL), false);
  assert.equal(canAutoResumeFromHands(PAUSE_REASONS.FOCUS), false);
  assert.equal(canAutoResumeFromHands(PAUSE_REASONS.NONE), false);
});
