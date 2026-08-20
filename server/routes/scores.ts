import type { Express } from 'express';
import { isPlainObject, sanitizeMapId } from '../../src/core/map-format.js';
import type { ScoreStorage } from '../storage/scores.js';
import { errorMessage, getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

const MAX_PLAYER_NAME_LENGTH = 40;
const MAX_MAP_ID_LENGTH = 64;
const MAX_SCORE = 1_000_000_000;
const MAX_COMBO = 1_000_000;

interface ScoreRoutesOptions {
  app: Express;
  storage: ScoreStorage;
  rateLimit: RateLimiter;
}

export function registerScoreRoutes({ app, storage, rateLimit }: ScoreRoutesOptions): void {
  app.get('/api/scores', async (req, res) => {
    try {
      let scores = await storage.read();
      if (req.query['map']) {
        const mapId = String(req.query['map']);
        scores = scores.filter(s => s.mapId === mapId);
      }
      const requestedLimit = parseInt(String(req.query['limit'] ?? '20'), 10);
      const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 20));
      scores.sort((a, b) => b.score - a.score);
      res.json(scores.slice(0, limit));
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/scores', async (req, res) => {
    try {
      const ip = getIp(req);
      if (rateLimit(ip, 'scores', 20)) {
        return res.status(429).json({ error: 'Za dużo żądań. Spróbuj ponownie za chwilę.' });
      }

      if (!isPlainObject(req.body)) {
        return res.status(400).json({ error: 'Nieprawidłowe dane wyniku.' });
      }

      const { mapId, player, score, combo, progress } = req.body;
      if (typeof mapId !== 'string' || mapId.length > MAX_MAP_ID_LENGTH) {
        return res.status(400).json({ error: 'Nieprawidłowy identyfikator mapy.' });
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

      if (progress !== undefined && (
        typeof progress !== 'number'
        || !Number.isFinite(progress)
        || progress < 0
        || progress > 1
      )) {
        return res.status(400).json({ error: 'Nieprawidłowy postęp.' });
      }

      await storage.append({
        mapId: sanitizeMapId(mapId, 'random'),
        player: player.trim() || 'Gracz',
        score,
        combo,
        date: new Date().toISOString(),
        ...(progress !== undefined ? { progress } : {}),
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
