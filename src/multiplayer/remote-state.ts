import type {
  RemoteHandPose,
  RemoteLandmarkPacket,
  RemotePosePacket,
  RemoteRealtimePacket,
} from './realtime.ts';

interface TimedPose {
  packet: RemotePosePacket;
  receivedAt: number;
}

interface TimedLandmarks {
  packet: RemoteLandmarkPacket;
  receivedAt: number;
}

interface StreamState {
  lastSequence: number;
  poses: TimedPose[];
  landmarks: TimedLandmarks | null;
}

export interface RemotePlayerSample {
  streamId: number;
  left: RemoteHandPose | null;
  right: RemoteHandPose | null;
  receivedAt: number;
}

const MAX_POSE_SAMPLES = 12;
const INTERPOLATION_DELAY_MS = 100;
const STALE_POSE_MS = 750;
const STALE_LANDMARKS_MS = 750;

function isNewerSequence(next: number, previous: number): boolean {
  const difference = (next - previous) >>> 0;
  return difference !== 0 && difference < 0x8000_0000;
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function interpolateVector(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  amount: number,
  normalize = false,
): readonly [number, number, number] {
  let x = lerp(left[0], right[0], amount);
  let y = lerp(left[1], right[1], amount);
  let z = lerp(left[2], right[2], amount);
  if (normalize) {
    const length = Math.hypot(x, y, z);
    if (length > 0.0001) {
      x /= length;
      y /= length;
      z /= length;
    }
  }
  return [x, y, z];
}

function interpolateHand(
  left: RemoteHandPose | null,
  right: RemoteHandPose | null,
  amount: number,
): RemoteHandPose | null {
  if (!left || !right) return amount < 0.5 ? left : right;
  return {
    confidence: lerp(left.confidence, right.confidence, amount),
    position: interpolateVector(left.position, right.position, amount),
    bladeDirection: interpolateVector(left.bladeDirection, right.bladeDirection, amount, true),
    rollDirection: interpolateVector(left.rollDirection, right.rollDirection, amount, true),
  };
}

export class RemoteTrackingStore {
  private readonly streams = new Map<number, StreamState>();

  ingest(packet: RemoteRealtimePacket, receivedAt = performance.now()): void {
    const existing = this.streams.get(packet.streamId);
    if (existing && !isNewerSequence(packet.sequence, existing.lastSequence)) return;
    const stream = existing ?? { lastSequence: packet.sequence, poses: [], landmarks: null };
    stream.lastSequence = packet.sequence;
    if (packet.kind === 'pose') {
      stream.poses.push({ packet, receivedAt });
      if (stream.poses.length > MAX_POSE_SAMPLES) {
        stream.poses.splice(0, stream.poses.length - MAX_POSE_SAMPLES);
      }
    } else {
      stream.landmarks = { packet, receivedAt };
    }
    this.streams.set(packet.streamId, stream);
  }

  sample(now = performance.now()): RemotePlayerSample[] {
    const target = now - INTERPOLATION_DELAY_MS;
    const samples: RemotePlayerSample[] = [];
    for (const [streamId, stream] of this.streams) {
      while (stream.poses.length > 2 && stream.poses[1]!.receivedAt <= target) {
        stream.poses.shift();
      }
      const newest = stream.poses.at(-1);
      if (!newest || now - newest.receivedAt > STALE_POSE_MS) continue;
      const before = stream.poses[0]!;
      const after = stream.poses[1] ?? before;
      const duration = after.receivedAt - before.receivedAt;
      const amount = duration > 0
        ? Math.max(0, Math.min(1, (target - before.receivedAt) / duration))
        : 1;
      samples.push({
        streamId,
        left: interpolateHand(before.packet.left, after.packet.left, amount),
        right: interpolateHand(before.packet.right, after.packet.right, amount),
        receivedAt: newest.receivedAt,
      });
    }
    return samples;
  }

  getLandmarks(streamId: number, now = performance.now()): RemoteLandmarkPacket | null {
    const landmarks = this.streams.get(streamId)?.landmarks;
    return landmarks && now - landmarks.receivedAt <= STALE_LANDMARKS_MS ? landmarks.packet : null;
  }

  retainStreams(streamIds: ReadonlySet<number>): void {
    for (const streamId of this.streams.keys()) {
      if (!streamIds.has(streamId)) this.streams.delete(streamId);
    }
  }

  clear(): void {
    this.streams.clear();
  }
}

export const remoteTracking = new RemoteTrackingStore();
