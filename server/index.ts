import express from 'express';
import type { ErrorRequestHandler, Request } from 'express';
import multer from 'multer';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';
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
import { FileMutex, KeyedMutex, RateLimiter } from './utils.js';
import { RoomRegistry } from './realtime/room-registry.js';
import { registerRealtimeServer } from './realtime/socket.js';
import { TrackingSessionRegistry } from './realtime/tracking-session-registry.js';
import { registerRemoteTrackingServer } from './realtime/remote-tracking-socket.js';
import { createUploadConcurrencyGate } from './upload-concurrency.js';
import { createOriginPolicy } from './origin-policy.js';
import { requireFrontendDist } from './static-root.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PROJECT_ROOT = path.resolve(SERVER_DIR, '..');
const COMPILED_PROJECT_ROOT = path.resolve(SERVER_DIR, '..', '..');
const PROJECT_ROOT_CANDIDATES = [SOURCE_PROJECT_ROOT, COMPILED_PROJECT_ROOT];
const PROJECT_ROOT = PROJECT_ROOT_CANDIDATES.find(candidate => existsSync(path.join(candidate, 'package.json')))
  || SOURCE_PROJECT_ROOT;
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');
const projectConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as { security?: unknown; allowedOrigins?: unknown };
if (typeof projectConfig.security !== 'boolean') {
  throw new Error('config.json: pole "security" musi mieć wartość true albo false.');
}
if (projectConfig.allowedOrigins !== undefined
  && (!Array.isArray(projectConfig.allowedOrigins) || projectConfig.allowedOrigins.some(value => typeof value !== 'string'))) {
  throw new Error('config.json: pole "allowedOrigins" musi być tablicą adresów URL.');
}
const securityEnabled = projectConfig.security;
const originPolicy = createOriginPolicy(securityEnabled, (projectConfig.allowedOrigins ?? []) as string[]);
const STATIC_DIR = requireFrontendDist(PROJECT_ROOT);
const DEFAULT_MAPS_DIR = path.join(PROJECT_ROOT, 'maps');
const MAPS_DIR = path.resolve(process.env.HAND_SABERS_MAPS_DIR || process.env.MAPS_DIR || DEFAULT_MAPS_DIR);
const MAP_BEATDATA_DIR = path.join(MAPS_DIR, 'beatdata');
const MAP_AUDIO_DIR = path.join(MAPS_DIR, 'audio');
const LEGACY_MAP_AUDIO_DIR = path.join(MAPS_DIR, '_audio');
const MAP_UPLOAD_DIR = path.join(MAPS_DIR, '.uploads');
const MAX_MAP_JSON_BYTES = 25 * 1024 * 1024;
const MAX_SCORE_JSON_BYTES = 4 * 1024;
const MAX_UPLOAD_TEMP_BYTES = MAX_IMPORT_BYTES * 4;
const MIN_UPLOAD_BYTES_PER_SECOND = 32 * 1024;
const UPLOAD_RATE_GRACE_MS = 10_000;
const UPLOAD_RATE_WINDOW_MS = 5_000;

for (const dir of [MAPS_DIR, MAP_BEATDATA_DIR, MAP_AUDIO_DIR, LEGACY_MAP_AUDIO_DIR, MAP_UPLOAD_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function getUploadDirectoryBytes(): number {
  return readdirSync(MAP_UPLOAD_DIR, { withFileTypes: true }).reduce((total, entry) => {
    if (!entry.isFile()) return total;
    try {
      return total + Math.max(0, statSync(path.join(MAP_UPLOAD_DIR, entry.name)).size);
    } catch {
      return total;
    }
  }, 0);
}

const HIDDEN_TEST_MAP_IDS = new Set(['smoke-map', 'creator-smoke', 'zip-smoke', 'bad-map']);
const alternatePathCaseExists = (directory: string): boolean => {
  const resolved = path.resolve(directory);
  for (let index = resolved.length - 1; index >= 0; index--) {
    const character = resolved[index]!;
    if (!/[a-z]/i.test(character)) continue;
    const alternate = character === character.toLowerCase() ? character.toUpperCase() : character.toLowerCase();
    return existsSync(`${resolved.slice(0, index)}${alternate}${resolved.slice(index + 1)}`);
  }
  return false;
};
const caseInsensitiveMapIds = alternatePathCaseExists(MAPS_DIR);
const mapStorage = createMapStorage({
  mapsDir: MAPS_DIR,
  beatdataDir: MAP_BEATDATA_DIR,
  hiddenIds: HIDDEN_TEST_MAP_IDS,
  caseInsensitiveIds: caseInsensitiveMapIds,
});
const audioStorage = createAudioStorage({
  audioDir: MAP_AUDIO_DIR,
  legacyAudioDir: LEGACY_MAP_AUDIO_DIR,
  caseInsensitiveIds: caseInsensitiveMapIds,
});

const upload = multer({
  storage: multer.diskStorage({
    destination: MAP_UPLOAD_DIR,
    filename: (req, _file, callback) => {
      const fileName = randomUUID();
      uploadConcurrency.trackFile(req, path.join(MAP_UPLOAD_DIR, fileName));
      callback(null, fileName);
    },
  }),
  limits: { fileSize: MAX_IMPORT_BYTES },
  fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    const name = String(file.originalname || '').toLowerCase();
    const ok = name.endsWith('.json') || name.endsWith('.zip') || AUDIO_EXT_RE.test(name) || String(file.mimetype || '').startsWith('audio/');
    if (ok) cb(null, true);
    else cb(new Error('Nieobsługiwany typ pliku. Dozwolone: .json, .zip i audio.'));
  },
});
const uploadConcurrency = createUploadConcurrencyGate({
  byteRateGraceMs: UPLOAD_RATE_GRACE_MS,
  byteRateWindowMs: UPLOAD_RATE_WINDOW_MS,
  initialUsedBytes: getUploadDirectoryBytes(),
  maxTempBytes: MAX_UPLOAD_TEMP_BYTES,
  minBytesPerSecond: MIN_UPLOAD_BYTES_PER_SECOND,
  reservationBytes: MAX_IMPORT_BYTES,
});

const app = express();
if (process.env.HAND_SABERS_TRUST_PROXY === '1') app.set('trust proxy', 1);

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com ws: wss:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://mrdoob.github.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "worker-src 'self' blob:",
].join('; ');

