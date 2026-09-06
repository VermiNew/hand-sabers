import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PROJECT_ROOT = process.cwd();
const TEMP_ROOT = await mkdtemp(path.join(tmpdir(), 'hand-sabers-csp-'));
const SERVER_ENTRY = path.join(TEMP_ROOT, 'dist-server', 'server.js');
const MEDIAPIPE_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
const MEDIAPIPE_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function prepareTemporaryProject() {
  await Promise.all([
    cp(path.join(PROJECT_ROOT, 'dist'), path.join(TEMP_ROOT, 'dist'), { recursive: true }),
    cp(path.join(PROJECT_ROOT, 'dist-server'), path.join(TEMP_ROOT, 'dist-server'), { recursive: true }),
    cp(path.join(PROJECT_ROOT, 'package.json'), path.join(TEMP_ROOT, 'package.json')),
    mkdir(path.join(TEMP_ROOT, 'maps'), { recursive: true }),
  ]);
  await symlink(path.join(PROJECT_ROOT, 'node_modules'), path.join(TEMP_ROOT, 'node_modules'), 'junction');
}

async function startServer(security) {
  await writeFile(path.join(TEMP_ROOT, 'config.json'), `${JSON.stringify({ security }, null, 2)}\n`);
  const port = await getFreePort();
  const output = [];
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: TEMP_ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => output.push(chunk.toString()));
  server.stderr.on('data', chunk => output.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited during startup.\n${output.join('')}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return { baseUrl, output, server };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await stopServer(server);
  throw new Error(`Server did not start at ${baseUrl}.\n${output.join('')}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    let forceTimeout;
    const gracefulTimeout = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL');
      forceTimeout = setTimeout(() => reject(new Error('Server did not exit after SIGKILL.')), 3_000);
    }, 3_000);
    server.once('exit', () => {
      clearTimeout(gracefulTimeout);
      if (forceTimeout) clearTimeout(forceTimeout);
      resolve();
    });
    server.kill('SIGTERM');
  });
}

async function removeTemporaryProject() {
  const resolvedTempRoot = path.resolve(TEMP_ROOT);
  const resolvedSystemTemp = `${path.resolve(tmpdir())}${path.sep}`;
  if (!resolvedTempRoot.startsWith(resolvedSystemTemp)) {
    throw new Error(`Refusing to remove unexpected temporary path: ${resolvedTempRoot}`);
  }
  await rm(resolvedTempRoot, { recursive: true, force: true });
}

let activeServer = null;
let browser = null;
try {
  const sourceConfig = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'config.json'), 'utf8'));
  if (sourceConfig.security !== false) {
    throw new Error('Checked-in config.json must keep security=false for local development.');
  }
  await prepareTemporaryProject();

  const unsecured = await startServer(false);
  activeServer = unsecured.server;
  const unsecuredResponse = await fetch(`${unsecured.baseUrl}/beat-sabers-3d.html`);
  if (unsecuredResponse.headers.has('content-security-policy')) {
    throw new Error('security=false unexpectedly emitted Content-Security-Policy.');
  }
  await stopServer(unsecured.server);
  activeServer = null;

  const secured = await startServer(true);
  activeServer = secured.server;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const criticalErrors = [];
  page.on('pageerror', error => criticalErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') criticalErrors.push(`console: ${message.text()}`);
  });

  const response = await page.goto(`${secured.baseUrl}/beat-sabers-3d.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  if (!response?.ok()) throw new Error(`Game page failed: ${response?.status() ?? 'no response'}`);
  const csp = response?.headers()['content-security-policy'] || '';
  const scriptSources = csp
    .split(';')
    .map(directive => directive.trim().split(/\s+/).map(token => token.toLowerCase()))
    .find(tokens => tokens[0] === 'script-src') || [];
  if (!scriptSources.includes("'wasm-unsafe-eval'")) {
    throw new Error(`CSP script-src does not allow WebAssembly: ${csp}`);
  }
  if (scriptSources.includes("'unsafe-eval'")) {
    throw new Error(`CSP script-src contains broad unsafe-eval: ${csp}`);
  }

  const modelBytes = await page.evaluate(async ({ bundleUrl, wasmUrl, modelUrl }) => {
    const visionModule = await import(bundleUrl);
    const vision = await visionModule.FilesetResolver.forVisionTasks(wasmUrl);
    const modelResponse = await fetch(modelUrl);
    if (!modelResponse.ok) throw new Error(`Model download failed: ${modelResponse.status}`);
    const modelAssetBuffer = new Uint8Array(await modelResponse.arrayBuffer());
    const landmarker = await visionModule.HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    landmarker.close();
    return modelAssetBuffer.byteLength;
  }, {
    bundleUrl: MEDIAPIPE_BUNDLE,
    wasmUrl: MEDIAPIPE_WASM,
    modelUrl: MEDIAPIPE_MODEL,
  });

  if (criticalErrors.length) throw new Error(criticalErrors.join('\n'));
  if (modelBytes <= 0) throw new Error('MediaPipe model was empty.');
  console.log(`✓ smoke-mediapipe-csp: OK (${(modelBytes / 1024 / 1024).toFixed(1)} MiB model)`);
} finally {
  const cleanupErrors = [];
  try {
    if (browser) await browser.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    if (activeServer) await stopServer(activeServer);
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await removeTemporaryProject();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'CSP smoke cleanup failed.');
}
