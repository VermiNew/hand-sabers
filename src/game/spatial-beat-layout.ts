import { getBeatHitTimeSec } from '../core/timing.ts';
import type { Beat, SaberSide } from '../types/index.js';

export interface SpatialBeatPosition {
  x: number;
  y: number;
  grouped: boolean;
}

interface LayoutEntry {
  index: number;
  time: number;
  side: SaberSide;
  groupIndex: number | null;
}

const GROUP_WINDOW_SEC = 0.5;
const GROUP_MIN_BLOCKS = 4;
const COLLISION_WINDOW_SEC = 0.16;
const MIN_SPATIAL_DISTANCE = 0.48;
const Y_MIN = 0.62;
const Y_MAX = 1.88;
const FORMATION = [
  { x: -1.15, y: 0.72 },
  { x: -0.42, y: 1.62 },
  { x: 0.42, y: 0.82 },
  { x: 1.15, y: 1.72 },
  { x: -1.02, y: 1.72 },
  { x: 1.02, y: 0.68 },
] as const;

function random01(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
  value = Math.imul(value ^ value >>> 15, 0x735a2d97);
  return ((value ^ value >>> 15) >>> 0) / 0x1_0000_0000;
}

function resolvedSide(beat: Beat, index: number): SaberSide {
  if (beat.side === 'left' || beat.side === 'right') return beat.side;
  return ((index * 0x9e37_79b1) >>> 0) % 2 === 0 ? 'left' : 'right';
}

function markDenseGroups(entries: LayoutEntry[]): void {
  let cursor = 0;
  let groupIndex = 0;
  while (cursor < entries.length) {
    let end = cursor + 1;
    while (end < entries.length && entries[end]!.time - entries[cursor]!.time <= GROUP_WINDOW_SEC) end++;
    if (end - cursor >= GROUP_MIN_BLOCKS) {
      for (let index = cursor; index < end; index++) entries[index]!.groupIndex = groupIndex;
      groupIndex++;
      cursor = end;
    } else {
      cursor++;
    }
  }
}

function desiredPosition(entry: LayoutEntry, groupOrder: number): { x: number; y: number } {
  if (entry.groupIndex !== null) {
    const formationIndex = (groupOrder + entry.groupIndex * 2) % FORMATION.length;
    return FORMATION[formationIndex]!;
  }
  const xMin = entry.side === 'left' ? -1.38 : -0.18;
  const xMax = entry.side === 'left' ? 0.18 : 1.38;
  return {
    x: xMin + random01(entry.index * 17 + 11) * (xMax - xMin),
    y: Y_MIN + random01(entry.index * 29 + 23) * (Y_MAX - Y_MIN),
  };
}

function clampReachable(
  desired: { x: number; y: number },
  previous: { x: number; y: number; time: number } | undefined,
  time: number,
): { x: number; y: number } {
  if (!previous) return desired;
  const elapsed = Math.max(0, time - previous.time);
  const maximumDistance = 0.52 + elapsed * 2.8;
  const dx = desired.x - previous.x;
  const dy = desired.y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= maximumDistance || distance === 0) return desired;
  const scale = maximumDistance / distance;
  return { x: previous.x + dx * scale, y: previous.y + dy * scale };
}

function overlapsRecent(
  candidate: { x: number; y: number },
  time: number,
  placed: Array<{ x: number; y: number; time: number }>,
): boolean {
  return placed.some(other =>
    time - other.time <= COLLISION_WINDOW_SEC
    && Math.hypot(candidate.x - other.x, candidate.y - other.y) < MIN_SPATIAL_DISTANCE
  );
}

function separatePosition(
  desired: { x: number; y: number },
  entry: LayoutEntry,
  previous: { x: number; y: number; time: number } | undefined,
  placed: Array<{ x: number; y: number; time: number }>,
): { x: number; y: number } {
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = random01(entry.index * 101 + attempt * 43 + 7) * Math.PI * 2;
    const radius = attempt === 0 ? 0 : 0.18 + Math.floor((attempt + 1) / 2) * 0.13;
    const candidate = clampReachable({
      x: Math.max(-1.4, Math.min(1.4, desired.x + Math.cos(angle) * radius)),
      y: Math.max(Y_MIN, Math.min(Y_MAX, desired.y + Math.sin(angle) * radius)),
    }, previous, entry.time);
    if (!overlapsRecent(candidate, entry.time, placed)) return candidate;
  }
  return clampReachable(desired, previous, entry.time);
}

export function createSpatialBeatLayout(beats: readonly Beat[]): SpatialBeatPosition[] {
  const entries = beats
    .map((beat, index): LayoutEntry => ({
      index,
      time: getBeatHitTimeSec(beat),
      side: resolvedSide(beat, index),
      groupIndex: null,
    }))
    .sort((left, right) => left.time - right.time || left.index - right.index);
  markDenseGroups(entries);

  const positions: SpatialBeatPosition[] = new Array(beats.length);
  const previousBySide: Partial<Record<SaberSide, { x: number; y: number; time: number }>> = {};
  const placed: Array<{ x: number; y: number; time: number }> = [];
  const groupOrders = new Map<number, number>();

  for (const entry of entries) {
    const groupOrder = entry.groupIndex === null ? 0 : (groupOrders.get(entry.groupIndex) ?? 0);
    if (entry.groupIndex !== null) groupOrders.set(entry.groupIndex, groupOrder + 1);
    const previous = previousBySide[entry.side];
    const desired = desiredPosition(entry, groupOrder);
    const position = separatePosition(desired, entry, previous, placed);
    positions[entry.index] = { ...position, grouped: entry.groupIndex !== null };
    previousBySide[entry.side] = { ...position, time: entry.time };
    placed.push({ ...position, time: entry.time });
    while (placed.length && entry.time - placed[0]!.time > COLLISION_WINDOW_SEC) placed.shift();
  }
  return positions;
}
