import express from 'express';
import type { ErrorRequestHandler, Request } from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import JSZip from 'jszip';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AUDIO_EXT_RE,
  MAX_BEATS_DEFAULT,
  MAX_IMPORT_BYTES,
  assertFileSize,
  normalizeMap,
  sanitizeMapId,
  validateZipEntryNames,
} from './src/core/map-format.js';
import { createMapStorage } from './server/storage/maps.js';
import { createScoreStorage } from './server/storage/scores.js';
import { createAudioStorage, type ZipAudioEntry } from './server/storage/audio.js';
import { registerScoreRoutes } from './server/routes/scores.js';

const require = createRequire(import.meta.url);
const archiver: { ZipArchive: new (options?: unknown) => ArchiveLike } = require('archiver');
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.basename(SERVER_DIR) === 'dist-server' ? path.dirname(SERVER_DIR) : SERVER_DIR;
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

interface ArchiveLike {
  on(event: 'error', handler: (err: Error) => void): void;
  pipe(destination: NodeJS.WritableStream): void;
  append(source: string | Buffer, data: { name: string }): void;
  file(filePath: string, data: { name: string }): void;
  finalize(): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeMapId(id: unknown): string {
  return sanitizeMapId(id, '');
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

// GET /api/maps — lista map
app.get('/api/maps', async (_req, res) => {
  try {
    res.json(await mapStorage.list());
  } catch (e) {
    res.status(500).json({ error: errorMessage(e) });
  }
});

// GET /api/maps/:id/export.zip — ZIP z map.json + audio, jeśli audio jest zapisane na serwerze
app.get('/api/maps/:id/export.zip', async (req, res) => {
  const id = safeMapId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const data = await mapStorage.read(id);
  if (!data) return res.status(404).json({ error: 'Not found' });

  res.attachment(`${id}.zip`);
  const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
  archive.on('error', err => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.destroy(err);
  });
  archive.pipe(res);
  archive.append(JSON.stringify(data, null, 2), { name: 'map.json' });
  const audio = await audioStorage.find(id, data);
  if (audio) archive.file(audio.fullPath, { name: audio.publicName });
  await archive.finalize();
});

// GET /api/maps/:id/audio — pobierz audio zapisane z ZIP importu
app.get('/api/maps/:id/audio', async (req, res) => {
  try {
    const id = safeMapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const map = await mapStorage.read(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    const audio = await audioStorage.find(id, map);
    if (!audio) return res.status(404).json({ error: 'Audio not found' });
    const bytes = await readFile(audio.fullPath);
    res.type(audioStorage.mimeForFile(audio.publicName || audio.fileName));
    res.send(bytes);
  } catch (e) {
    res.status(500).json({ error: errorMessage(e) });
  }
});

// GET /api/maps/:id — pobierz mapę
app.get('/api/maps/:id', async (req, res) => {
  try {
    const id = safeMapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const data = await mapStorage.read(id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST /api/maps — zapisz beatdata JSON do maps/beatdata/<id>.json
app.post('/api/maps', async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (rateLimit(ip, 'maps-save', 30)) {
      return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
    }
    const map = normalizeMap(req.body, { maxBeats: MAX_BEATS_DEFAULT, throwOnLimit: true });
    await mapStorage.write(map);
    res.json({ ok: true, id: map.id, beats: map.beats.length, storage: 'beatdata' });
  } catch (e) {
    res.status(400).json({ error: errorMessage(e) });
  }
});

// POST /api/maps/save — zapis z kreatora: beatdata + opcjonalne audio pod tym samym ID
app.post('/api/maps/save', upload.single('audio'), async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (rateLimit(ip, 'maps-save', 30)) {
      return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
    }
    const raw = req.body?.map ? JSON.parse(req.body.map) : req.body;
    const map = normalizeMap(raw, { requireBeats: false, maxBeats: MAX_BEATS_DEFAULT, throwOnLimit: true });
    let audio = null;

    if (req.file) {
      assertFileSize(req.file);
      audio = await audioStorage.persistBuffer(map, req.file.buffer, req.file.originalname);
    } else {
      const existingAudio = await audioStorage.find(map.id, map);
      if (existingAudio) {
        map.meta = {
          ...(map.meta || {}),
          serverAudioFile: existingAudio.fileName,
          audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
        };
      }
    }

    await mapStorage.write(map);
    res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio ? audio.originalName : null, storage: 'beatdata', map });
  } catch (e) {
    res.status(400).json({ error: errorMessage(e) });
  }
});

// POST /api/maps/import — import .json lub .zip z map.json
app.post('/api/maps/import', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (rateLimit(ip, 'import', 10)) {
      return res.status(429).json({ error: 'Za dużo importów. Spróbuj ponownie za chwilę.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
    assertFileSize(req.file);

    const originalName = String(req.file.originalname || 'map');
    let rawMap;

    if (originalName.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(req.file.buffer);
      const entries = Object.values(zip.files) as ZipAudioEntry[];
      validateZipEntryNames(entries);
      const jsonFile = zip.file('map.json');
      if (!jsonFile) return res.status(400).json({ error: 'Brak map.json w ZIP.' });
      rawMap = JSON.parse(await jsonFile.async('string'));
      const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_DEFAULT, throwOnLimit: true });
      const audio = await audioStorage.persistZip(entries, map);
      await mapStorage.write(map);
      return res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio ? audio.originalName : null, storage: 'beatdata', map });
    } else if (originalName.toLowerCase().endsWith('.json')) {
      rawMap = JSON.parse(req.file.buffer.toString('utf8'));
    } else {
      return res.status(400).json({ error: 'Endpoint importuje tylko mapy .json lub .zip.' });
    }

    const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_DEFAULT, throwOnLimit: true });
    await mapStorage.write(map);
    res.json({ ok: true, id: map.id, beats: map.beats.length, audio: null, storage: 'beatdata', map });
  } catch (e) {
    res.status(400).json({ error: errorMessage(e) });
  }
});

// DELETE /api/maps/:id — usuń mapę
app.delete('/api/maps/:id', async (req, res) => {
  try {
    const id = safeMapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await mapStorage.delete(id);
    await audioStorage.remove(id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// GET /api/maps/by-title/:title — szukaj mapy po tytule
app.get('/api/maps/by-title/:title', async (req, res) => {
  try {
    const maps = await mapStorage.list();
    for (const item of maps) {
      const map = await mapStorage.read(item.id);
      if (!map) continue;
      if (map.meta?.title?.toLowerCase() === req.params.title.toLowerCase()) {
        return res.json(map);
      }
    }
    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    res.status(500).json({ error: errorMessage(e) });
  }
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
