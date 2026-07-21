import express from 'express';
import type { ErrorRequestHandler, Request } from 'express';
import multer from 'multer';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { existsSync, mkdirSync, readFileSync } from 'fs';
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
import { registerRoomRoutes } from './routes/room-routes.js';
import { registerTrackingSessionRoutes } from './routes/tracking-session-routes.js';
import { RateLimiter } from './utils.js';
import { RoomRegistry } from './realtime/room-registry.js';
import { registerRealtimeServer } from './realtime/socket.js';
import { TrackingSessionRegistry } from './realtime/tracking-session-registry.js';
import { registerRemoteTrackingServer } from './realtime/remote-tracking-socket.js';

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
if (process.env.HAND_SABERS_TRUST_PROXY === '1') app.set('trust proxy', 1);

const limiter = new RateLimiter();
const rooms = new RoomRegistry();
const trackingSessions = new TrackingSessionRegistry();
const rateLimit = (ip: string, key: string, maxPerMinute: number): boolean =>
  limiter.check(ip, key, maxPerMinute);

app.use(express.json({ limit: '100mb' }));

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();

  try {
    const host = req.get('host');
    const originUrl = new URL(origin);
    if (host && originUrl.host === host) return next();
    const [hostName = '', hostPort = ''] = String(host || '').toLowerCase().split(':');
    if (originUrl.hostname.toLowerCase() === hostName && ['3000', '5173'].includes(originUrl.port) && ['3000', '5173'].includes(hostPort)) {
      return next();
    }
  } catch {}

  return res.status(403).json({ error: 'Niedozwolone źródło żądania.' });
});

const BLOCKED_STATIC_RE = /^\/(?:node_modules|maps|scripts|server|src|tests|dist-server|\.claude|\.git)(?:\/|$)|^\/(?:server\.(?:js|ts)|package(?:-lock)?\.json|TODO\.md|README(?:\.pl)?\.md|vite\.config\.js|tsconfig(?:\.server)?\.json|AGENTS\.md)$/i;
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
registerRoomRoutes({ app, rooms, rateLimit });
registerTrackingSessionRoutes({ app, sessions: trackingSessions, rateLimit });

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    const limitMb = Math.round(MAX_IMPORT_BYTES / 1024 / 1024);
    return res.status(413).json({ error: `Plik jest za duży. Limit: ${limitMb} MB.` });
  }
  res.status(400).json({ error: err?.message || 'Błędne żądanie.' });
};
app.use(errorHandler);

const tlsCertPath = process.env.HAND_SABERS_TLS_CERT;
const tlsKeyPath = process.env.HAND_SABERS_TLS_KEY;
if (Boolean(tlsCertPath) !== Boolean(tlsKeyPath)) {
  throw new Error('HTTPS wymaga jednocześnie HAND_SABERS_TLS_CERT i HAND_SABERS_TLS_KEY.');
}
const secure = Boolean(tlsCertPath && tlsKeyPath);
const server = secure
  ? createHttpsServer({ cert: readFileSync(tlsCertPath!), key: readFileSync(tlsKeyPath!) }, app)
  : createHttpServer(app);
const realtimeServer = registerRealtimeServer(server, rooms);
const remoteTrackingServer = registerRemoteTrackingServer(server, trackingSessions);
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  const protocol = secure ? 'https' : 'http';
  console.log(`Hand Sabers → ${protocol}://localhost:${PORT}`);
  console.log(`W sieci lokalnej → ${protocol}://<twoje-ip-lub-hostname>:${PORT}`);
  if (!secure) console.log('Kamera telefonu poza localhost wymaga HTTPS (HAND_SABERS_TLS_CERT + HAND_SABERS_TLS_KEY).');
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} — zamykam serwer…`);
  realtimeServer.close();
  remoteTrackingServer.close();
  rooms.destroy();
  trackingSessions.destroy();
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
