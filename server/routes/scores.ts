import type { Express } from 'express';
import { sanitizeMapId } from '../../src/core/map-format.js';
import type { ScoreStorage } from '../storage/scores.js';
import { errorMessage, getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

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
      const limit = Math.min(100, parseInt(String(req.query['limit'] ?? '20')) || 20);
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

      const { mapId, player, score, combo, date, progress } = req.body as Record<string, unknown>;
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore) || numericScore < 0) {
        return res.status(400).json({ error: 'Nieprawidłowy wynik.' });
      }

      const numericProgress = progress !== undefined ? Number(progress) : undefined;
      const validProgress = numericProgress !== undefined && Number.isFinite(numericProgress)
        ? Math.max(0, Math.min(1, numericProgress))
        : undefined;

      await storage.append({
        mapId: sanitizeMapId(mapId ?? 'random', 'random'),
        player: String(player ?? 'Gracz').slice(0, 40),
        score: Math.floor(numericScore),
        combo: Math.floor(Number(combo) || 0),
        date: String(date ?? new Date().toISOString()),
        ...(validProgress !== undefined ? { progress: validProgress } : {}),
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
