import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { requireFrontendDist } from '../server/static-root.ts';

test('static root requires a built dist instead of falling back to project files', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'hand-sabers-static-root-'));
  try {
    assert.throws(() => requireFrontendDist(projectRoot), /npm run build/);

    const distDir = path.join(projectRoot, 'dist');
    await mkdir(distDir);
    await writeFile(path.join(distDir, 'index.html'), '<!doctype html>');
    assert.equal(requireFrontendDist(projectRoot), distDir);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
