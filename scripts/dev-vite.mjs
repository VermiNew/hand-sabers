import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const children = [];

function run(name, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('exit', code => {
    if (code && code !== 0) console.error(`${name} zakończył się kodem ${code}`);
  });
  return child;
}

run('server', 'npm', ['run', 'server'], { PORT: process.env.PORT || '3000' });
run('vite', 'npm', ['exec', 'vite', '--', '--host', '0.0.0.0']);

function shutdown(signal) {
  for (const child of children) child.kill(signal);
  setTimeout(() => process.exit(0), 250).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
