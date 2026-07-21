import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['server.js', 'vite.config.js', 'scripts', 'src'];
const files = [];

function collect(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) collect(join(path, entry));
  } else if (/\.(m?js)$/.test(path)) {
    files.push(path);
  }
}

for (const root of roots) collect(root);

let failed = false;
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) {
    failed = true;
    console.error(`\n✗ ${file}\n${res.stderr || res.stdout}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

process.exit(failed ? 1 : 0);
