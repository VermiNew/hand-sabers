import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(String(port)));
    });
  });
}

const PORT = process.env.SMOKE_PORT || await getFreePort();
const HOST = '127.0.0.1';
const base = `http://${HOST}:${PORT}`;
const SMOKE_MAPS_DIR = path.join(process.cwd(), '.tmp', `smoke-maps-${process.pid}-${Date.now()}`);
const SERVER_ENTRY = path.join(process.cwd(), 'dist-server', 'server.js');

if (!existsSync(SERVER_ENTRY)) {
  throw new Error('Compiled server not found. Run `npm run server:build` before `npm run smoke`.');
}

const server = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT, NODE_ENV: 'test', HAND_SABERS_MAPS_DIR: SMOKE_MAPS_DIR },
});

let stdout = '';
let stderr = '';
let exitInfo = null;
server.stdout.on('data', d => { stdout += d.toString(); });
server.stderr.on('data', d => { stderr += d.toString(); });
server.once('exit', (code, signal) => { exitInfo = { code, signal }; });

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function makeResponse(statusCode, headers, body) {
  return {
    status: statusCode || 0,
    ok: statusCode >= 200 && statusCode < 300,
    headers,
    body,
    text: () => body.toString('utf8'),
    json: () => JSON.parse(body.toString('utf8')),
  };
}

