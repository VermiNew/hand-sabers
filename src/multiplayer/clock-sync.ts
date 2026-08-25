let serverClockOffsetMs = 0;
const clockSamples: Array<{ offset: number; rtt: number }> = [];

export function resetClockSync(): void {
  clockSamples.length = 0;
  serverClockOffsetMs = 0;
}

export function recordClockPong(sentAtValue: unknown, serverTimeValue: unknown, receivedAt = Date.now()): void {
  const sentAt = Number(sentAtValue);
  const serverTime = Number(serverTimeValue);
  if (!Number.isFinite(sentAt) || !Number.isFinite(serverTime) || sentAt > receivedAt) return;
  const rtt = receivedAt - sentAt;
  if (rtt > 10_000) return;

  clockSamples.push({ rtt, offset: serverTime - (sentAt + receivedAt) / 2 });
  clockSamples.sort((left, right) => left.rtt - right.rtt);
  if (clockSamples.length > 8) clockSamples.length = 8;
  const bestOffsets = clockSamples
    .slice(0, 3)
    .map(sample => sample.offset)
    .sort((left, right) => left - right);
  serverClockOffsetMs = bestOffsets[Math.floor(bestOffsets.length / 2)] ?? 0;
}

export function serverTimeToPerformance(serverTime: number): number {
  const estimatedServerNow = Date.now() + serverClockOffsetMs;
  return performance.now() + (serverTime - estimatedServerNow);
}
