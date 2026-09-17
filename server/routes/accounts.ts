import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import {
  ACCOUNT_SESSION_COOKIE,
  ACCOUNT_SESSION_MAX_AGE_SECONDS,
  AccountSessionRegistry,
  readCookie,
} from '../auth/session-registry.js';
import {
  AccountExistsError,
  AccountValidationError,
  type AccountStorage,
} from '../storage/accounts.js';
import { getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface AccountRoutesOptions {
  app: Express;
  storage: AccountStorage;
  sessions: AccountSessionRegistry;
  parseJson: RequestHandler;
  rateLimit: RateLimiter;
}

interface FailureState {
  failures: number[];
  lockedUntil: number;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_LOCK_MS = 30 * 60 * 1000;

class FailedAttemptGuard {
  private readonly entries = new Map<string, FailureState>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockMs: number;

  constructor(
    maxFailures: number,
    windowMs: number,
    lockMs: number,
  ) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.lockMs = lockMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    if (typeof this.cleanupInterval.unref === 'function') this.cleanupInterval.unref();
  }

  isLocked(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.lockedUntil > now) return true;
    entry.failures = entry.failures.filter(timestamp => now - timestamp < this.windowMs);
    if (entry.failures.length === 0) this.entries.delete(key);
    return false;
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = entry.failures.filter(timestamp => now - timestamp < this.windowMs);
    entry.failures.push(now);
    if (entry.failures.length >= this.maxFailures) entry.lockedUntil = now + this.lockMs;
    this.entries.set(key, entry);
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.entries.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && entry.failures.every(timestamp => now - timestamp >= this.windowMs)) {
        this.entries.delete(key);
      }
    }
  }
}

function accountKey(username: string): string {
  return username.normalize('NFKC').trim().toLowerCase().slice(0, 64);
}

