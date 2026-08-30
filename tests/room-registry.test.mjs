import test from 'node:test';
import assert from 'node:assert/strict';

const { RoomRegistry } = await import('../server/realtime/room-registry.ts');

const ROOM_TTL_MS = 30 * 60 * 1000;

test('room activity extends its expiry only for a joined player', () => {
  const registry = new RoomRegistry();

  try {
    const created = registry.create();
    const { player, snapshot } = registry.join(
      created.code,
      created.hostToken,
      'Host',
      'default',
      '#2f7cff',
    );
    const initialExpiry = Date.parse(snapshot.expiresAt);
    const activityTime = initialExpiry - 1_000;

    assert.equal(registry.touch(created.code, 'unknown-player', activityTime), false);
    assert.equal(Date.parse(registry.get(created.code).expiresAt), initialExpiry);

    assert.equal(registry.touch(created.code, player.id, activityTime), true);
    assert.equal(
      Date.parse(registry.get(created.code).expiresAt),
      activityTime + ROOM_TTL_MS,
    );
  } finally {
    registry.destroy();
  }
});
