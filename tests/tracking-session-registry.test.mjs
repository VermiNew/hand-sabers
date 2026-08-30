import test from 'node:test';
import assert from 'node:assert/strict';

const { TrackingSessionRegistry } = await import(
  '../server/realtime/tracking-session-registry.ts'
);

const SESSION_TTL_MS = 5 * 60 * 1000;

test('tracking session expires after five minutes and reports invalidation', () => {
  const registry = new TrackingSessionRegistry();
  const originalNow = Date.now;
  const invalidations = [];
  let now = 1_800_000_000_000;

  Date.now = () => now;
  const unsubscribe = registry.onInvalidated((id, reason) => {
    invalidations.push({ id, reason });
  });

  try {
    const session = registry.create();
    assert.equal(session.createdAt, now);
    assert.equal(session.expiresAt, now + SESSION_TTL_MS);

    now = session.expiresAt - 1;
    assert.equal(registry.isActive(session.id), true);
    assert.deepEqual(invalidations, []);

    now = session.expiresAt;
    assert.equal(registry.isActive(session.id), false);
    assert.deepEqual(invalidations, [{ id: session.id, reason: 'expired' }]);

    assert.equal(registry.isActive(session.id), false);
    assert.equal(invalidations.length, 1);
  } finally {
    unsubscribe();
    Date.now = originalNow;
    registry.destroy();
  }
});
