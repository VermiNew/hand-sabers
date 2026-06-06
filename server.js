import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import JSZip from 'jszip';
import { createServer } from 'http';
import { readdir, readFile, writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AUDIO_EXT_RE,
  MAX_BEATS_EXTENDED,
  MAX_IMPORT_BYTES,
  assertFileSize,
  normalizeMap,
  sanitizeMapId,
  validateZipEntryNames,
} from './src/core/map-format.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAPS_DIR = path.join(__dirname, 'maps');
const MAPS_DIR = path.resolve(process.env.HAND_SABERS_MAPS_DIR || process.env.MAPS_DIR || DEFAULT_MAPS_DIR);
const MAP_BEATDATA_DIR = path.join(MAPS_DIR, 'beatdata');
const MAP_AUDIO_DIR = path.join(MAPS_DIR, 'audio');
const LEGACY_MAP_AUDIO_DIR = path.join(MAPS_DIR, '_audio');

for (const dir of [MAPS_DIR, MAP_BEATDATA_DIR, MAP_AUDIO_DIR, LEGACY_MAP_AUDIO_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function safeMapId(id) {
  return sanitizeMapId(id, '');
}

function isMapFile(name) {
  return name.endsWith('.json') && !name.startsWith('_');
}

const HIDDEN_TEST_MAP_IDS = new Set(['smoke-map', 'creator-smoke', 'zip-smoke', 'bad-map']);
function isHiddenTestMapId(id) {
  return HIDDEN_TEST_MAP_IDS.has(id) || id.startsWith('__smoke-');
}

const AUDIO_MIME_BY_EXT = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.flac', 'audio/flac'],
]);

function audioMimeForFile(fileName) {
  return AUDIO_MIME_BY_EXT.get(path.extname(fileName || '').toLowerCase()) || 'application/octet-stream';
}

function safeStoredAudioName(name) {
  const base = path.basename(String(name || ''));
  return /^[a-zA-Z0-9_-]+\.(mp3|ogg|wav|flac)$/i.test(base) ? base : '';
}

function mapFilePath(id) {
  return path.join(MAP_BEATDATA_DIR, `${id}.json`);
}

function legacyMapFilePath(id) {
  return path.join(MAPS_DIR, `${id}.json`);
}

async function readMapById(id) {
  return await readJsonFile(mapFilePath(id)) || await readJsonFile(legacyMapFilePath(id));
}

async function writeMapById(map) {
  await writeFile(mapFilePath(map.id), JSON.stringify(map, null, 2));
}

async function listStoredMapFiles() {
  const files = [];
  const seen = new Set();

  try {
    for (const f of (await readdir(MAP_BEATDATA_DIR)).filter(isMapFile)) {
      const id = f.replace('.json', '');
      if (isHiddenTestMapId(id)) continue;
      seen.add(id);
      files.push({ id, filename: f, storage: 'beatdata' });
    }
  } catch {}

  try {
    for (const f of (await readdir(MAPS_DIR)).filter(isMapFile)) {
      const id = f.replace('.json', '');
      if (seen.has(id) || isHiddenTestMapId(id)) continue;
      files.push({ id, filename: f, storage: 'legacy' });
    }
  } catch {}

  files.sort((a, b) => a.id.localeCompare(b.id));
  return files;
}

async function findStoredAudioForMap(id, map = null) {
  const stored = safeStoredAudioName(map?.meta?.serverAudioFile);
  const candidates = [];

  if (stored) {
    candidates.push({ dir: MAP_AUDIO_DIR, fileName: stored });
    candidates.push({ dir: LEGACY_MAP_AUDIO_DIR, fileName: stored });
  }

  for (const dir of [MAP_AUDIO_DIR, LEGACY_MAP_AUDIO_DIR]) {
    try {
      const files = await readdir(dir);
      for (const f of files) {
        if (f.startsWith(`${id}.`) && AUDIO_EXT_RE.test(f)) candidates.push({ dir, fileName: f });
      }
    } catch {}
  }

  for (const candidate of candidates) {
    const fullPath = path.join(candidate.dir, candidate.fileName);
    if (existsSync(fullPath)) {
      return {
        fullPath,
        fileName: candidate.fileName,
        publicName: path.posix.basename(String(map?.meta?.audioFile || candidate.fileName)),
      };
    }
  }

  return null;
}

