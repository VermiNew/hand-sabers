import { THEME } from '../core/theme.ts';
import { getBeatHitTimeSec } from '../core/timing.ts';
import { getMusicFrequencyLevels } from './audio.ts';
import { THREE, scene } from './scene.ts';
import type { Beat, PerformanceProfile } from '../types/index.js';

interface MusicVisualizerFrame {
  active: boolean;
  beats: Beat[] | null;
  deltaSec: number;
  nowSec: number;
  profile: PerformanceProfile;
  songTimeSec: number;
}

const MAX_RING_COUNT = 11;
const RING_SPACING = 2.35;
const ringGeometry = new THREE.TorusGeometry(3.15, 0.022, 4, 48);
const rings: Array<THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>> = [];

for (let index = 0; index < MAX_RING_COUNT; index++) {
  const material = new THREE.MeshBasicMaterial({
    color: index % 2 === 0 ? THEME.left : THEME.right,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(ringGeometry, material);
  ring.position.set(0, 1.75, -2.5 - index * RING_SPACING);
  ring.scale.y = 0.66;
  ring.visible = false;
  ring.renderOrder = 1;
  scene.add(ring);
  rings.push(ring);
}

const RING_COUNTS: Record<string, number> = {
  lowest: 0,
  'very-low': 0,
  low: 3,
  medium: 5,
  high: 7,
  ultra: 9,
  maximum: 11,
};

let beatSource: Beat[] | null = null;
let beatTimes: number[] = [];
let nextBeatIndex = 0;
let lastSongTimeSec: number | null = null;
let beatPulse = 0;

function findNextBeatIndex(songTimeSec: number): number {
  let low = 0;
  let high = beatTimes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((beatTimes[middle] ?? 0) <= songTimeSec) low = middle + 1;
    else high = middle;
  }
  return low;
}

function syncBeatTimeline(beats: Beat[] | null, songTimeSec: number): void {
  if (!beats?.length) {
    beatSource = null;
    beatTimes = [];
    nextBeatIndex = 0;
    lastSongTimeSec = null;
    return;
  }

  if (beatSource !== beats || lastSongTimeSec === null || songTimeSec < lastSongTimeSec - 0.2) {
    beatSource = beats;
    beatTimes = beats.map(getBeatHitTimeSec).sort((left, right) => left - right);
    nextBeatIndex = findNextBeatIndex(songTimeSec);
    lastSongTimeSec = songTimeSec;
    return;
  }

  while (nextBeatIndex < beatTimes.length && (beatTimes[nextBeatIndex] ?? Infinity) <= songTimeSec) {
    beatPulse = Math.min(1.35, beatPulse + 0.72);
    nextBeatIndex++;
  }
  lastSongTimeSec = songTimeSec;
}

export function triggerMusicVisualizerBeat(): void {
  beatPulse = Math.min(1.35, beatPulse + 0.9);
}

export function resetMusicVisualizer(): void {
  beatSource = null;
  beatTimes = [];
  nextBeatIndex = 0;
  lastSongTimeSec = null;
  beatPulse = 0;
}

export function updateMusicVisualizer(frame: MusicVisualizerFrame): void {
  syncBeatTimeline(frame.beats, frame.songTimeSec);
  beatPulse *= Math.exp(-7.5 * Math.max(0, frame.deltaSec));

  const ringCount = frame.active ? RING_COUNTS[frame.profile.qualityMode] ?? 5 : 0;
  const levels = getMusicFrequencyLevels();
  for (let index = 0; index < rings.length; index++) {
    const ring = rings[index]!;
    const visible = index < ringCount;
    ring.visible = visible;
    if (!visible) continue;

    const depth = ringCount > 1 ? index / (ringCount - 1) : 0;
    const wave = 0.5 + Math.sin(frame.nowSec * 2.4 - index * 0.72) * 0.5;
    const localPulse = beatPulse * (0.62 + wave * 0.38);
    const scale = 1 + levels.bass * 0.1 + localPulse * 0.075;
    ring.scale.set(scale, (0.66 + levels.mid * 0.055) * scale, 1);
    ring.rotation.z = Math.sin(frame.nowSec * 0.38 + index * 0.55) * (0.018 + levels.treble * 0.04);
    ring.material.opacity = Math.min(0.82, 0.09 + levels.overall * 0.34 + localPulse * 0.42 + depth * 0.035);
  }
}
