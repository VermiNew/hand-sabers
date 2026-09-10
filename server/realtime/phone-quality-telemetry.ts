export interface PhoneQualityTelemetrySnapshot {
  updatedAt: number;
  preloadMs: number | null;
  cacheHitRate: number | null;
  rttMs: number | null;
  jitterMs: number | null;
  clockOffsetMs: number | null;
  driftMs: number | null;
  schedulerLatenessMs: number | null;
  packetRateHz: number | null;
  captureAgeMs: number | null;
  detectionMs: number | null;
  encodeMs: number | null;
  bufferedBytes: number;
  sentPackets: number;
  droppedPackets: number;
  percentiles: Record<QualityMetric, QualityPercentiles | null>;
}

export interface QualityPercentiles {
  samples: number;
  p50: number;
  p95: number;
}

export type QualityMetric =
  | 'audioRttMs'
  | 'audioDriftAbsMs'
  | 'audioSchedulerLatenessAbsMs'
  | 'trackingCaptureAgeMs'
  | 'trackingDetectionMs'
  | 'trackingEncodeMs';

type StoredQualitySnapshot = Omit<PhoneQualityTelemetrySnapshot, 'percentiles'>;

interface SessionTelemetry {
  snapshot: StoredQualitySnapshot;
  preloadStartedAt: number | null;
  lastTrackingAt: number | null;
  recentRtts: number[];
  samples: Record<QualityMetric, number[]>;
}

const QUALITY_METRICS: QualityMetric[] = [
  'audioRttMs',
  'audioDriftAbsMs',
  'audioSchedulerLatenessAbsMs',
  'trackingCaptureAgeMs',
  'trackingDetectionMs',
  'trackingEncodeMs',
];
const MAX_QUALITY_SAMPLES = 2_048;

function emptySamples(): Record<QualityMetric, number[]> {
  return {
    audioRttMs: [],
    audioDriftAbsMs: [],
    audioSchedulerLatenessAbsMs: [],
    trackingCaptureAgeMs: [],
    trackingDetectionMs: [],
    trackingEncodeMs: [],
  };
}

function emptySnapshot(): StoredQualitySnapshot {
  return {
    updatedAt: 0,
    preloadMs: null,
    cacheHitRate: null,
    rttMs: null,
    jitterMs: null,
    clockOffsetMs: null,
    driftMs: null,
    schedulerLatenessMs: null,
    packetRateHz: null,
    captureAgeMs: null,
    detectionMs: null,
    encodeMs: null,
    bufferedBytes: 0,
    sentPackets: 0,
    droppedPackets: 0,
  };
}

function recordSample(session: SessionTelemetry, metric: QualityMetric, value: unknown, absolute = false): void {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  const samples = session.samples[metric];
  samples.push(absolute ? Math.abs(numeric) : numeric);
  if (samples.length > MAX_QUALITY_SAMPLES) samples.shift();
}

function summarize(samples: number[]): QualityPercentiles | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (quantile: number): number => sorted[Math.ceil(quantile * sorted.length) - 1] ?? sorted[0]!;
  return { samples: sorted.length, p50: at(0.5), p95: at(0.95) };
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

export class PhoneQualityTelemetryStore {
  private readonly sessions = new Map<string, SessionTelemetry>();

  record(sessionId: string, role: 'host' | 'phone', event: Record<string, unknown>, now = Date.now()): void {
    const type = event['type'];
    if (typeof type !== 'string') return;
    const session = this.session(sessionId);

    if (role === 'host') {
      if (type === 'audio-bank-prepare') session.preloadStartedAt = now;
      if (type === 'audio-clock-update') session.snapshot.clockOffsetMs = Number(event['offsetMs']);
      else if (type !== 'audio-bank-prepare') return;
    } else if (type === 'tracking-metrics') {
      session.snapshot.captureAgeMs = event['captureAgeMs'] === null ? null : Number(event['captureAgeMs']);
      session.snapshot.detectionMs = Number(event['detectionMs']);
      session.snapshot.encodeMs = Number(event['encodeMs']);
      session.snapshot.bufferedBytes = Number(event['bufferedBytes']);
      session.snapshot.sentPackets = Number(event['sentPackets']);
      session.snapshot.droppedPackets = Number(event['droppedPackets']);
      session.snapshot.packetRateHz = session.lastTrackingAt === null
        ? null
        : session.snapshot.sentPackets * 1_000 / Math.max(1, now - session.lastTrackingAt);
      session.lastTrackingAt = now;
      recordSample(session, 'trackingCaptureAgeMs', event['captureAgeMs']);
      recordSample(session, 'trackingDetectionMs', event['detectionMs']);
      recordSample(session, 'trackingEncodeMs', event['encodeMs']);
    } else if (type === 'audio-bank-ready') {
      session.snapshot.preloadMs = session.preloadStartedAt === null ? null : Math.max(0, now - session.preloadStartedAt);
      session.preloadStartedAt = null;
      const totalAssets = Number(event['totalAssets']);
      session.snapshot.cacheHitRate = totalAssets > 0 ? Number(event['cachedAssets']) / totalAssets : 0;
    } else if (type === 'audio-clock-pong') {
      const processingMs = Number(event['phoneSentAt']) - Number(event['phoneReceivedAt']);
      const rttMs = Math.max(0, now - Number(event['hostSentAt']) - processingMs);
      session.recentRtts.push(rttMs);
      if (session.recentRtts.length > 8) session.recentRtts.shift();
      session.snapshot.rttMs = rttMs;
      session.snapshot.jitterMs = standardDeviation(session.recentRtts);
      recordSample(session, 'audioRttMs', rttMs);
    } else if (type === 'audio-sync-status') {
      session.snapshot.driftMs = Number(event['driftMs']);
      recordSample(session, 'audioDriftAbsMs', event['driftMs'], true);
    } else if (type === 'audio-sfx-ack') {
      session.snapshot.schedulerLatenessMs = Number(event['latenessMs']);
      recordSample(session, 'audioSchedulerLatenessAbsMs', event['latenessMs'], true);
    } else {
      return;
    }

    session.snapshot.updatedAt = now;
  }

  get(sessionId: string): PhoneQualityTelemetrySnapshot | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const percentiles = Object.fromEntries(
      QUALITY_METRICS.map(metric => [metric, summarize(session.samples[metric])]),
    ) as Record<QualityMetric, QualityPercentiles | null>;
    return { ...session.snapshot, percentiles };
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }

  private session(sessionId: string): SessionTelemetry {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        snapshot: emptySnapshot(),
        preloadStartedAt: null,
        lastTrackingAt: null,
        recentRtts: [],
        samples: emptySamples(),
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }
}
