import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const children = [];

const tscCli = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
const viteCli = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const serverEntry = path.join(rootDir, 'dist-server', 'server.js');

function spawnNode(name, args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('error', error => {
    console.error(`${name}: nie udało się uruchomić procesu`, error);
  });
  child.on('exit', code => {
    if (code && code !== 0) console.error(`${name} zakończył się kodem ${code}`);
  });
  return child;
}

function runNodeOnce(name, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, ...env },
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${name} zakończył się kodem ${code ?? 'unknown'}`));
    });
  });
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host });
      socket.setTimeout(500);

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      const retry = () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Backend nie otworzył ${host}:${port} w ciągu ${timeoutMs / 1000}s`));
          return;
        }
        setTimeout(tryConnect, 75);
      };

      socket.once('error', retry);
      socket.once('timeout', retry);
    };

    tryConnect();
  });
}

const port = Number(process.env.PORT || 3000);

// Build only the backend once. Calling npm.cmd directly with shell:false causes
// spawn EINVAL on newer Node releases on Windows, so dev mode launches the
// underlying Node CLIs directly instead of nesting npm processes.
await runNodeOnce('server:build', [tscCli, '-p', 'tsconfig.server.json']);

spawnNode('server', ['--watch', serverEntry], { PORT: String(port) });
spawnNode('server:compile', [tscCli, '-p', 'tsconfig.server.json', '--watch', '--preserveWatchOutput']);

// Do not expose Vite until Express is actually listening. This prevents the
// initial /api/* requests from racing the backend and failing with ECONNREFUSED.
await waitForPort(port);
spawnNode('vite', [viteCli, '--host', '0.0.0.0']);

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
  setTimeout(() => process.exit(0), 250).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
