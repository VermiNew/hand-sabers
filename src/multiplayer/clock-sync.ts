let serverClockOffsetMs = 0;
const clockSamples: Array<{ offset: number; rtt: number }> = [];
const diagnosticRtts: number[] = [];

export interface NetworkDiagnostics {
  currentMs: number;
  minMs: number;
  maxMs: number;
  averageMs: number;
  jitterMs: number;
  samples: number;
}

export function resetClockSync(): void {
  clockSamples.length = 0;
  diagnosticRtts.length = 0;
  serverClockOffsetMs = 0;
}

export function recordClockPong(
  sentAtValue: unknown,
  serverTimeValue: unknown,
  receivedAt = Date.now(),
): NetworkDiagnostics | null {
  const sentAt = Number(sentAtValue);
  const serverTime = Number(serverTimeValue);
  if (!Number.isFinite(sentAt) || !Number.isFinite(serverTime) || sentAt > receivedAt) return null;
  const rtt = receivedAt - sentAt;
  if (rtt > 10_000) return null;

  diagnosticRtts.push(rtt);
  if (diagnosticRtts.length > 30) diagnosticRtts.shift();
  clockSamples.push({ rtt, offset: serverTime - (sentAt + receivedAt) / 2 });
  clockSamples.sort((left, right) => left.rtt - right.rtt);
  if (clockSamples.length > 8) clockSamples.length = 8;
  const bestOffsets = clockSamples
    .slice(0, 3)
    .map(sample => sample.offset)
    .sort((left, right) => left - right);
  serverClockOffsetMs = bestOffsets[Math.floor(bestOffsets.length / 2)] ?? 0;
  return getNetworkDiagnostics();
}

export function getNetworkDiagnostics(): NetworkDiagnostics | null {
  const samples = diagnosticRtts.length;
  if (!samples) return null;
  const averageMs = diagnosticRtts.reduce((sum, value) => sum + value, 0) / samples;
  const jitterMs = samples < 2
    ? 0
    : diagnosticRtts.slice(1).reduce((sum, value, index) => (
      sum + Math.abs(value - (diagnosticRtts[index] ?? value))
    ), 0) / (samples - 1);
  return {
    currentMs: diagnosticRtts[samples - 1] ?? 0,
    minMs: Math.min(...diagnosticRtts),
    maxMs: Math.max(...diagnosticRtts),
    averageMs,
    jitterMs,
    samples,
  };
}

export function serverTimeToPerformance(serverTime: number): number {
  const estimatedServerNow = Date.now() + serverClockOffsetMs;
  return performance.now() + (serverTime - estimatedServerNow);
}
