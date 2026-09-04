export const REMOTE_TRACKING_METRICS_EVENT = 'hand-sabers:remote-tracking-metrics';

export interface RemoteTrackingMetrics {
  packetRateHz: number;
  payloadBytes: number;
  estimatedNetworkMs: number | null;
  droppedPackets: number;
  phoneCaptureAgeMs: number | null;
  phoneDetectionMs: number | null;
  phoneEncodeMs: number | null;
  phoneBufferedBytes: number;
  phoneDroppedPackets: number;
}

export interface PhoneTrackingMetricsEvent {
  v: 1;
  type: 'tracking-metrics';
  captureAgeMs: number | null;
  detectionMs: number;
  encodeMs: number;
  bufferedBytes: number;
  sentPackets: number;
  droppedPackets: number;
}

let previousSequence: number | null = null;
let windowStartedAt = performance.now();
let packetsInWindow = 0;
let packetRateHz = 0;
let droppedPackets = 0;
let lastPublishedAt = -Infinity;
let phoneMetrics: PhoneTrackingMetricsEvent | null = null;

function finiteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function isPhoneTrackingMetricsEvent(value: unknown): value is PhoneTrackingMetricsEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return event['v'] === 1
    && event['type'] === 'tracking-metrics'
    && (event['captureAgeMs'] === null || finiteInRange(event['captureAgeMs'], 0, 5_000))
    && finiteInRange(event['detectionMs'], 0, 5_000)
    && finiteInRange(event['encodeMs'], 0, 1_000)
    && finiteInRange(event['bufferedBytes'], 0, 1_048_576)
    && finiteInRange(event['sentPackets'], 0, 1_000)
    && finiteInRange(event['droppedPackets'], 0, 1_000);
}

export function recordPhoneTrackingMetrics(event: PhoneTrackingMetricsEvent): void {
  phoneMetrics = event;
}

function estimateNetworkMs(sentAtEpochMs: number, receivedAtEpochMs: number): number | null {
  if (sentAtEpochMs < 1_000_000_000_000) return null;
  const elapsed = receivedAtEpochMs - sentAtEpochMs;
  // Phone and PC clocks can differ. Hide misleading values instead of presenting
  // clock skew as network latency.
  return elapsed >= 0 && elapsed <= 5_000 ? elapsed : null;
}

export function resetRemoteTrackingMetrics(): void {
  previousSequence = null;
  windowStartedAt = performance.now();
  packetsInWindow = 0;
  packetRateHz = 0;
  droppedPackets = 0;
  lastPublishedAt = -Infinity;
  phoneMetrics = null;
}

export function recordRemoteTrackingPacket(packet: ArrayBuffer): RemoteTrackingMetrics | null {
  if (packet.byteLength !== 528) return null;
  const view = new DataView(packet);
  if (view.getUint8(0) !== 1 || view.getUint8(1) !== 2) return null;

  const receivedAt = performance.now();
  const sequence = view.getUint32(4, true);
  if (previousSequence !== null) {
    const distance = (sequence - previousSequence) >>> 0;
    // Ignore reconnects, reordered packets and sequence resets.
    if (distance > 1 && distance < 1_000) droppedPackets += distance - 1;
  }
  previousSequence = sequence;

  packetsInWindow++;
  const windowMs = receivedAt - windowStartedAt;
  if (windowMs >= 1_000) {
    packetRateHz = packetsInWindow * 1_000 / windowMs;
    packetsInWindow = 0;
    windowStartedAt = receivedAt;
  }

  const metrics: RemoteTrackingMetrics = {
    packetRateHz,
    payloadBytes: packet.byteLength,
    estimatedNetworkMs: estimateNetworkMs(view.getFloat64(8, true), Date.now()),
    droppedPackets,
    phoneCaptureAgeMs: phoneMetrics?.captureAgeMs ?? null,
    phoneDetectionMs: phoneMetrics?.detectionMs ?? null,
    phoneEncodeMs: phoneMetrics?.encodeMs ?? null,
    phoneBufferedBytes: phoneMetrics?.bufferedBytes ?? 0,
    phoneDroppedPackets: phoneMetrics?.droppedPackets ?? 0,
  };
  if (receivedAt - lastPublishedAt >= 250) {
    lastPublishedAt = receivedAt;
    window.dispatchEvent(new CustomEvent(REMOTE_TRACKING_METRICS_EVENT, { detail: metrics }));
  }
  return metrics;
}
