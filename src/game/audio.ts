import { getSettings } from '../core/settings.ts';
import type { Settings } from '../types/index.js';

type AudioContextConstructor = new () => AudioContext;

interface AudioWindow extends Window {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

const audioWindow = window as AudioWindow;

let ctx: AudioContext | null = null;

export function initAudio(): void {
  if (!ctx) {
    const AC = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  ensureAudioGraph();
  applyAudioSettings(getSettings());
  if (ctx.state === 'suspended') void ctx.resume();
}

export function getAudioContext(): AudioContext | null { return ctx; }

// ── Globalny mixer ────────────────────────────────────────────────────────────
let masterGain: GainNode | null = null;
let musicGain:  GainNode | null = null;
let sfxGain:    GainNode | null = null;

const SOUND_KEYS = [
  'beatSoundVolume',
  'hitSoundVolume',
  'comboSoundVolume',
  'missSoundVolume',
  'bombSoundVolume',
  'milestoneSoundVolume',
] as const;

type SoundVolumeKey = typeof SOUND_KEYS[number];

const SOUND_KEY_SET = new Set<string>(SOUND_KEYS);

let soundVolumes: Record<SoundVolumeKey, number> = {
  beatSoundVolume:      0.65,
  hitSoundVolume:       0.85,
  comboSoundVolume:     0.55,
  missSoundVolume:      0.75,
  bombSoundVolume:      0.8,
  milestoneSoundVolume: 0.7,
};

function clamp01(value: unknown, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function ensureAudioGraph(): void {
  if (!ctx) return;
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.connect(masterGain);
  }
  if (!sfxGain) {
    sfxGain = ctx.createGain();
    sfxGain.connect(masterGain);
  }
}

function setGain(gainNode: GainNode | null, value: unknown, fallback = 1): void {
  if (!ctx || !gainNode) return;
  gainNode.gain.setTargetAtTime(clamp01(value, fallback), ctx.currentTime, 0.05);
}

export function applyAudioSettings(settings: Settings = getSettings()): void {
  if (!ctx) return;
  ensureAudioGraph();
  setGain(masterGain, settings.volume, 0.8);
  setGain(musicGain, settings.musicVolume, 1);
  setGain(sfxGain, settings.sfxVolume, 1);
  for (const key of SOUND_KEYS) soundVolumes[key] = clamp01(settings[key], soundVolumes[key] ?? 1);
}

export function setVolume(v: unknown): void {
  ensureAudioGraph();
  setGain(masterGain, v, 0.8);
}

export function setMusicVolume(v: unknown): void {
  ensureAudioGraph();
  setGain(musicGain, v, 1);
}

export function setSfxVolume(v: unknown): void {
  ensureAudioGraph();
  setGain(sfxGain, v, 1);
}

export function setSoundVolume(key: string, v: unknown): void {
  if (!SOUND_KEY_SET.has(key)) return;
  soundVolumes[key as SoundVolumeKey] = clamp01(v, soundVolumes[key as SoundVolumeKey] ?? 1);
}

function getSoundVolume(key: SoundVolumeKey, fallback = 1): number {
  const settings = getSettings();
  const value = settings[key] ?? soundVolumes[key] ?? fallback;
  return clamp01(value, fallback);
}

function connectSfx(gain: GainNode): void {
  ensureAudioGraph();
  if (!ctx) return;
  gain.connect(sfxGain ?? masterGain ?? ctx.destination);
}

function rampGain(
  gain: GainNode,
  now: number,
  start: number,
  end: number,
  duration: number,
  soundKey: SoundVolumeKey,
): void {
  const vol = getSoundVolume(soundKey, 1);
  if (vol <= 0.0001) {
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    return;
  }
  gain.gain.setValueAtTime(Math.max(0.0001, start * vol), now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, end * vol), now + duration);
}

export function playBeat(): void {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
  rampGain(gain, now, 0.05, 0.01, 0.15, 'beatSoundVolume');
  osc.connect(gain); connectSfx(gain);
  osc.start(now); osc.stop(now + 0.15);
}

export function playHit(combo: number): void {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;

  const oscHit  = ctx.createOscillator();
  const gainHit = ctx.createGain();
  oscHit.type = 'sawtooth';
  oscHit.frequency.setValueAtTime(250, now);
  oscHit.frequency.exponentialRampToValueAtTime(50, now + 0.15);
  rampGain(gainHit, now, 0.33, 0.01, 0.15, 'hitSoundVolume');
  oscHit.connect(gainHit); connectSfx(gainHit);
  oscHit.start(now); oscHit.stop(now + 0.15);

  const oscCombo  = ctx.createOscillator();
  const gainCombo = ctx.createGain();
  oscCombo.type = 'sine';
  oscCombo.frequency.setValueAtTime(400 + Math.min(combo * 20, 800), now);
  rampGain(gainCombo, now, 0.5, 0.01, 0.3, 'comboSoundVolume');
  oscCombo.connect(gainCombo); connectSfx(gainCombo);
  oscCombo.start(now); oscCombo.stop(now + 0.3);
}

export function playMiss(): void {
  if (!ctx) return;
  const now  = ctx.currentTime + 0.02;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.22);
  rampGain(gain, now, 0.18, 0.001, 0.22, 'missSoundVolume');
  osc.connect(gain); connectSfx(gain);
  osc.start(now); osc.stop(now + 0.22);
}