async function smokeRequest(path, options = {}, { retries = 4, timeoutMs = 6000 } = {}) {
  const method = options.method || 'GET';
  const body = options.body ? Buffer.from(options.body) : null;
  const headers = {
    Connection: 'close',
    ...(options.headers || {}),
  };
  if (body && headers['Content-Length'] == null && headers['content-length'] == null) {
    headers['Content-Length'] = String(body.length);
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (exitInfo) {
      throw new Error(`Server exited before smoke request ${method} ${path} (${JSON.stringify(exitInfo)}).\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }

    try {
      return await new Promise((resolve, reject) => {
        const req = httpRequest({
          hostname: HOST,
          port: Number(PORT),
          path,
          method,
          headers,
          timeout: timeoutMs,
        }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(makeResponse(res.statusCode, res.headers, Buffer.concat(chunks))));
          res.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error(`Timeout ${method} ${path}`)));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      });
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      await sleep(150 * (attempt + 1));
    }
  }

  throw new Error(`Smoke request failed: ${method} ${path}: ${lastError?.message || lastError}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (exitInfo) {
      throw new Error(`Server exited during startup (${JSON.stringify(exitInfo)}).\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }
    try {
      const res = await smokeRequest('/api/health', {}, { retries: 0, timeoutMs: 1000 });
      if (res.ok) return res.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Server did not start on ${base}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function getJson(path) {
  const res = await smokeRequest(path);
  const text = res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function postJson(path, body, expected = 200) {
  const res = await smokeRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  });
  const text = res.text();
  if (res.status !== expected) throw new Error(`${path} expected ${expected}, got ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function multipartBody(parts) {
  const boundary = `----hand-sabers-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  for (const part of parts) {
    if (part.filename) {
      chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
        `Content-Type: ${part.mimeType || 'application/octet-stream'}\r\n\r\n`,
        'utf8'
      ));
      chunks.push(Buffer.from(part.bytes || []));
      chunks.push(Buffer.from('\r\n', 'utf8'));
    } else {
      chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"\r\n\r\n` +
        `${part.value ?? ''}\r\n`,
        'utf8'
      ));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function postMultipart(path, parts, expected = 200) {
  const mp = multipartBody(parts);
  const res = await smokeRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': mp.contentType },
    body: mp.body,
  });
  const text = res.text();
  if (res.status !== expected) throw new Error(`${path} expected ${expected}, got ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function postFile(path, filename, mimeType, bytes, expected = 200) {
  return await postMultipart(path, [{ name: 'file', filename, mimeType, bytes }], expected);
}


function expectFile(relativePath, label) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(SMOKE_MAPS_DIR, relativePath);
  if (!existsSync(fullPath)) throw new Error(`${label} was not written: ${path.relative(process.cwd(), fullPath)}`);
}

async function stopServer() {
  if (server.exitCode !== null || server.killed) return;
  await new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    server.once('exit', done);
    server.kill('SIGTERM');
    setTimeout(() => {
      if (server.exitCode === null && !server.killed) server.kill('SIGKILL');
      done();
    }, 3000).unref();
  });
}

try {
  const health = await waitForServer();
  if (!health.ok || health.maxImportBytes !== 100 * 1024 * 1024) throw new Error('health check payload is wrong');

  const maps = await getJson('/api/maps');
  if (!Array.isArray(maps)) throw new Error('/api/maps did not return an array');
  const scores = await getJson('/api/scores');
  if (!Array.isArray(scores)) throw new Error('/api/scores did not return an array');

  for (const privatePath of ['/package.json', '/package-lock.json', '/server.js', '/node_modules/', '/maps/_scores.json']) {
    const privateRes = await smokeRequest(privatePath);
    if (privateRes.status !== 404) throw new Error(`${privatePath} should not be served statically, got ${privateRes.status}`);
  }

  await postJson('/api/maps', { id: 'smoke-map', meta: { title: 'Smoke', audioOffsetMs: 25 }, beats: [{ t: 1.25, side: 'left' }] });
  const saved = await getJson('/api/maps/smoke-map');
  if (saved.id !== 'smoke-map' || saved.meta.audioOffsetMs !== 25) throw new Error('saved map did not normalize correctly');
  expectFile('beatdata/smoke-map.json', 'POST /api/maps beatdata');

  const creatorSaved = await postMultipart('/api/maps/save', [
    { name: 'map', value: JSON.stringify({ id: 'creator-smoke', meta: { title: 'Creator Smoke' }, beats: [{ t: 2, side: 'left' }] }) },
    { name: 'audio', filename: 'song.ogg', mimeType: 'audio/ogg', bytes: new Uint8Array([9, 8, 7, 6]) },
  ]);
  if (creatorSaved.id !== 'creator-smoke' || creatorSaved.audio !== 'song.ogg') throw new Error('creator save failed');
  expectFile('beatdata/creator-smoke.json', 'creator save beatdata');
  expectFile('audio/creator-smoke.ogg', 'creator save audio');

  await postJson('/api/maps', { id: 'bad-map', beats: 'nope' }, 400);

  const zip = new JSZip();
  zip.file('map.json', JSON.stringify({ id: 'zip-smoke', meta: { title: 'Zip Smoke' }, beats: [{ t: 0.5, side: 'right' }] }));
  zip.file('audio.ogg', new Uint8Array([1, 2, 3, 4]));
  const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });
  const imported = await postFile('/api/maps/import', 'zip-smoke.zip', 'application/zip', zipBytes);
  if (imported.id !== 'zip-smoke' || imported.audio !== 'audio.ogg') throw new Error('zip import failed');
  expectFile('beatdata/zip-smoke.json', 'zip import beatdata');
  expectFile('audio/zip-smoke.ogg', 'zip import audio');

  const importedAudio = await smokeRequest('/api/maps/zip-smoke/audio');
  if (!importedAudio.ok || importedAudio.body.length === 0) {
    throw new Error(`zip audio endpoint failed: ${importedAudio.status}, content-type=${importedAudio.headers['content-type'] || ''}, bytes=${importedAudio.body.length}`);
  }

  const evilZip = new JSZip();
  evilZip.file('../map.json', '{}');
  const evilBytes = await evilZip.generateAsync({ type: 'nodebuffer' });
  await postFile('/api/maps/import', 'evil.zip', 'application/zip', evilBytes, 400);

  const exported = await smokeRequest('/api/maps/zip-smoke/export.zip');
  if (!exported.ok || !/zip/.test(exported.headers['content-type'] || '')) {
    throw new Error(`export zip failed: ${exported.status}: ${exported.text()}`);
  }
  const exportedZip = await JSZip.loadAsync(exported.body);
  if (!exportedZip.file('map.json') || !exportedZip.file('audio.ogg')) throw new Error('export zip missing map.json or audio');

  await postJson('/api/scores', { mapId: 'smoke-map', player: 'Tester', score: 1234, combo: 5 });

  const mapsAfterSmokeWrites = await getJson('/api/maps');
  const leakedSmokeMap = mapsAfterSmokeWrites.find(item => ['smoke-map', 'creator-smoke', 'zip-smoke', 'bad-map'].includes(item.id));
  if (leakedSmokeMap) throw new Error(`smoke map leaked into /api/maps: ${leakedSmokeMap.id}`);

  console.log(`✓ smoke-server: OK (${base})`);
} finally {
  await stopServer();
  await rm(SMOKE_MAPS_DIR, { recursive: true, force: true });
}
