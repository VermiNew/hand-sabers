import { SETTINGS_CHANGED_EVENT, type SettingsChangedDetail } from './settings.ts';
import type { Settings } from '../types/index.js';

export type ProductTelemetryCategory = 'connection' | 'error' | 'performance' | 'network';
export type ProductTelemetryValues = Record<string, number | boolean | string>;

const SESSION_KEY = 'hs_telemetry_session';
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERFORMANCE_SAMPLE_MS = 10_000;
const NETWORK_SAMPLE_MS = 15_000;

let enabled = false;
let initialized = false;
let sessionId = '';
let pageName = 'unknown';
let animationFrame = 0;
let networkTimer = 0;
let frameWindowStartedAt = 0;
let frameCount = 0;
let slowFrameCount = 0;
let lastFrameAt = 0;

function telemetrySessionId(): string {
  if (sessionId) return sessionId;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored && SESSION_ID_RE.test(stored)) return (sessionId = stored);
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

export function reportProductTelemetry(
  category: ProductTelemetryCategory,
  name: string,
  values: ProductTelemetryValues = {},
): void {
  if (!enabled) return;
  const event = {
    v: 1,
    sessionId: telemetrySessionId(),
    category,
    name,
    clientTime: Date.now(),
    values: { page: pageName, ...values },
  };
  void fetch('/api/telemetry/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {
    // Telemetry must never interrupt the game or produce recursive error reports.
  });
}

function sampleFrames(now: number): void {
  if (!enabled) return;
  if (!frameWindowStartedAt) {
    frameWindowStartedAt = now;
    lastFrameAt = now;
  } else {
    const frameMs = now - lastFrameAt;
    lastFrameAt = now;
    frameCount++;
    if (frameMs > 25) slowFrameCount++;
    const elapsed = now - frameWindowStartedAt;
    if (elapsed >= PERFORMANCE_SAMPLE_MS) {
      reportProductTelemetry('performance', 'frame.sample', {
        fps: frameCount * 1_000 / elapsed,
        frameMs: elapsed / Math.max(1, frameCount),
        slowFrames: slowFrameCount,
        visible: document.visibilityState === 'visible',
      });
      frameWindowStartedAt = now;
      frameCount = 0;
      slowFrameCount = 0;
    }
  }
  animationFrame = requestAnimationFrame(sampleFrames);
}

async function sampleNetwork(): Promise<void> {
  if (!enabled || document.visibilityState !== 'visible') return;
  const startedAt = performance.now();
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    reportProductTelemetry('network', 'health.sample', {
      ok: response.ok,
      status: response.status,
      rttMs: performance.now() - startedAt,
    });
  } catch {
    reportProductTelemetry('network', 'health.sample', {
      ok: false,
      status: 0,
      rttMs: performance.now() - startedAt,
    });
  }
}

function stopSampling(): void {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (networkTimer) window.clearInterval(networkTimer);
  animationFrame = 0;
  networkTimer = 0;
  frameWindowStartedAt = 0;
  frameCount = 0;
  slowFrameCount = 0;
}

function startSampling(): void {
  stopSampling();
  enabled = true;
  reportProductTelemetry('connection', 'client.started', { online: navigator.onLine });
  animationFrame = requestAnimationFrame(sampleFrames);
  void sampleNetwork();
  networkTimer = window.setInterval(() => void sampleNetwork(), NETWORK_SAMPLE_MS);
}

function applyEnabled(nextEnabled: boolean): void {
  if (nextEnabled === enabled && (nextEnabled ? animationFrame !== 0 : true)) return;
  if (nextEnabled) startSampling();
  else {
    enabled = false;
    stopSampling();
  }
}

export function initProductTelemetry(settings: Settings, page: string): void {
  pageName = page;
  if (!initialized) {
    initialized = true;
    window.addEventListener('online', () => reportProductTelemetry('connection', 'browser.online'));
    window.addEventListener('offline', () => reportProductTelemetry('connection', 'browser.offline'));
    window.addEventListener(SETTINGS_CHANGED_EVENT, event => {
      const detail = (event as CustomEvent<SettingsChangedDetail>).detail;
      if (detail?.changedKeys.includes('telemetryEnabled')) applyEnabled(detail.settings.telemetryEnabled);
    });
  }
  applyEnabled(settings.telemetryEnabled);
}