if (securityEnabled) {
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('Permissions-Policy', 'camera=(self), fullscreen=(self), geolocation=(), microphone=(self), payment=(), usb=()');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}

const limiter = new RateLimiter();
const mapAssetLocks = new KeyedMutex(id => caseInsensitiveMapIds ? id.toLowerCase() : id);
const mapCatalogLock = new FileMutex();
const rooms = new RoomRegistry();
const trackingSessions = new TrackingSessionRegistry();
const rateLimit = (ip: string, key: string, maxPerMinute: number): boolean =>
  limiter.check(ip, key, maxPerMinute);

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (originPolicy.isAllowed(req.get('origin'))) return next();
  return res.status(403).json({ error: 'Niedozwolone źródło żądania.' });
});

const BLOCKED_STATIC_RE = /^\/(?:node_modules|maps|scripts|server|src|tests|dist-server|\.claude|\.git)(?:\/|$)|^\/(?:server\.(?:js|ts)|package(?:-lock)?\.json|config\.json|TODO\.md|README(?:\.pl)?\.md|vite\.config\.js|tsconfig(?:\.server)?\.json|AGENTS\.md)$/i;
app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && BLOCKED_STATIC_RE.test(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
});
app.use(express.static(STATIC_DIR, { dotfiles: 'deny', index: false }));
app.get('/', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

app.get('/api', (_req, res) => {
  res.json({ ok: true, name: 'hand-sabers', health: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'hand-sabers', time: new Date().toISOString(), maxImportBytes: MAX_IMPORT_BYTES });
});

registerMapReadRoutes({ app, mapStorage, audioStorage, mapAssetLocks, mapCatalogLock });

registerMapWriteRoutes({
  app,
  mapStorage,
  audioStorage,
  mapAssetLocks,
  mapCatalogLock,
  uploadAudio: upload.single('audio'),
  uploadFile: upload.single('file'),
  uploadConcurrency: uploadConcurrency.middleware,
  releaseUploadConcurrency: uploadConcurrency.release,
  parseJson: express.json({ limit: MAX_MAP_JSON_BYTES }),
  rateLimit,
});

// ── Leaderboard ───────────────────────────────────────────────────────────────
const SCORES_FILE = path.join(MAPS_DIR, '_scores.json');
const scoreStorage = createScoreStorage(SCORES_FILE);
registerScoreRoutes({
  app,
  storage: scoreStorage,
  parseJson: express.json({ limit: MAX_SCORE_JSON_BYTES }),
  rateLimit,
});
registerRoomRoutes({ app, rooms, rateLimit });
registerTrackingSessionRoutes({ app, sessions: trackingSessions, rateLimit });

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  uploadConcurrency.release(req);
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    const limitMb = Math.round(MAX_IMPORT_BYTES / 1024 / 1024);
    return res.status(413).json({ error: `Plik jest za duży. Limit: ${limitMb} MB.` });
  }
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'Dane żądania są za duże.' });
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
const realtimeServer = registerRealtimeServer(server, rooms, originPolicy);
const remoteTrackingServer = registerRemoteTrackingServer(server, trackingSessions, originPolicy);
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  const protocol = secure ? 'https' : 'http';
  console.log(`Hand Sabers → ${protocol}://localhost:${PORT}`);
  console.log(`W sieci lokalnej → ${protocol}://<twoje-ip-lub-hostname>:${PORT}`);
  console.log(`Zabezpieczenia wdrożeniowe: ${securityEnabled ? 'włączone' : 'wyłączone'} (config.json → security).`);
  if (!secure) console.log('Kamera telefonu poza localhost wymaga HTTPS (HAND_SABERS_TLS_CERT + HAND_SABERS_TLS_KEY).');
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} — zamykam serwer…`);
  realtimeServer.close();
  remoteTrackingServer.close();
  limiter.destroy();
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
