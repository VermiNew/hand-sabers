import { createHash, randomBytes } from 'crypto';
import type { PublicAccount } from '../storage/accounts.js';

export const ACCOUNT_SESSION_COOKIE = 'hand_sabers_session';
export const ACCOUNT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface SessionRecord {
  account: PublicAccount;
  expiresAt: number;
}

function digestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

export class AccountSessionRegistry {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;
  private readonly lifetimeMs: number;

  constructor(
    lifetimeMs = ACCOUNT_SESSION_MAX_AGE_SECONDS * 1000,
    cleanupMs = 15 * 60 * 1000,
  ) {
    this.lifetimeMs = lifetimeMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
    if (typeof this.cleanupInterval.unref === 'function') this.cleanupInterval.unref();
  }

  create(account: PublicAccount): string {
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(digestToken(token), {
      account: { ...account },
      expiresAt: Date.now() + this.lifetimeMs,
    });
    return token;
  }

  resolve(token: string | null): PublicAccount | null {
    if (!token) return null;
    const key = digestToken(token);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return null;
    }
    return { ...session.account };
  }

  revoke(token: string | null): void {
    if (token) this.sessions.delete(digestToken(token));
  }

  revokeAccount(accountId: string): void {
    for (const [key, session] of this.sessions) {
      if (session.account.id === accountId) this.sessions.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(key);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}
