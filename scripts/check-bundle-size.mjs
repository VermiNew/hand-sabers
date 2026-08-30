import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const DIST_DIR = path.resolve('dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');
const MAX_THREE_BYTES = 550 * 1024;
const MAX_THREE_GZIP_BYTES = 140 * 1024;

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const assetNames = await readdir(ASSETS_DIR);
const threeChunks = assetNames.filter(name => /^three-[A-Za-z0-9_-]+\.js$/.test(name));
if (threeChunks.length !== 1) {
  throw new Error(`Oczekiwano jednego chunku Three.js, znaleziono: ${threeChunks.length}.`);
}

const threePath = path.join(ASSETS_DIR, threeChunks[0]);
const rawBytes = (await stat(threePath)).size;
const gzipBytes = gzipSync(await readFile(threePath)).byteLength;
if (rawBytes > MAX_THREE_BYTES || gzipBytes > MAX_THREE_GZIP_BYTES) {
  throw new Error(
    `Chunk Three.js przekracza budżet: ${formatKiB(rawBytes)} raw / ${formatKiB(gzipBytes)} gzip `
    + `(limit ${formatKiB(MAX_THREE_BYTES)} / ${formatKiB(MAX_THREE_GZIP_BYTES)}).`,
  );
}

const creatorHtml = await readFile(path.join(DIST_DIR, 'map-creator.html'), 'utf8');
if (/rel="modulepreload"[^>]+three-[A-Za-z0-9_-]+\.js/.test(creatorHtml)) {
  throw new Error('Kreator nie może preloadować chunku Three.js przed startem podstawowego UI.');
}

console.log(`✓ bundle: Three.js ${formatKiB(rawBytes)} raw / ${formatKiB(gzipBytes)} gzip; kreator ładuje go leniwie`);