async function removeAudioFilesForMap(id, keepFullPath = null) {
  const safeId = safeMapId(id);
  if (!safeId) return 0;
  let removed = 0;
  const keep = keepFullPath ? path.resolve(keepFullPath) : null;

  for (const dir of [MAP_AUDIO_DIR, LEGACY_MAP_AUDIO_DIR]) {
    try {
      const files = await readdir(dir);
      for (const f of files) {
        if (!f.startsWith(`${safeId}.`) || !AUDIO_EXT_RE.test(f)) continue;
        const fullPath = path.resolve(dir, f);
        if (keep && fullPath === keep) continue;
        try { await unlink(fullPath); removed++; } catch {}
      }
    } catch {}
  }
  return removed;
}

async function persistAudioBufferForMap(map, buffer, originalName = 'audio.ogg') {
  const cleanName = path.basename(String(originalName || 'audio.ogg'));
  const ext = path.extname(cleanName).toLowerCase();
  if (!AUDIO_EXT_RE.test(cleanName)) throw new Error('Nieobsługiwany format audio. Dozwolone: mp3, ogg, wav, flac.');
  const storedFile = `${map.id}${ext}`;
  const storedPath = path.join(MAP_AUDIO_DIR, storedFile);
  await removeAudioFilesForMap(map.id, storedPath);
  await writeFile(storedPath, Buffer.from(buffer));

  map.meta = {
    ...(map.meta || {}),
    audioFile: cleanName,
    serverAudioFile: storedFile,
    audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
  };

  return { originalName: cleanName, storedFile, size: Buffer.byteLength(buffer) };
}

async function persistZipAudioForMap(entries, map) {
  const audioFile = entries.find(f => !f.dir && AUDIO_EXT_RE.test(f.name));
  if (!audioFile) return null;

  const originalName = path.posix.basename(audioFile.name);
  const audioBytes = Buffer.from(await audioFile.async('uint8array'));
  return await persistAudioBufferForMap(map, audioBytes, originalName);
}

async function readJsonFile(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return fallback; }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const ok = name.endsWith('.json') || name.endsWith('.zip') || AUDIO_EXT_RE.test(name) || String(file.mimetype || '').startsWith('audio/');
    cb(ok ? null : new Error('Nieobsługiwany typ pliku. Dozwolone: .json, .zip i audio.'), ok);
  },
});

const app = express();

// Prosty rate limiter in-memory (bez zależności)
const _rlMap = new Map();
function rateLimit(ip, key, maxPerMinute) {
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
app.use(express.static(__dirname, { dotfiles: 'deny', index: false }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'hand-sabers', time: new Date().toISOString(), maxImportBytes: MAX_IMPORT_BYTES });
});

