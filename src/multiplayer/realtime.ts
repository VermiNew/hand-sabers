export interface RemoteHandPose {
  confidence: number;
  position: readonly [number, number, number];
  bladeDirection: readonly [number, number, number];
  rollDirection: readonly [number, number, number];
}

interface RemotePacketHeader {
  streamId: number;
  sequence: number;
  sentAt: number;
}

export interface RemotePosePacket extends RemotePacketHeader {
  kind: 'pose';
  left: RemoteHandPose | null;
  right: RemoteHandPose | null;
}

export interface RemoteLandmarkPacket extends RemotePacketHeader {
  kind: 'landmarks';
  leftConfidence: number;
  rightConfidence: number;
  left: Float32Array | null;
  right: Float32Array | null;
}

export type RemoteRealtimePacket = RemotePosePacket | RemoteLandmarkPacket;

const SERVER_PREFIX_BYTES = 4;
const POSE_PACKET_BYTES = 96;
const LANDMARK_PACKET_BYTES = 528;
const PROTOCOL_VERSION = 1;

function readFinite(view: DataView, offset: number, limit: number): number | null {
  const value = view.getFloat32(offset, true);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function readHandPose(view: DataView, offset: number, active: boolean): RemoteHandPose | null | undefined {
  const values: number[] = [];
  for (let index = 0; index < 10; index++) {
    const value = readFinite(view, offset + index * 4, 10);
    if (value === null) return undefined;
    values.push(value);
  }
  if (!active) return null;
  const confidence = values[0]!;
  if (confidence < 0 || confidence > 1) return undefined;
  return {
    confidence,
    position: [values[1]!, values[2]!, values[3]!],
    bladeDirection: [values[4]!, values[5]!, values[6]!],
    rollDirection: [values[7]!, values[8]!, values[9]!],
  };
}

function readLandmarks(view: DataView, offset: number, active: boolean): Float32Array | null | undefined {
  const values = new Float32Array(21 * 3);
  for (let index = 0; index < values.length; index++) {
    const value = readFinite(view, offset + index * 4, 4);
    if (value === null) return undefined;
    values[index] = value;
  }
  return active ? values : null;
}

export function decodeRealtimePacket(buffer: ArrayBuffer): RemoteRealtimePacket | null {
  if (
    buffer.byteLength !== SERVER_PREFIX_BYTES + POSE_PACKET_BYTES
    && buffer.byteLength !== SERVER_PREFIX_BYTES + LANDMARK_PACKET_BYTES
  ) return null;

  const view = new DataView(buffer);
  const streamId = view.getUint32(0, true);
  const version = view.getUint8(4);
  const packetKind = view.getUint8(5);
  const flags = view.getUint8(6);
  const reserved = view.getUint8(7);
  const sequence = view.getUint32(8, true);
  const sentAt = view.getFloat64(12, true);
  if (
    streamId === 0
    || version !== PROTOCOL_VERSION
    || flags > 3
    || reserved !== 0
    || !Number.isFinite(sentAt)
    || sentAt < 0
  ) return null;

  const leftActive = (flags & 1) !== 0;
  const rightActive = (flags & 2) !== 0;
  if (packetKind === 1 && buffer.byteLength === SERVER_PREFIX_BYTES + POSE_PACKET_BYTES) {
    const left = readHandPose(view, 20, leftActive);
    const right = readHandPose(view, 60, rightActive);
    if (left === undefined || right === undefined) return null;
    return { kind: 'pose', streamId, sequence, sentAt, left, right };
  }

  if (packetKind === 2 && buffer.byteLength === SERVER_PREFIX_BYTES + LANDMARK_PACKET_BYTES) {
    const leftConfidence = readFinite(view, 20, 1);
    const rightConfidence = readFinite(view, 24, 1);
    const left = readLandmarks(view, 28, leftActive);
    const right = readLandmarks(view, 280, rightActive);
    if (
      leftConfidence === null
      || rightConfidence === null
      || leftConfidence < 0
      || rightConfidence < 0
      || left === undefined
      || right === undefined
    ) return null;
    return {
      kind: 'landmarks',
      streamId,
      sequence,
      sentAt,
      leftConfidence,
      rightConfidence,
      left,
      right,
    };
  }
  return null;
}
