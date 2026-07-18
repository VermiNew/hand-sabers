import { getSettings } from '../core/settings.ts';
import { canSendRealtime, sendRealtimePacket } from '../multiplayer/client.ts';
import { PROTOCOL_VERSION } from '../multiplayer/protocol.ts';
import type { SaberQuat } from '../types/index.js';

export interface Landmark { x: number; y: number; z: number; }

export interface HandednessCategory {
  score: number;
  categoryName?: string;
  displayName?:  string;
}

export interface DetectResult {
  landmarks?:  Landmark[][];
  handedness?: HandednessCategory[][];
}

export interface WorkerResult {
  leftActive:    boolean;
  rightActive:   boolean;
  leftQuat?:     SaberQuat;
  rightQuat?:    SaberQuat;
  leftPos?:      { x: number; y: number; z: number };
  rightPos?:     { x: number; y: number; z: number };
  leftConf:      number;
  rightConf:     number;
  filteredCount: number;
  rawCount:      number;
}

let realtimeSequence = 0;
let lastRealtimePoseMs = -Infinity;
let lastRealtimeLandmarksMs = -Infinity;

export function decodeRemoteLandmarks(packet: ArrayBuffer): DetectResult | null {
  if (packet.byteLength !== 528) return null;
  const view = new DataView(packet);
  if (view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== 2 || view.getUint8(2) > 3) return null;
  const flags = view.getUint8(2);
  const landmarks: Landmark[][] = [];
  const handedness: HandednessCategory[][] = [];
  for (let handIndex = 0; handIndex < 2; handIndex++) {
    if ((flags & (1 << handIndex)) === 0) continue;
    const hand: Landmark[] = [];
    for (let landmarkIndex = 0; landmarkIndex < 21; landmarkIndex++) {
      const offset = 24 + handIndex * 252 + landmarkIndex * 12;
      hand.push({
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
      });
    }
    landmarks.push(hand);
    handedness.push([{
      score: view.getFloat32(handIndex === 0 ? 16 : 20, true),
      categoryName: handIndex === 0 ? 'Left' : 'Right',
    }]);
  }
  return { landmarks, handedness };
}

function writePose(
  view: DataView,
  offset: number,
  active: boolean,
  confidence: number,
  position: { x: number; y: number; z: number } | undefined,
  orientation: SaberQuat | undefined,
): void {
  const values = active && position && orientation
    ? [
        confidence,
        position.x, position.y, position.z,
        orientation.bladeDir.x, orientation.bladeDir.y, orientation.bladeDir.z,
        orientation.rollDir.x, orientation.rollDir.y, orientation.rollDir.z,
      ]
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  values.forEach((value, index) => view.setFloat32(offset + index * 4, value, true));
}

export function sendRealtimePose(result: WorkerResult, now: number): void {
  if (!canSendRealtime() || now - lastRealtimePoseMs < 1000 / 60) return;
  const leftReady = result.leftActive && Boolean(result.leftPos && result.leftQuat);
  const rightReady = result.rightActive && Boolean(result.rightPos && result.rightQuat);
  const packet = new ArrayBuffer(96);
  const view = new DataView(packet);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, 1);
  view.setUint8(2, (leftReady ? 1 : 0) | (rightReady ? 2 : 0));
  view.setUint32(4, realtimeSequence++, true);
  view.setFloat64(8, now, true);
  writePose(view, 16, leftReady, result.leftConf, result.leftPos, result.leftQuat);
  writePose(view, 56, rightReady, result.rightConf, result.rightPos, result.rightQuat);
  if (sendRealtimePacket(packet)) lastRealtimePoseMs = now;
}

function assignLandmarksToSides(result: DetectResult): {
  left: Landmark[] | null;
  right: Landmark[] | null;
  leftConfidence: number;
  rightConfidence: number;
} {
  const settings = getSettings();
  const candidates = (result.landmarks ?? [])
    .map((landmarks, index) => {
      const handedness = result.handedness?.[index]?.[0];
      const label = String(handedness?.categoryName ?? handedness?.displayName ?? '').toLowerCase();
      const rawSide = label.includes('left') ? 'left' : label.includes('right') ? 'right' : null;
      const side = settings.flipCamera
        ? rawSide === 'left' ? 'right' : rawSide === 'right' ? 'left' : null
        : rawSide;
      const wristX = landmarks[0]?.x ?? 0.5;
      const worldX = 0.5 - (settings.flipCamera ? 1 - wristX : wristX);
      return { landmarks, confidence: handedness?.score ?? 0, side, worldX };
    })
    .filter(candidate => candidate.landmarks.length >= 21);

  if ((settings.oneHandMode === 'left' || settings.oneHandMode === 'right') && candidates.length) {
    const selected = [...candidates].sort((a, b) => b.confidence - a.confidence)[0]!;
    return settings.oneHandMode === 'left'
      ? { left: selected.landmarks, right: null, leftConfidence: selected.confidence, rightConfidence: 0 }
      : { left: null, right: selected.landmarks, leftConfidence: 0, rightConfidence: selected.confidence };
  }

  const sorted = [...candidates].sort((a, b) => a.worldX - b.worldX);
  let left = candidates.find(candidate => candidate.side === 'left') ?? null;
  let right = candidates.find(candidate => candidate.side === 'right' && candidate !== left) ?? null;
  if (!left && !right && sorted.length === 1) {
    if (sorted[0]!.worldX <= 0) left = sorted[0]!;
    else right = sorted[0]!;
  } else {
    left ??= sorted.find(candidate => candidate !== right) ?? null;
    right ??= [...sorted].reverse().find(candidate => candidate !== left) ?? null;
  }
  return {
    left: left?.landmarks ?? null,
    right: right?.landmarks ?? null,
    leftConfidence: left?.confidence ?? 0,
    rightConfidence: right?.confidence ?? 0,
  };
}

function safeLandmarkValue(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(-4, Math.min(4, value!)) : 0;
}

export function sendRealtimeLandmarks(result: DetectResult, now: number, debugVisuals: boolean): void {
  if (!debugVisuals || !canSendRealtime() || now - lastRealtimeLandmarksMs < 1000 / 30) return;
  const assigned = assignLandmarksToSides(result);
  const packet = new ArrayBuffer(528);
  const view = new DataView(packet);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, 2);
  view.setUint8(2, (assigned.left ? 1 : 0) | (assigned.right ? 2 : 0));
  view.setUint32(4, realtimeSequence++, true);
  view.setFloat64(8, now, true);
  view.setFloat32(16, Math.max(0, Math.min(1, assigned.leftConfidence)), true);
  view.setFloat32(20, Math.max(0, Math.min(1, assigned.rightConfidence)), true);
  for (const [handIndex, landmarks] of [assigned.left, assigned.right].entries()) {
    for (let landmarkIndex = 0; landmarkIndex < 21; landmarkIndex++) {
      const landmark = landmarks?.[landmarkIndex];
      const offset = 24 + handIndex * 252 + landmarkIndex * 12;
      view.setFloat32(offset, safeLandmarkValue(landmark?.x), true);
      view.setFloat32(offset + 4, safeLandmarkValue(landmark?.y), true);
      view.setFloat32(offset + 8, safeLandmarkValue(landmark?.z), true);
    }
  }
  if (sendRealtimePacket(packet)) lastRealtimeLandmarksMs = now;
}
