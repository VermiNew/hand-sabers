export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Mutex do atomowego zapisu (zapobiega race condition na JSON files)
export class FileMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const tryAcquire = (): void => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    this.locked = false;
    const next = this.queue.shift();
    if (next) next();
  }
}

// Rate limiter in-memory z automatycznym sprzątaniem
export class RateLimiter {
  private readonly map = new Map<string, number[]>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupMs = 300_000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
    if (typeof this.cleanupInterval.unref === 'function') this.cleanupInterval.unref();
  }

  check(ip: string, key: string, maxPerMinute: number): boolean {
    const mapKey = `${key}:${ip}`;
    const now = Date.now();
    const calls = (this.map.get(mapKey) ?? []).filter(t => now - t < 60_000);
    calls.push(now);
    this.map.set(mapKey, calls);
    return calls.length > maxPerMinute;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, calls] of this.map) {
      const fresh = calls.filter(t => now - t < 60_000);
      if (fresh.length === 0) this.map.delete(k);
      else this.map.set(k, fresh);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

export function getIp(req: { ip?: string | undefined; socket?: { remoteAddress?: string | undefined } | undefined }): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export function parseJsonSafe(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    throw new Error('Nieprawidłowy JSON w żądaniu.');
  }
}
