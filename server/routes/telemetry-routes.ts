import type { Express, RequestHandler } from 'express';
import { PRODUCT_TELEMETRY_RETENTION_MS, ProductTelemetryStore } from '../telemetry/product-telemetry.js';
import type { ProductTelemetryCategory, ProductTelemetryEvent } from '../telemetry/product-telemetry.js';
import { getIp } from '../utils.js';

type RateLimiter = (ip: string, key: string, maxPerMinute: number) => boolean;

interface TelemetryRoutesOptions {
  app: Express;
  store: ProductTelemetryStore;
  parseJson: RequestHandler;
  rateLimit: RateLimiter;
}

const CATEGORIES = new Set<ProductTelemetryCategory>(['connection', 'error', 'performance', 'network']);
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_NAME_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const VALUE_NAME_RE = /^[a-z][A-Za-z0-9._-]{0,39}$/;
const MAX_VALUES = 12;
const MAX_TEXT_VALUE_LENGTH = 160;

function parseEvent(value: unknown): ProductTelemetryEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const category = input['category'];
  const values = input['values'];
  if (
    input['v'] !== 1
    || typeof input['sessionId'] !== 'string' || !SESSION_ID_RE.test(input['sessionId'])
    || typeof category !== 'string' || !CATEGORIES.has(category as ProductTelemetryCategory)
    || typeof input['name'] !== 'string' || !EVENT_NAME_RE.test(input['name'])
    || typeof input['clientTime'] !== 'number' || !Number.isFinite(input['clientTime'])
    || !values || typeof values !== 'object' || Array.isArray(values)
  ) return null;

  const entries = Object.entries(values as Record<string, unknown>);
  if (entries.length > MAX_VALUES) return null;
  const normalizedValues: Record<string, number | boolean | string> = {};
  for (const [name, item] of entries) {
    if (!VALUE_NAME_RE.test(name)) return null;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return null;
      normalizedValues[name] = item;
    } else if (typeof item === 'boolean') {
      normalizedValues[name] = item;
    } else if (typeof item === 'string' && item.length <= MAX_TEXT_VALUE_LENGTH) {
      normalizedValues[name] = item;
    } else {
      return null;
    }
  }

  return {
    v: 1,
    sessionId: input['sessionId'],
    category: category as ProductTelemetryCategory,
    name: input['name'],
    clientTime: input['clientTime'],
    values: normalizedValues,
  };
}

export function registerTelemetryRoutes({ app, store, parseJson, rateLimit }: TelemetryRoutesOptions): void {
  app.get('/api/telemetry/policy', (_req, res) => {
    res.json({
      v: 1,
      enabled: true,
      storage: 'server-memory',
      retentionHours: PRODUCT_TELEMETRY_RETENTION_MS / 3_600_000,
      collected: ['stan połączenia', 'błędy', 'wydajność', 'jakość sieci'],
      notCollected: ['adres IP w zapisach', 'User-Agent', 'obraz kamery', 'dźwięk', 'treść czatu', 'nazwa mapy'],
    });
  });

  app.post('/api/telemetry/events', parseJson, (req, res) => {
    if (rateLimit(getIp(req), 'product-telemetry', 120)) {
      return res.status(429).json({ error: 'Za dużo zdarzeń telemetrii. Spróbuj ponownie za chwilę.' });
    }
    const event = parseEvent(req.body);
    if (!event) {
      return res.status(400).json({
        error: 'Nieprawidłowe zdarzenie telemetrii.',
        code: 'INVALID_TELEMETRY_EVENT',
      });
    }
    const snapshot = store.record(event);
    res.status(202).json({ ok: true, accepted: snapshot.eventCount, expiresAt: snapshot.expiresAt });
  });
}
