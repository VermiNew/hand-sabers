import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const PAIRING_CODE_LENGTH = 6;
const SESSION_TTL_MS = 5 * 60 * 1000;

interface TrackingSessionRecord {
  id: string;
  code: string;
  hostToken: string;
  phoneToken: string;
  createdAt: number;
  expiresAt: number;
  phoneCredentialIssued: boolean;
  hostConnected: boolean;
  phoneConnected: boolean;
}

export interface CreatedTrackingSession {
  id: string;
  code: string;
  hostToken: string;
  phoneToken: string;
  createdAt: number;
  expiresAt: number;
}

export interface TrackingSessionStatus {
  id: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  phoneCredentialIssued: boolean;
  hostConnected: boolean;
  phoneConnected: boolean;
}

function createToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

function createPairingCode(): string {
  let code = '';
  for (let index = 0; index < PAIRING_CODE_LENGTH; index++) {
    code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return code;
}

function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`).test(normalized) ? normalized : '';
}

export class TrackingSessionRegistry {
  private readonly sessions = new Map<string, TrackingSessionRecord>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      try {
        this.deleteExpired();
      } catch (error) {
        console.error('Tracking session cleanup failed:', error);
      }
    }, 30_000);
    this.cleanupTimer.unref();
  }

  create(): CreatedTrackingSession {
    this.deleteExpired();
    let code = createPairingCode();
    while ([...this.sessions.values()].some(session => session.code === code)) code = createPairingCode();
    let id = createToken(12);
    while (this.sessions.has(id)) id = createToken(12);
    const createdAt = Date.now();
    const session: TrackingSessionRecord = {
      id,
      code,
      hostToken: createToken(),
      phoneToken: createToken(),
      createdAt,
      expiresAt: createdAt + SESSION_TTL_MS,
      phoneCredentialIssued: false,
      hostConnected: false,
      phoneConnected: false,
    };
    this.sessions.set(id, session);
    return {
      id,
      code,
      hostToken: session.hostToken,
      phoneToken: session.phoneToken,
      createdAt,
      expiresAt: session.expiresAt,
    };
  }

  claimPhoneCredential(code: string): { id: string; phoneToken: string; expiresAt: number } | null {
    this.deleteExpired();
    const normalized = normalizeCode(code);
    const session = [...this.sessions.values()].find(candidate => candidate.code === normalized);
    if (!session || session.phoneCredentialIssued || session.phoneConnected) return null;
    session.phoneCredentialIssued = true;
    return { id: session.id, phoneToken: session.phoneToken, expiresAt: session.expiresAt };
  }

  getStatus(id: string, hostToken: string): TrackingSessionStatus | null {
    this.deleteExpired();
    const session = this.sessions.get(id);
    if (!session || !tokensMatch(hostToken, session.hostToken)) return null;
    return this.status(session);
  }

  authenticateHost(id: string, hostToken: string): TrackingSessionStatus | null {
    const session = this.requireAuthorized(id, hostToken, 'host');
    if (!session || session.hostConnected) return null;
    session.hostConnected = true;
    return this.status(session);
  }

  authenticatePhone(id: string, phoneToken: string): TrackingSessionStatus | null {
    const session = this.requireAuthorized(id, phoneToken, 'phone');
    if (!session || session.phoneConnected) return null;
    session.phoneCredentialIssued = true;
    session.phoneConnected = true;
    return this.status(session);
  }

  setDisconnected(id: string, role: 'host' | 'phone'): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (role === 'host') session.hostConnected = false;
    else session.phoneConnected = false;
  }

  revoke(id: string, hostToken: string): boolean {
    const session = this.sessions.get(id);
    if (!session || !tokensMatch(hostToken, session.hostToken)) return false;
    return this.sessions.delete(id);
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }

  private requireAuthorized(
    id: string,
    token: string,
    role: 'host' | 'phone',
  ): TrackingSessionRecord | null {
    this.deleteExpired();
    const session = this.sessions.get(id);
    if (!session) return null;
    const expectedToken = role === 'host' ? session.hostToken : session.phoneToken;
    return tokensMatch(token, expectedToken) ? session : null;
  }

  private deleteExpired(now = Date.now()): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }

  private status(session: TrackingSessionRecord): TrackingSessionStatus {
    return {
      id: session.id,
      code: session.code,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      phoneCredentialIssued: session.phoneCredentialIssued,
      hostConnected: session.hostConnected,
      phoneConnected: session.phoneConnected,
    };
  }
}
