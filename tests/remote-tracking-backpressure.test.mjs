import test from 'node:test';
import assert from 'node:assert/strict';

const { isRemoteTrackingBufferAvailable } = await import(
  '../server/realtime/remote-tracking-socket.ts'
);

test('remote tracking backpressure accepts 64 KiB and rejects the next byte', () => {
  assert.equal(isRemoteTrackingBufferAvailable(0), true);
  assert.equal(isRemoteTrackingBufferAvailable(64 * 1024), true);
  assert.equal(isRemoteTrackingBufferAvailable(64 * 1024 + 1), false);
});
