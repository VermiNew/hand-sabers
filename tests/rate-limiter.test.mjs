import assert from 'node:assert/strict';
import test from 'node:test';

import { RateLimiter } from '../server/utils.ts';

test('rejected calls do not grow or extend the rate-limit window', () => {
  const originalNow = Date.now;
  let now = 1_000;
  const limiter = new RateLimiter();

  try {
    Date.now = () => now;
    assert.equal(limiter.check('127.0.0.1', 'route', 3), false);
    assert.equal(limiter.check('127.0.0.1', 'route', 3), false);
    assert.equal(limiter.check('127.0.0.1', 'route', 3), false);

    now = 59_000;
    for (let attempt = 0; attempt < 1_000; attempt++) {
      assert.equal(limiter.check('127.0.0.1', 'route', 3), true);
    }

    now = 61_000;
    assert.equal(limiter.check('127.0.0.1', 'route', 3), false);
  } finally {
    Date.now = originalNow;
    limiter.destroy();
  }
});