// GET /api/maps — lista map
app.get('/api/maps', async (_req, res) => {
  try {
    res.json(await listStoredMapFiles());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/maps/:id/export.zip — ZIP z map.json + audio, jeśli audio jest zapisane na serwerze
app.get('/api/maps/:id/export.zip', async (req, res) => {
  const id = safeMapId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const data = await readMapById(id);
  if (!data) return res.status(404).json({ error: 'Not found' });

  res.attachment(`${id}.zip`);
  const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
  archive.on('error', err => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.destroy(err);
  });
  archive.pipe(res);
  archive.append(JSON.stringify(data, null, 2), { name: 'map.json' });
  const audio = await findStoredAudioForMap(id, data);
  if (audio) archive.file(audio.fullPath, { name: audio.publicName });
  await archive.finalize();
});

// GET /api/maps/:id/audio — pobierz audio zapisane z ZIP importu
app.get('/api/maps/:id/audio', async (req, res) => {
  try {
    const id = safeMapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const map = await readMapById(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    const audio = await findStoredAudioForMap(id, map);
    if (!audio) return res.status(404).json({ error: 'Audio not found' });
    const bytes = await readFile(audio.fullPath);
    res.type(audioMimeForFile(audio.publicName || audio.fileName));
    res.send(bytes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/maps/:id — pobierz mapę
app.get('/api/maps/:id', async (req, res) => {
  try {
    const id = safeMapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const data = await readMapById(id);
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
    const map = normalizeMap(req.body, { maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
    await writeMapById(map);
    res.json({ ok: true, id: map.id, beats: map.beats.length, storage: 'beatdata' });
  } catch (e) {
    res.status(400).json({ error: e.message });
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
    const map = normalizeMap(raw, { requireBeats: false, maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
    let audio = null;

    if (req.file) {
      assertFileSize(req.file);
      audio = await persistAudioBufferForMap(map, req.file.buffer, req.file.originalname);
    } else {
      const existingAudio = await findStoredAudioForMap(map.id, map);
      if (existingAudio) {
        map.meta = {
          ...(map.meta || {}),
          serverAudioFile: existingAudio.fileName,
          audioUrl: `/api/maps/${encodeURIComponent(map.id)}/audio`,
        };
      }
    }

    await writeMapById(map);
    res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio ? audio.originalName : null, storage: 'beatdata', map });
  } catch (e) {
    res.status(400).json({ error: e.message });
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
      const entries = Object.values(zip.files);
      validateZipEntryNames(entries);
      const jsonFile = zip.file('map.json');
      if (!jsonFile) return res.status(400).json({ error: 'Brak map.json w ZIP.' });
      rawMap = JSON.parse(await jsonFile.async('string'));
      const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
      const audio = await persistZipAudioForMap(entries, map);
      await writeMapById(map);
      return res.json({ ok: true, id: map.id, beats: map.beats.length, audio: audio ? audio.originalName : null, storage: 'beatdata', map });
    } else if (originalName.toLowerCase().endsWith('.json')) {
      rawMap = JSON.parse(req.file.buffer.toString('utf8'));
    } else {
      return res.status(400).json({ error: 'Endpoint importuje tylko mapy .json lub .zip.' });
    }

    const map = normalizeMap(rawMap, { fallbackId: path.basename(originalName, path.extname(originalName)), maxBeats: MAX_BEATS_EXTENDED, throwOnLimit: true });
    await writeMapById(map);
    res.json({ ok: true, id: map.id, beats: map.beats.length, audio: null, storage: 'beatdata', map });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/maps/:id — usuń mapę
app.delete('/api/maps/:id', async (req, res) => {
  try {
    const id = safeMapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const map = await readMapById(id);
    const audio = await findStoredAudioForMap(id, map);
    let deleted = false;
    for (const filePath of [mapFilePath(id), legacyMapFilePath(id)]) {
      try { await unlink(filePath); deleted = true; } catch {}
    }
    await removeAudioFilesForMap(id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// GET /api/maps/by-title/:title — szukaj mapy po tytule
app.get('/api/maps/by-title/:title', async (req, res) => {
  try {
    const maps = await listStoredMapFiles();
    for (const item of maps) {
      const map = await readMapById(item.id);
      if (!map) continue;
      if (map.meta?.title?.toLowerCase() === req.params.title.toLowerCase()) {
        return res.json(map);
      }
    }
    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Leaderboard ───────────────────────────────────────────────────────────────
const SCORES_FILE = path.join(MAPS_DIR, '_scores.json');

async function readScores() {
  const scores = await readJsonFile(SCORES_FILE, []);
  return Array.isArray(scores) ? scores : [];
}
async function writeScores(scores) {
  await writeFile(SCORES_FILE, JSON.stringify(scores, null, 2));
}

// GET /api/scores?map=id&limit=20
app.get('/api/scores', async (req, res) => {
  try {
    let scores = await readScores();
    if (req.query.map) scores = scores.filter(s => s.mapId === req.query.map);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    scores.sort((a, b) => b.score - a.score);
    res.json(scores.slice(0, limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/scores — zapisz wynik
app.post('/api/scores', async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (rateLimit(ip, 'scores', 20)) {
      return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
    }
    const { mapId, player, score, combo, date } = req.body;
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0) return res.status(400).json({ error: 'Invalid score' });
    const scores = await readScores();
    scores.push({
      mapId:  sanitizeMapId(mapId || 'random', 'random'),
      player: String(player || 'Gracz').slice(0, 40),
      score:  Math.floor(numericScore),
      combo:  Math.floor(combo || 0),
      date:   date   || new Date().toISOString(),
    });
    await writeScores(scores);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Plik jest za duży. Limit: 100 MB.' });
  res.status(400).json({ error: err?.message || 'Błędne żądanie.' });
});

const server = createServer(app);
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hand Sabers → http://localhost:${PORT}`);
  console.log(`Przez VPN → http://<twoje-ip>:${PORT}`);
});

function shutdown(signal) {
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
