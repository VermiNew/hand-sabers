import { THEME } from '../core/theme.ts';
import { getSettings } from '../core/settings.ts';
import { getBeatHitTimeSec } from '../core/timing.ts';
import { getMusicFrequencyLevels } from './audio.ts';
import { getSaberColor, THREE, scene } from './scene.ts';
import type { MusicFrequencyLevels } from './audio.ts';
import type { Beat, PerformanceProfile } from '../types/index.js';

interface MusicVisualizerFrame {
  active: boolean;
  beats: Beat[] | null;
  deltaSec: number;
  nowSec: number;
  profile: PerformanceProfile;
  songTimeSec: number;
}

const MAX_PORTAL_COUNT = 5;
const PORTAL_SPACING = 3.5;
const portalGeometry = new THREE.TorusGeometry(2.35, 0.015, 3, 24);
const portalMaterial = new THREE.MeshBasicMaterial({
  color: THEME.white,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const portals = new THREE.InstancedMesh(portalGeometry, portalMaterial, MAX_PORTAL_COUNT);
const portalTransform = new THREE.Object3D();
const portalColor = new THREE.Color();
let portalLeftColor = -1;
let portalRightColor = -1;

portals.count = 0;
portals.visible = false;
portals.frustumCulled = false;
portals.renderOrder = 1;
portals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(portals);

function syncPortalColors(): void {
  const left = getSaberColor('left');
  const right = getSaberColor('right');
  if (left === portalLeftColor && right === portalRightColor) return;
  portalLeftColor = left;
  portalRightColor = right;
  for (let index = 0; index < MAX_PORTAL_COUNT; index++) {
    portalColor.setHex(index % 2 === 0 ? left : right);
    portals.setColorAt(index, portalColor);
  }
  if (portals.instanceColor) portals.instanceColor.needsUpdate = true;
}

syncPortalColors();

const PORTAL_COUNTS: Record<string, number> = {
  lowest: 0,
  'very-low': 0,
  low: 1,
  medium: 2,
  high: 3,
  ultra: 4,
  maximum: 5,
  custom: 3,
};

const TIER_INTENSITY: Record<string, number> = {
  lowest: 0,
  'very-low': 0,
  low: 0,
  medium: 0.7,
  high: 1,
  ultra: 1.2,
  maximum: 1.35,
  custom: 1,
};

let beatSource: Beat[] | null = null;
let beatTimes: number[] = [];
let nextBeatIndex = 0;
let lastSongTimeSec: number | null = null;
let beatPulse = 0;
let runningPeakBass = 0.4;
let musicVisualsEnabled = false;

export function getEffectiveMusicIntensity(
  energy: MusicFrequencyLevels,
  profile: PerformanceProfile,
): number {
  const settings = getSettings();
  if (settings.musicReactiveIntensityMode === 'manual') {
    return Math.max(0, Math.min(1.5, settings.musicReactiveIntensity ?? 1));
  }
  runningPeakBass = Math.max(energy.bass, runningPeakBass * 0.999);
  const normalizedBass = runningPeakBass > 0.05 ? Math.min(1.4, 1 / runningPeakBass) : 1;
  const tierMultiplier = TIER_INTENSITY[profile.qualityMode] ?? 1;
  return Math.max(0, Math.min(1.5, tierMultiplier * normalizedBass));
}

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
  runningPeakBass = 0.4;
  musicVisualsEnabled = false;
  portals.count = 0;
  portals.visible = false;
  portalMaterial.opacity = 0;
}

export function updateMusicVisualizer(frame: MusicVisualizerFrame): void {
  const settings = getSettings();
  const enabled = frame.active && frame.profile.musicReactive && settings.musicReactiveEnabled;
  if (!enabled) {
    if (musicVisualsEnabled) resetMusicVisualizer();
    beatPulse = 0;
    portals.count = 0;
    portals.visible = false;
    portalMaterial.opacity = 0;
    musicVisualsEnabled = false;
    return;
  }
  musicVisualsEnabled = true;
  syncPortalColors();
  syncBeatTimeline(frame.beats, frame.songTimeSec);
  beatPulse *= Math.exp(-7.5 * Math.max(0, frame.deltaSec));

  const portalCount = PORTAL_COUNTS[frame.profile.qualityMode] ?? 2;
  const levels = getMusicFrequencyLevels();
  const intensity = getEffectiveMusicIntensity(levels, frame.profile);
  portals.count = portalCount;
  portals.visible = portalCount > 0 && intensity > 0.001;
  portalMaterial.opacity = Math.min(0.42, (0.065 + levels.overall * 0.2 + beatPulse * 0.24) * intensity);

  for (let index = 0; index < portalCount; index++) {
    const wave = 0.5 + Math.sin(frame.nowSec * 2.4 - index * 0.72) * 0.5;
    const localPulse = beatPulse * (0.62 + wave * 0.38);
    const scale = 1 + (levels.bass * 0.055 + localPulse * 0.035) * intensity;
    portalTransform.position.set(0, 1.7, -6.5 - index * PORTAL_SPACING);
    portalTransform.scale.set(scale, (0.7 + levels.mid * 0.025 * intensity) * scale, 1);
    portalTransform.rotation.set(0, 0, Math.sin(frame.nowSec * 0.3 + index * 0.5) * (0.01 + levels.treble * 0.018) * intensity);
    portalTransform.updateMatrix();
    portals.setMatrixAt(index, portalTransform.matrix);
  }
  if (portalCount > 0) portals.instanceMatrix.needsUpdate = true;
}
