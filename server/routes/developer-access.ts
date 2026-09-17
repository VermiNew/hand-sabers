import { createHash, timingSafeEqual } from 'crypto';
import type { Express, RequestHandler } from 'express';
import { getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface DeveloperAccessRoutesOptions {
  app: Express;
  token: string | null;
  parseJson: RequestHandler;
  rateLimit: RateLimiter;
}

const MIN_TOKEN_LENGTH = 12;
const MAX_TOKEN_LENGTH = 256;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function normalizeDeveloperAccessToken(value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  if (value.length < MIN_TOKEN_LENGTH || value.length > MAX_TOKEN_LENGTH) {
    throw new Error(`HAND_SABERS_DEVELOPER_TOKEN musi mieć od ${MIN_TOKEN_LENGTH} do ${MAX_TOKEN_LENGTH} znaków.`);
  }
  return value;
}

export function registerDeveloperAccessRoutes({
  app,
  token,
  parseJson,
  rateLimit,
}: DeveloperAccessRoutesOptions): void {
  const expectedDigest = token === null ? null : digest(token);

  app.get('/api/developer/access', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ configured: expectedDigest !== null });
  });

  app.post('/api/developer/access', parseJson, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (rateLimit(getIp(req), 'developer-access', 10)) {
      return res.status(429).json({
        error: 'Za dużo prób odblokowania. Odczekaj minutę i spróbuj ponownie.',
        code: 'DEVELOPER_ACCESS_RATE_LIMITED',
      });
    }
    if (expectedDigest === null) {
      return res.status(503).json({
        error: 'Tryb developerski nie został skonfigurowany na serwerze.',
        code: 'DEVELOPER_ACCESS_NOT_CONFIGURED',
      });
    }
    const candidate = typeof req.body?.token === 'string' ? req.body.token : '';
    const candidateDigest = digest(candidate.slice(0, MAX_TOKEN_LENGTH + 1));
    const valid = candidate.length <= MAX_TOKEN_LENGTH && timingSafeEqual(candidateDigest, expectedDigest);
    if (!valid) {
      return res.json({
        ok: false,
        error: 'Token developera jest nieprawidłowy.',
        code: 'DEVELOPER_ACCESS_DENIED',
      });
    }
    res.json({ ok: true });
  });
}
