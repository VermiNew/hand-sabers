import express from 'express';
import type { ErrorRequestHandler, Request } from 'express';
import multer from 'multer';
import { createServer } from 'http';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AUDIO_EXT_RE,
  MAX_IMPORT_BYTES,
} from '../src/core/map-format.js';
import { createMapStorage } from './storage/maps.js';
import { createScoreStorage } from './storage/scores.js';
import { createAudioStorage } from './storage/audio.js';
import { registerScoreRoutes } from './routes/scores.js';
import { registerMapReadRoutes } from './routes/maps-read.js';
import { registerMapWriteRoutes } from './routes/maps-write.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PROJECT_ROOT = path.resolve(SERVER_DIR, '..');
const COMPILED_PROJECT_ROOT = path.resolve(SERVER_DIR, '..', '..');
const PROJECT_ROOT_CANDIDATES = [SOURCE_PROJECT_ROOT, COMPILED_PROJECT_ROOT];
const PROJECT_ROOT = PROJECT_ROOT_CANDIDATES.find(candidate => existsSync(path.join(candidate, 'package.json')))
  || SOURCE_PROJECT_ROOT;
const FRONTEND_DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const STATIC_DIR = existsSync(path.join(FRONTEND_DIST_DIR, 'index.html')) ? FRONTEND_DIST_DIR : PROJECT_ROOT;
const DEFAULT_MAPS_DIR = path.join(PROJECT_ROOT, 'maps');
const MAPS_DIR = path.resolve(process.env.HAND_SABERS_MAPS_DIR || process.env.MAPS_DIR || DEFAULT_MAPS_DIR);
const MAP_BEATDATA_DIR = path.join(MAPS_DIR, 'beatdata');
const MAP_AUDIO_DIR = path.join(MAPS_DIR, 'audio');
const LEGACY_MAP_AUDIO_DIR = path.join(MAPS_DIR, '_audio');

for (const dir of [MAPS_DIR, MAP_BEATDATA_DIR, MAP_AUDIO_DIR, LEGACY_MAP_AUDIO_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const HIDDEN_TEST_MAP_IDS = new Set(['smoke-map', 'creator-smoke', 'zip-smoke', 'bad-map']);
const mapStorage = createMapStorage({
  mapsDir: MAPS_DIR,
  beatdataDir: MAP_BEATDATA_DIR,
  hiddenIds: HIDDEN_TEST_MAP_IDS,
});
const audioStorage = createAudioStorage({
  audioDir: MAP_AUDIO_DIR,
  legacyAudioDir: LEGACY_MAP_AUDIO_DIR,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES },
  fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    const name = String(file.originalname || '').toLowerCase();
    const ok = name.endsWith('.json') || name.endsWith('.zip') || AUDIO_EXT_RE.test(name) || String(file.mimetype || '').startsWith('audio/');
    if (ok) cb(null, true);
    else cb(new Error('Nieobsługiwany typ pliku. Dozwolone: .json, .zip i audio.'));
  },
});

const app = express();

// Prosty rate limiter in-memory (bez zależności)
const _rlMap = new Map<string, number[]>();
function rateLimit(ip: string, key: string, maxPerMinute: number): boolean {
  const mapKey = `${key}:${ip}`;
  const now = Date.now();
  const calls = (_rlMap.get(mapKey) || []).filter(t => now - t < 60_000);
  calls.push(now);
  _rlMap.set(mapKey, calls);
  return calls.length > maxPerMinute;
}
// Sprzątanie co 5 minut
setInterval(() => {
  const now = Date.now();
  for (const [k, calls] of _rlMap) {
    if (!calls.some(t => now - t < 60_000)) _rlMap.delete(k);
  }
}, 300_000).unref();

app.use(express.json({ limit: '100mb' }));

const BLOCKED_STATIC_RE = /^\/(?:node_modules|maps|scripts)(?:\/|$)|^\/(?:server\.js|package(?:-lock)?\.json|TODO\.md|README\.md|vite\.config\.js)$/i;
app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && BLOCKED_STATIC_RE.test(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
});
app.use(express.static(STATIC_DIR, { dotfiles: 'deny', index: false }));
app.get('/', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'hand-sabers', time: new Date().toISOString(), maxImportBytes: MAX_IMPORT_BYTES });
});

registerMapReadRoutes({ app, mapStorage, audioStorage });

registerMapWriteRoutes({
  app,
  mapStorage,
  audioStorage,
  uploadAudio: upload.single('audio'),
  uploadFile: upload.single('file'),
  rateLimit,
});

// ── Leaderboard ───────────────────────────────────────────────────────────────
const SCORES_FILE = path.join(MAPS_DIR, '_scores.json');
const scoreStorage = createScoreStorage(SCORES_FILE);
registerScoreRoutes({ app, storage: scoreStorage, rateLimit });

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Plik jest za duży. Limit: 100 MB.' });
  res.status(400).json({ error: err?.message || 'Błędne żądanie.' });
};
app.use(errorHandler);

const server = createServer(app);
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hand Sabers → http://localhost:${PORT}`);
  console.log(`Przez VPN → http://<twoje-ip>:${PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} — zamykam serwer…`);
  server.close(err => {
    if (err) {
      console.error('Błąd przy zamykaniu serwera:', err);
      process.exit(1);
    }
    console.log('Serwer zamknięty.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
