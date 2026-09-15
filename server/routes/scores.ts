import type { Express, RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import { isPlainObject, sanitizeMapId } from '../../src/core/map-format.js';
import { compareScores, CURRENT_SCORING_VERSION } from '../../src/core/score-version.js';
import type { MapStorage } from '../storage/maps.js';
import type { ScoreStorage } from '../storage/scores.js';
import { errorMessage, getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

const MAX_PLAYER_NAME_LENGTH = 40;
const MAX_MAP_ID_LENGTH = 64;
const MAX_SCORE = 1_000_000_000;
const MAX_COMBO = 1_000_000;
const SCORE_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SCORE_SESSIONS = 4_096;

interface ScoreSession {
  mapId: string;
  scoringVersion: number;
  maxScore: number;
  maxCombo: number;
  expiresAt: number;
}

interface ScoreRoutesOptions {
  app: Express;
  maps: MapStorage;
  storage: ScoreStorage;
  parseJson: RequestHandler;
  rateLimit: RateLimiter;
}

export function registerScoreRoutes({ app, maps, storage, parseJson, rateLimit }: ScoreRoutesOptions): void {
  const sessions = new Map<string, ScoreSession>();

  const pruneSessions = (now = Date.now()): void => {
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
  };

  app.get('/api/scores', async (req, res) => {
    try {
      let scores = await storage.read();
      if (req.query['map']) {
        const mapId = String(req.query['map']);
        scores = scores.filter(s => s.mapId === mapId);
      }
      if (req.query['scoring'] === 'current') {
        scores = scores.filter(score => score.scoringVersion === CURRENT_SCORING_VERSION);
      } else if (req.query['scoring'] === 'legacy') {
        scores = scores.filter(score => score.scoringVersion !== CURRENT_SCORING_VERSION);
      }
      const requestedLimit = parseInt(String(req.query['limit'] ?? '20'), 10);
      const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 20));
      scores.sort(compareScores);
      res.json(scores.slice(0, limit));
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  const limitScoreSubmission: RequestHandler = (req, res, next) => {
    const ip = getIp(req);
    if (rateLimit(ip, 'scores', 20)) {
      res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
      return;
    }
    next();
  };

  app.post('/api/score-sessions', limitScoreSubmission, parseJson, async (req, res) => {
    try {
      if (!isPlainObject(req.body) || typeof req.body['mapId'] !== 'string') {
        return res.status(400).json({ error: 'Nieprawidłowy identyfikator mapy.' });
      }
      const mapId = sanitizeMapId(req.body['mapId'], '');
      if (!mapId || mapId !== req.body['mapId'] || mapId.length > MAX_MAP_ID_LENGTH) {
        return res.status(400).json({ error: 'Nieprawidłowy identyfikator mapy.' });
      }
      const map = await maps.read(mapId);
      if (!map) return res.status(404).json({ error: 'Nie znaleziono mapy.' });
      const playableBeats = map.beats.filter(beat => beat.type !== 'bomb').length;
      if (playableBeats < 1) return res.status(400).json({ error: 'Mapa nie zawiera grywalnych nut.' });

      const now = Date.now();
      pruneSessions(now);
      if (sessions.size >= MAX_SCORE_SESSIONS) {
        return res.status(503).json({ error: 'Serwer wyników jest chwilowo zajęty.' });
      }
      const token = randomBytes(24).toString('base64url');
      const session: ScoreSession = {
        mapId,
        scoringVersion: CURRENT_SCORING_VERSION,
        maxCombo: playableBeats,
        // Every current hit path is at or below 600 points after the capped x4 multiplier.
        maxScore: Math.min(MAX_SCORE, 600 * playableBeats),
        expiresAt: now + SCORE_SESSION_TTL_MS,
      };
      sessions.set(token, session);
      res.status(201).json({
        token,
        mapId: session.mapId,
        scoringVersion: session.scoringVersion,
        maxScore: session.maxScore,
        maxCombo: session.maxCombo,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/scores', limitScoreSubmission, parseJson, async (req, res) => {
    try {
      if (!isPlainObject(req.body)) {
        return res.status(400).json({ error: 'Nieprawidłowe dane wyniku.' });
      }

      const { mapId, player, score, combo, progress, scoringVersion, sessionToken } = req.body;
      if (typeof sessionToken !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(sessionToken)) {
        return res.status(401).json({ error: 'Brak prawidłowej sesji wyniku.' });
      }
      const session = sessions.get(sessionToken);
      if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(sessionToken);
        return res.status(401).json({ error: 'Sesja wyniku wygasła lub została już użyta.' });
      }
      if (scoringVersion !== session.scoringVersion) {
        return res.status(400).json({ error: 'Wynik pochodzi z innej wersji zasad punktacji.' });
      }
      if (typeof mapId !== 'string' || mapId.length > MAX_MAP_ID_LENGTH) {
        return res.status(400).json({ error: 'Nieprawidłowy identyfikator mapy.' });
      }
      const normalizedMapId = sanitizeMapId(mapId, 'random');
      if (normalizedMapId !== session.mapId) {
        return res.status(400).json({ error: 'Wynik nie pasuje do mapy przypisanej do sesji.' });
      }
      if (typeof player !== 'string' || player.length > MAX_PLAYER_NAME_LENGTH) {
        return res.status(400).json({ error: 'Nieprawidłowa nazwa gracza.' });
      }
      if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) {
        return res.status(400).json({ error: 'Nieprawidłowy wynik.' });
      }
      if (typeof combo !== 'number' || !Number.isSafeInteger(combo) || combo < 0 || combo > MAX_COMBO) {
        return res.status(400).json({ error: 'Nieprawidłowe combo.' });
      }
      if (score > session.maxScore || combo > session.maxCombo) {
        return res.status(400).json({ error: 'Wynik przekracza możliwy zakres tej mapy.' });
      }

      if (progress !== undefined && (
        typeof progress !== 'number'
        || !Number.isFinite(progress)
        || progress < 0
        || progress > 1
      )) {
        return res.status(400).json({ error: 'Nieprawidłowy postęp.' });
      }

      sessions.delete(sessionToken);
      await storage.append({
        mapId: normalizedMapId,
        player: player.trim() || 'Gracz',
        score,
        combo,
        scoringVersion: session.scoringVersion,
        date: new Date().toISOString(),
        ...(progress !== undefined ? { progress } : {}),
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