function bodyString(req: Request, name: string, maxLength: number): string | null {
  const value = req.body?.[name];
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function sessionToken(req: Request): string | null {
  return readCookie(req.get('cookie'), ACCOUNT_SESSION_COOKIE);
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${ACCOUNT_SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${ACCOUNT_SESSION_MAX_AGE_SECONDS}${secure}`,
  );
}

function clearSessionCookie(req: Request, res: Response): void {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${ACCOUNT_SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function sendValidationError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof AccountExistsError) {
    res.status(409).json({ error: 'Ta nazwa użytkownika jest już zajęta.', code: 'ACCOUNT_EXISTS' });
    return;
  }
  if (error instanceof AccountValidationError) {
    const messages = {
      INVALID_USERNAME: 'Nazwa użytkownika musi mieć od 3 do 24 znaków: litery, cyfry, kropka, myślnik lub podkreślenie.',
      INVALID_PASSWORD: 'Hasło musi mieć od 10 do 128 znaków.',
      INVALID_RECOVERY_PIN: 'PIN odzyskiwania musi składać się dokładnie z 8 cyfr.',
    } satisfies Record<string, string>;
    res.status(400).json({ error: messages[error.code], code: error.code });
    return;
  }
  next(error);
}

export function registerAccountRoutes({
  app,
  storage,
  sessions,
  parseJson,
  rateLimit,
}: AccountRoutesOptions): () => void {
  const loginGuard = new FailedAttemptGuard(10, LOGIN_WINDOW_MS, LOGIN_LOCK_MS);
  const recoveryGuard = new FailedAttemptGuard(5, RECOVERY_WINDOW_MS, RECOVERY_LOCK_MS);
  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  app.get('/api/auth/session', noStore, (req, res) => {
    const account = sessions.resolve(sessionToken(req));
    res.json({ authenticated: account !== null, account });
  });

  app.post('/api/auth/register', noStore, parseJson, async (req, res, next) => {
    if (rateLimit(getIp(req), 'account-register', 5)) {
      return res.status(429).json({
        error: 'Za dużo prób rejestracji. Odczekaj minutę i spróbuj ponownie.',
        code: 'ACCOUNT_REGISTER_RATE_LIMITED',
      });
    }
    const username = bodyString(req, 'username', 64);
    const password = bodyString(req, 'password', 128);
    const recoveryPin = bodyString(req, 'recoveryPin', 8);
    if (username === null || password === null || recoveryPin === null) {
      return res.status(400).json({ error: 'Nieprawidłowe dane rejestracji.', code: 'INVALID_ACCOUNT_INPUT' });
    }
    try {
      const account = await storage.register(username, password, recoveryPin);
      setSessionCookie(req, res, sessions.create(account));
      return res.status(201).json({ ok: true, account });
    } catch (error) {
      sendValidationError(error, res, next);
    }
  });

  app.post('/api/auth/login', noStore, parseJson, async (req, res, next) => {
    if (rateLimit(getIp(req), 'account-login', 10)) {
      return res.status(429).json({
        error: 'Za dużo prób logowania. Odczekaj minutę i spróbuj ponownie.',
        code: 'ACCOUNT_LOGIN_RATE_LIMITED',
      });
    }
    const username = bodyString(req, 'username', 64);
    const password = bodyString(req, 'password', 128);
    if (username === null || password === null) {
      return res.status(400).json({ error: 'Nieprawidłowe dane logowania.', code: 'INVALID_ACCOUNT_INPUT' });
    }
    const key = accountKey(username);
    try {
      const account = await storage.authenticate(username, password);
      if (loginGuard.isLocked(key) || !account) {
        loginGuard.recordFailure(key);
        return res.status(401).json({
          error: 'Nazwa użytkownika lub hasło są nieprawidłowe. Po wielu błędach logowanie jest czasowo blokowane.',
          code: 'ACCOUNT_LOGIN_DENIED',
        });
      }
      loginGuard.clear(key);
      setSessionCookie(req, res, sessions.create(account));
      return res.json({ ok: true, account });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', noStore, (req, res) => {
    sessions.revoke(sessionToken(req));
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  app.post('/api/auth/recover', noStore, parseJson, async (req, res, next) => {
    if (rateLimit(getIp(req), 'account-recovery', 5)) {
      return res.status(429).json({
        error: 'Za dużo prób odzyskiwania. Odczekaj minutę i spróbuj ponownie.',
        code: 'ACCOUNT_RECOVERY_RATE_LIMITED',
      });
    }
    const username = bodyString(req, 'username', 64);
    const recoveryPin = bodyString(req, 'recoveryPin', 8);
    const newPassword = bodyString(req, 'newPassword', 128);
    if (username === null || recoveryPin === null || newPassword === null) {
      return res.status(400).json({ error: 'Nieprawidłowe dane odzyskiwania.', code: 'INVALID_ACCOUNT_INPUT' });
    }
    const key = accountKey(username);
    if (recoveryGuard.isLocked(key)) {
      return res.status(401).json({
        error: 'Nazwa użytkownika lub PIN są nieprawidłowe. Po wielu błędach odzyskiwanie jest czasowo blokowane.',
        code: 'ACCOUNT_RECOVERY_DENIED',
      });
    }
    try {
      const account = await storage.recover(username, recoveryPin, newPassword);
      if (!account) {
        recoveryGuard.recordFailure(key);
        return res.status(401).json({
          error: 'Nazwa użytkownika lub PIN są nieprawidłowe. Po wielu błędach odzyskiwanie jest czasowo blokowane.',
          code: 'ACCOUNT_RECOVERY_DENIED',
        });
      }
      recoveryGuard.clear(key);
      loginGuard.clear(key);
      sessions.revokeAccount(account.id);
      setSessionCookie(req, res, sessions.create(account));
      return res.json({ ok: true, account });
    } catch (error) {
      sendValidationError(error, res, next);
    }
  });

  app.delete('/api/auth/account', noStore, parseJson, async (req, res, next) => {
    if (rateLimit(getIp(req), 'account-delete', 5)) {
      return res.status(429).json({
        error: 'Za dużo prób usunięcia konta. Odczekaj minutę i spróbuj ponownie.',
        code: 'ACCOUNT_DELETE_RATE_LIMITED',
      });
    }
    const token = sessionToken(req);
    const account = sessions.resolve(token);
    if (!account) return res.status(401).json({ error: 'Zaloguj się ponownie.', code: 'ACCOUNT_SESSION_REQUIRED' });
    const password = bodyString(req, 'password', 128);
    if (password === null) {
      return res.status(400).json({ error: 'Podaj aktualne hasło.', code: 'INVALID_ACCOUNT_INPUT' });
    }
    try {
      if (!await storage.delete(account.id, password)) {
        return res.status(401).json({ error: 'Aktualne hasło jest nieprawidłowe.', code: 'ACCOUNT_DELETE_DENIED' });
      }
      sessions.revokeAccount(account.id);
      clearSessionCookie(req, res);
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return () => {
    loginGuard.destroy();
    recoveryGuard.destroy();
  };
}
