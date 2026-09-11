import type { Settings } from '../types/index.js';

export const PHONE_DIAGNOSTICS_REPORT_VERSION = 1 as const;

const QUALITY_NUMBER_KEYS = [
  'updatedAt', 'preloadMs', 'cacheHitRate', 'rttMs', 'jitterMs', 'clockOffsetMs',
  'driftMs', 'schedulerLatenessMs', 'packetRateHz', 'captureAgeMs', 'detectionMs',
  'encodeMs', 'bufferedBytes', 'sentPackets', 'droppedPackets',
] as const;
const QUALITY_PERCENTILE_KEYS = [
  'audioRttMs', 'audioDriftAbsMs', 'audioSchedulerLatenessAbsMs',
  'trackingCaptureAgeMs', 'trackingDetectionMs', 'trackingEncodeMs',
] as const;

export interface LocalPhoneDiagnostics {
  packetRateHz: number;
  payloadBytes: number;
  estimatedNetworkMs: number | null;
  droppedPackets: number;
  applyMs: number | null;
  captureAgeMs: number | null;
  detectionMs: number | null;
  encodeMs: number | null;
  bufferedBytes: number;
  phoneDroppedPackets: number;
  audioPreloadMs: number | null;
  audioCacheHitRate: number | null;
  audioRttMs: number | null;
  audioJitterMs: number | null;
  audioClockOffsetMs: number | null;
  audioDriftMs: number | null;
  audioSchedulerLatenessMs: number | null;
}

interface QualityPercentiles {
  samples: number;
  p50: number;
  p95: number;
}

type ServerQualitySnapshot = Record<string, number | null | Record<string, QualityPercentiles | null>>;

export interface PhoneDiagnosticsReport {
  product: 'hand-sabers-phone-diagnostics';
  version: typeof PHONE_DIAGNOSTICS_REPORT_VERSION;
  exportedAt: string;
  session: {
    phase: string;
    connected: boolean;
  };
  environment: {
    userAgent: string;
    language: string;
    hardwareConcurrency: number | null;
    deviceMemoryGb: number | null;
  };
  settings: {
    trackingSource: Settings['trackingSource'];
    phoneCameraProcessing: Settings['phoneCameraProcessing'];
    phoneAudioOutput: boolean;
    phoneAudioLatencyMs: number;
    audioOffsetMs: number;
    performanceMode: Settings['performanceMode'];
    handDetectionConfidence: number;
    handPresenceConfidence: number;
    handTrackingConfidence: number;
  };
  local: LocalPhoneDiagnostics;
  server: ServerQualitySnapshot | null;
  manualValidation: {
    required: true;
    confirmedByReport: false;
    checks: string[];
  };
}

interface CreatePhoneDiagnosticsReportOptions {
  settings: Settings;
  sessionPhase: string;
  connected: boolean;
  local: LocalPhoneDiagnostics;
  serverQuality: unknown;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizePercentiles(value: unknown): QualityPercentiles | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const samples = finiteNumber(candidate['samples']);
  const p50 = finiteNumber(candidate['p50']);
  const p95 = finiteNumber(candidate['p95']);
  if (samples === null || !Number.isSafeInteger(samples) || samples < 1 || samples > 2_048 || p50 === null || p95 === null) {
    return null;
  }
  return { samples, p50, p95 };
}

function sanitizeServerQuality(value: unknown): ServerQualitySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const snapshot: ServerQualitySnapshot = {};
  for (const key of QUALITY_NUMBER_KEYS) snapshot[key] = finiteNumber(candidate[key]);

  const rawPercentiles = candidate['percentiles'];
  const percentileSource = rawPercentiles && typeof rawPercentiles === 'object' && !Array.isArray(rawPercentiles)
    ? rawPercentiles as Record<string, unknown>
    : {};
  snapshot['percentiles'] = Object.fromEntries(
    QUALITY_PERCENTILE_KEYS.map(key => [key, sanitizePercentiles(percentileSource[key])]),
  );
  return snapshot;
}

function deviceMemory(): number | null {
  const value = (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
  return finiteNumber(value);
}

export function createPhoneDiagnosticsReport({
  settings,
  sessionPhase,
  connected,
  local,
  serverQuality,
}: CreatePhoneDiagnosticsReportOptions): PhoneDiagnosticsReport {
  return {
    product: 'hand-sabers-phone-diagnostics',
    version: PHONE_DIAGNOSTICS_REPORT_VERSION,
    exportedAt: new Date().toISOString(),
    session: { phase: sessionPhase, connected },
    environment: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      hardwareConcurrency: finiteNumber(navigator.hardwareConcurrency),
      deviceMemoryGb: deviceMemory(),
    },
    settings: {
      trackingSource: settings.trackingSource,
      phoneCameraProcessing: settings.phoneCameraProcessing,
      phoneAudioOutput: settings.phoneAudioOutput,
      phoneAudioLatencyMs: settings.phoneAudioLatencyMs,
      audioOffsetMs: settings.audioOffsetMs,
      performanceMode: settings.performanceMode,
      handDetectionConfidence: settings.handDetectionConfidence,
      handPresenceConfidence: settings.handPresenceConfidence,
      handTrackingConfidence: settings.handTrackingConfidence,
    },
    local: { ...local },
    server: sanitizeServerQuality(serverQuality),
    manualValidation: {
      required: true,
      confirmedByReport: false,
      checks: [
        'Physical speaker/headphone latency and the ±20 ms target',
        'Bluetooth, wired and built-in audio outputs',
        'Screen lock, page restore and output-device changes',
        'iOS and Android on weak and high-end phones over 2.4/5 GHz Wi-Fi',
      ],
    },
  };
}

export function serializePhoneDiagnosticsJson(report: PhoneDiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}

function csvCell(value: unknown): string {
  const text = value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function flatten(value: unknown, prefix = ''): Array<[string, string | number | boolean | null]> {
  if (Array.isArray(value)) return value.flatMap((item, index) => flatten(item, `${prefix}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key));
  }
  return [[prefix, value === null || ['string', 'number', 'boolean'].includes(typeof value)
    ? value as string | number | boolean | null
    : String(value)]];
}

export function serializePhoneDiagnosticsCsv(report: PhoneDiagnosticsReport): string {
  const rows = flatten(report).map(([field, value]) => `${csvCell(field)},${csvCell(value)}`);
  return `field,value\r\n${rows.join('\r\n')}\r\n`;
}
