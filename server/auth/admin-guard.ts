import { createHash, timingSafeEqual } from 'crypto';
import type { Express, Request, RequestHandler } from 'express';
import { getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

const MIN_TOKEN_LENGTH = 12;
const MAX_TOKEN_LENGTH = 256;
const MAX_FAILED_ATTEMPTS_PER_MINUTE = 20;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function normalizeAdminToken(value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  if (value.length < MIN_TOKEN_LENGTH || value.length > MAX_TOKEN_LENGTH) {
    throw new Error(`Token administratora musi mieć od ${MIN_TOKEN_LENGTH} do ${MAX_TOKEN_LENGTH} znaków.`);
  }
  return value;
}

function bearerToken(req: Request): string {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

export interface AdminGuard {
  /** True when a token is configured and write routes are protected. */
  readonly enabled: boolean;
  /** Rejects the request with 401 unless it carries the admin token. No-op when disabled. */
  readonly require: RequestHandler;
}

export function createAdminGuard(token: string | null, rateLimit: RateLimiter): AdminGuard {
  const expected = token === null ? null : digest(token);

  const require: RequestHandler = (req, res, next) => {
    if (expected === null) return next();
    const candidate = bearerToken(req);
    // Compare fixed-length digests so neither length nor content leaks via timing.
    if (candidate.length <= MAX_TOKEN_LENGTH && timingSafeEqual(digest(candidate), expected)) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (rateLimit(getIp(req), 'admin-auth-failed', MAX_FAILED_ATTEMPTS_PER_MINUTE)) {
      return res.status(429).json({
        error: 'Za dużo nieudanych prób. Odczekaj minutę i spróbuj ponownie.',
        code: 'ADMIN_TOKEN_RATE_LIMITED',
      });
    }
    return res.status(401).json({
      error: 'Ta operacja wymaga tokenu administratora.',
      code: 'ADMIN_TOKEN_REQUIRED',
    });
  };

  return { enabled: expected !== null, require };
}

export function registerAdminRoutes(app: Express, guard: AdminGuard): void {
  app.get('/api/admin/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ required: guard.enabled });
  });
  // Lets the UI validate a token before it is used for a real write.
  app.get('/api/admin/check', guard.require, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  });
}
