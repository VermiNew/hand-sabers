import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

const { createUploadConcurrencyGate } = await import('../server/upload-concurrency.ts');

function createRequest(ip, multipart = true) {
  const request = new EventEmitter();
  request.ip = ip;
  request.readableEnded = false;
  request.destroyed = false;
  request.is = type => multipart && type === 'multipart/form-data';
  request.destroy = () => {
    request.destroyed = true;
  };
  return request;
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    headersSent: false,
    writableEnded: false,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
  };
}

function createGate(overrides = {}) {
  return createUploadConcurrencyGate({
    byteRateGraceMs: 60_000,
    byteRateWindowMs: 60_000,
    initialUsedBytes: 0,
    maxGlobal: 2,
    maxPerIp: 1,
    maxTempBytes: 1_000,
    minBytesPerSecond: 1,
    reservationBytes: 100,
    ...overrides,
  });
}

function enter(gate, request) {
  const response = createResponse();
  let nextCalls = 0;
  gate.middleware(request, response, () => {
    nextCalls++;
  });
  return { response, nextCalls };
}

test('upload gate limits concurrent requests per IP and releases the lease', () => {
  const gate = createGate();
  const first = createRequest('127.0.0.1');
  const blocked = createRequest('127.0.0.1');

  assert.equal(enter(gate, first).nextCalls, 1);
  const blockedResult = enter(gate, blocked);
  assert.equal(blockedResult.nextCalls, 0);
  assert.equal(blockedResult.response.statusCode, 429);
  assert.equal(blockedResult.response.headers['Retry-After'], '2');

  gate.release(first);
  const retried = createRequest('127.0.0.1');
  assert.equal(enter(gate, retried).nextCalls, 1);
  gate.release(retried);
});

test('upload gate reserves multipart capacity before accepting a request', () => {
  const gate = createGate({ initialUsedBytes: 950 });
  const result = enter(gate, createRequest('127.0.0.2'));

  assert.equal(result.nextCalls, 0);
  assert.equal(result.response.statusCode, 507);
  assert.match(result.response.body.error, /limit pojemności/i);
});