export function playBomb(): void {
  if (!ctx) return;
  const now  = ctx.currentTime + 0.02;
  const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  rampGain(gain, now, 0.4, 0.001, 0.18, 'bombSoundVolume');
  src.connect(gain); connectSfx(gain);
  src.start(now);
}

// ── Odtwarzanie audio z mapy ──────────────────────────────────────────────────
let mapSource:    AudioBufferSourceNode | null = null;
let mapBuffer:    AudioBuffer | null = null;
let mapStartedAt = 0;
let mapOffset    = 0;
let mapPlaying   = false;

export async function loadMapAudio(arrayBuffer: ArrayBuffer): Promise<void> {
  if (!ctx || !arrayBuffer) return;
  // decodeAudioData może odłączyć ArrayBuffer w części przeglądarek,
  // więc zawsze dekodujemy kopię i zostawiamy oryginał dla ZIP/local cache.
  const copy = arrayBuffer.slice(0);
  mapBuffer = await ctx.decodeAudioData(copy);
}

export function hasMapAudio(): boolean {
  return mapBuffer !== null;
}

export function clearMapAudio(): void {
  stopMapAudio();
  mapBuffer = null;
  mapOffset = 0;
}

export function startMapAudio(offsetSec = 0, delaySec = 0): void {
  if (!ctx || !mapBuffer) return;
  ensureAudioGraph();
  stopMapAudio();
  mapSource = ctx.createBufferSource();
  mapSource.buffer = mapBuffer;
  mapSource.connect(musicGain ?? masterGain ?? ctx.destination);

  const safeOffset = Math.max(0, offsetSec);
  const safeDelay  = Math.max(0, delaySec);
  mapOffset    = safeOffset;
  mapStartedAt = ctx.currentTime + safeDelay;
  mapSource.start(mapStartedAt, safeOffset);
  mapPlaying = true;
}

export function stopMapAudio(): void {
  if (mapSource) {
    try { mapSource.stop(); } catch { /* already stopped */ }
    mapSource = null;
  }
  mapPlaying = false;
}

export function pauseMapAudio(): void {
  if (!mapPlaying) return;
  mapOffset = getMapTime();
  stopMapAudio();
}

export function getMapTime(): number {
  if (!ctx || !mapPlaying) return mapOffset;
  return mapOffset + (ctx.currentTime - mapStartedAt);
}

export function getMapDuration(): number {
  return mapBuffer?.duration ?? 0;
}

// ── Combo milestone sound ─────────────────────────────────────────────────────
export function playMilestone(combo: number): void {
  if (!ctx) return;
  const now  = ctx.currentTime + 0.02;
  const freq = combo >= 50 ? 1200 : combo >= 25 ? 900 : 660;

  for (let i = 0; i < 3; i++) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * (1 + i * 0.25), now + i * 0.07);
    osc.frequency.exponentialRampToValueAtTime(freq * (1 + i * 0.25) * 1.04, now + i * 0.07 + 0.12);
    rampGain(gain, now + i * 0.07, 0.28, 0.001, 0.22, 'milestoneSoundVolume');
    osc.connect(gain);
    connectSfx(gain);
    osc.start(now + i * 0.07);
    osc.stop(now + i * 0.07 + 0.22);
  }
}
