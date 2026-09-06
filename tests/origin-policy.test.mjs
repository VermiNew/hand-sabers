import assert from 'node:assert/strict';
import test from 'node:test';

import { createOriginPolicy } from '../server/origin-policy.ts';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
  'http://192.168.1.20:3000',
  'https://game.example.test',
];

test('enabled origin policy accepts only exact configured browser origins', () => {
  const policy = createOriginPolicy(true, allowedOrigins);

  for (const origin of allowedOrigins) assert.equal(policy.isAllowed(origin), true, origin);
  assert.equal(policy.isAllowed('http://attacker.test:3000'), false);
  assert.equal(policy.isAllowed('http://localhost:4173'), false);
  assert.equal(policy.isAllowed('null'), false);
  assert.equal(policy.isAllowed('not a URL'), false);
});

test('origin policy preserves originless clients and the disabled development mode', () => {
  assert.equal(createOriginPolicy(true, allowedOrigins).isAllowed(undefined), true);
  assert.equal(createOriginPolicy(false, []).isAllowed('http://attacker.test:3000'), true);
});

test('origin policy rejects unsafe configured values and an empty enabled list', () => {
  assert.throws(() => createOriginPolicy(true, []), /allowedOrigins/);
  for (const origin of ['file:///tmp/app', 'http://user:pass@localhost:3000', 'http://localhost:3000/path']) {
    assert.throws(() => createOriginPolicy(true, [origin]), /Nieprawidłowy origin/);
  }
});
