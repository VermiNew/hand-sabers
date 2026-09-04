export const REMOTE_TRACKING_METRICS_EVENT = 'hand-sabers:remote-tracking-metrics';

export interface RemoteTrackingMetrics {
  packetRateHz: number;
  payloadBytes: number;
  estimatedNetworkMs: number | null;
  droppedPackets: number;
}

let previousSequence: number | null = null;
let windowStartedAt = performance.now();
let packetsInWindow = 0;
let packetRateHz = 0;
let droppedPackets = 0;
let lastPublishedAt = -Infinity;

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
  };
  if (receivedAt - lastPublishedAt >= 250) {
    lastPublishedAt = receivedAt;
    window.dispatchEvent(new CustomEvent(REMOTE_TRACKING_METRICS_EVENT, { detail: metrics }));
  }
  return metrics;
}
