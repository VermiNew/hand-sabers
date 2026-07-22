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

const MAX_PORTAL_COUNT = 6;
const PORTAL_SPACING = 2.15;
const portalGeometry = new THREE.TorusGeometry(2.35, 0.016, 3, 24);
const portalGlowGeometry = new THREE.TorusGeometry(2.35, 0.055, 3, 24);
const portalMaterial = new THREE.MeshBasicMaterial({
  color: THEME.white,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const portalGlowMaterial = new THREE.MeshBasicMaterial({
  color: THEME.white,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const portals = new THREE.InstancedMesh(portalGeometry, portalMaterial, MAX_PORTAL_COUNT);
const portalGlows = new THREE.InstancedMesh(portalGlowGeometry, portalGlowMaterial, MAX_PORTAL_COUNT);
const portalTransform = new THREE.Object3D();
const portalColor = new THREE.Color();
let portalLeftColor = -1;
let portalRightColor = -1;

for (const [mesh, renderOrder] of [[portalGlows, 0], [portals, 1]] as const) {
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
}

function syncPortalColors(): void {
  const left = getSaberColor('left');
  const right = getSaberColor('right');
  if (left === portalLeftColor && right === portalRightColor) return;
  portalLeftColor = left;
  portalRightColor = right;
  for (let index = 0; index < MAX_PORTAL_COUNT; index++) {
    portalColor.setHex(index % 2 === 0 ? left : right);
    portals.setColorAt(index, portalColor);
    portalGlows.setColorAt(index, portalColor);
  }
  if (portals.instanceColor) portals.instanceColor.needsUpdate = true;
  if (portalGlows.instanceColor) portalGlows.instanceColor.needsUpdate = true;
}

syncPortalColors();

const PORTAL_COUNTS: Record<string, number> = {
  lowest: 0,
  'very-low': 0,
  low: 1,
  medium: 3,
  high: 4,
  ultra: 5,
  maximum: 6,
  custom: 4,
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
let currentEffectiveMusicIntensity = 0;
let currentMusicEnergy = 0;
let currentBeatPulse = 0;

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
  const tierMultiplier = profile.qualityMode === 'custom'
    ? THREE.MathUtils.clamp(profile.arenaDetail, 0, 1.25)
    : TIER_INTENSITY[profile.qualityMode] ?? 1;
  return Math.max(0, Math.min(1.5, tierMultiplier * normalizedBass));
}

export function getCurrentMusicIntensity(): number {
  return currentEffectiveMusicIntensity;
}

export function getCurrentMusicEnergy(): number {
  return currentMusicEnergy;
}

export function getCurrentBeatPulse(): number {
  return currentBeatPulse;
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
  currentEffectiveMusicIntensity = 0;
  currentMusicEnergy = 0;
  currentBeatPulse = 0;
  portals.count = 0;
  portals.visible = false;
  portalGlows.count = 0;
  portalGlows.visible = false;
  portalMaterial.opacity = 0;
  portalGlowMaterial.opacity = 0;
}

export function updateMusicVisualizer(frame: MusicVisualizerFrame): void {
  const settings = getSettings();
  const enabled = frame.active && frame.profile.musicReactive && settings.musicReactiveEnabled;
  if (!enabled) {
    if (musicVisualsEnabled) resetMusicVisualizer();
    beatPulse = 0;
    portals.count = 0;
    portals.visible = false;
    portalGlows.count = 0;
    portalGlows.visible = false;
    portalMaterial.opacity = 0;
    portalGlowMaterial.opacity = 0;
    musicVisualsEnabled = false;
    currentEffectiveMusicIntensity = 0;
    currentMusicEnergy = 0;
    currentBeatPulse = 0;
    return;
  }
  musicVisualsEnabled = true;
  syncPortalColors();
  syncBeatTimeline(frame.beats, frame.songTimeSec);
  beatPulse *= Math.exp(-7.5 * Math.max(0, frame.deltaSec));

  const portalCount = frame.profile.qualityMode === 'custom'
    ? Math.max(0, Math.min(MAX_PORTAL_COUNT, Math.round(frame.profile.arenaDetail * 4.8)))
    : PORTAL_COUNTS[frame.profile.qualityMode] ?? 2;
  const levels = getMusicFrequencyLevels();
  const intensity = getEffectiveMusicIntensity(levels, frame.profile);
  currentEffectiveMusicIntensity = intensity;
  currentMusicEnergy = THREE.MathUtils.clamp(
    (levels.overall * 0.58 + levels.bass * 0.42) * intensity,
    0,
    1.5,
  );
  currentBeatPulse = THREE.MathUtils.clamp(beatPulse * intensity, 0, 1.5);
  const portalVisible = portalCount > 0 && intensity > 0.001;
  const readability = 1 - THREE.MathUtils.clamp(window.__gameplayVisualPressure ?? 0, 0, 1) * 0.42;
  portals.count = portalCount;
  portals.visible = portalVisible;
  portalGlows.count = portalCount;
  portalGlows.visible = portalVisible;
  portalMaterial.opacity = Math.min(0.5, (0.07 + levels.overall * 0.22 + beatPulse * 0.28) * intensity) * readability;
  portalGlowMaterial.opacity = Math.min(0.18, (0.025 + levels.bass * 0.07 + beatPulse * 0.095) * intensity) * readability;

  for (let index = 0; index < portalCount; index++) {
    const wave = 0.5 + Math.sin(frame.nowSec * 2.4 - index * 0.72) * 0.5;
    const localPulse = beatPulse * (0.62 + wave * 0.38);
    const scale = 1 + (levels.bass * 0.065 + localPulse * 0.05) * intensity;
    const depthDrift = Math.sin(frame.nowSec * 0.7 - index * 0.9) * 0.045 * intensity;
    portalTransform.position.set(0, 1.7, -6.5 - index * PORTAL_SPACING + depthDrift);
    portalTransform.scale.set(scale, (0.7 + levels.mid * 0.035 * intensity) * scale, 1);
    portalTransform.rotation.set(0, 0, Math.sin(frame.nowSec * 0.3 + index * 0.5) * (0.01 + levels.treble * 0.022) * intensity);
    portalTransform.updateMatrix();
    portals.setMatrixAt(index, portalTransform.matrix);
    portalGlows.setMatrixAt(index, portalTransform.matrix);
  }
  if (portalCount > 0) {
    portals.instanceMatrix.needsUpdate = true;
    portalGlows.instanceMatrix.needsUpdate = true;
  }
}
