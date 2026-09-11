export const PRODUCT_TELEMETRY_RETENTION_MS = 24 * 60 * 60 * 1_000;

export type ProductTelemetryCategory = 'connection' | 'error' | 'performance' | 'network';

export interface ProductTelemetryEvent {
  v: 1;
  sessionId: string;
  category: ProductTelemetryCategory;
  name: string;
  clientTime: number;
  values: Record<string, number | boolean | string>;
}

interface StoredSession {
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  eventCount: number;
  categories: Record<ProductTelemetryCategory, number>;
  recentEvents: Array<Omit<ProductTelemetryEvent, 'sessionId' | 'v'>>;
}

export interface ProductTelemetrySnapshot extends StoredSession {
  sessionId: string;
}

const MAX_SESSIONS = 1_024;
const MAX_RECENT_EVENTS = 64;

function emptyCategories(): Record<ProductTelemetryCategory, number> {
  return { connection: 0, error: 0, performance: 0, network: 0 };
}

export class ProductTelemetryStore {
  private readonly sessions = new Map<string, StoredSession>();

  record(event: ProductTelemetryEvent, now = Date.now()): ProductTelemetrySnapshot {
    this.prune(now);
    let session = this.sessions.get(event.sessionId);
    if (!session) {
      if (this.sessions.size >= MAX_SESSIONS) {
        const oldestId = this.sessions.keys().next().value as string | undefined;
        if (oldestId) this.sessions.delete(oldestId);
      }
      session = {
        createdAt: now,
        updatedAt: now,
        expiresAt: now + PRODUCT_TELEMETRY_RETENTION_MS,
        eventCount: 0,
        categories: emptyCategories(),
        recentEvents: [],
      };
      this.sessions.set(event.sessionId, session);
    }

    session.updatedAt = now;
    session.expiresAt = now + PRODUCT_TELEMETRY_RETENTION_MS;
    session.eventCount++;
    session.categories[event.category]++;
    session.recentEvents.push({
      category: event.category,
      name: event.name,
      clientTime: event.clientTime,
      values: { ...event.values },
    });
    if (session.recentEvents.length > MAX_RECENT_EVENTS) session.recentEvents.shift();
    return this.snapshot(event.sessionId, session);
  }

  get(sessionId: string, now = Date.now()): ProductTelemetrySnapshot | null {
    this.prune(now);
    const session = this.sessions.get(sessionId);
    return session ? this.snapshot(sessionId, session) : null;
  }

  clear(): void {
    this.sessions.clear();
  }

  private prune(now: number): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(sessionId);
    }
  }

  private snapshot(sessionId: string, session: StoredSession): ProductTelemetrySnapshot {
    return {
      sessionId,
      ...session,
      categories: { ...session.categories },
      recentEvents: session.recentEvents.map(event => ({ ...event, values: { ...event.values } })),
    };
  }
}
