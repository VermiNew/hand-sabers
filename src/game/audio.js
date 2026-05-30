import { getSettings } from '../core/settings.js';

let ctx = null;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  ensureAudioGraph();
  applyAudioSettings(getSettings());
  if (ctx.state === 'suspended') ctx.resume();
}

export function getAudioContext() { return ctx; }

// ── Globalny mixer ────────────────────────────────────────────────────────────
let masterGain = null;
let musicGain  = null;
let sfxGain    = null;

const SOUND_KEYS = new Set([
  'beatSoundVolume',
  'hitSoundVolume',
  'comboSoundVolume',
  'missSoundVolume',
  'bombSoundVolume',
  'milestoneSoundVolume',
]);

let soundVolumes = {
  beatSoundVolume: 0.65,
  hitSoundVolume: 0.85,
  comboSoundVolume: 0.55,
  missSoundVolume: 0.75,
  bombSoundVolume: 0.8,
  milestoneSoundVolume: 0.7,
};

function clamp01(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function ensureAudioGraph() {
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

function setGain(gainNode, value, fallback = 1) {
  if (!ctx || !gainNode) return;
  gainNode.gain.setTargetAtTime(clamp01(value, fallback), ctx.currentTime, 0.05);
}

export function applyAudioSettings(settings = getSettings()) {
  if (!ctx) return;
  ensureAudioGraph();
  setGain(masterGain, settings.volume, 0.8);
  setGain(musicGain, settings.musicVolume, 1);
  setGain(sfxGain, settings.sfxVolume, 1);
  for (const key of SOUND_KEYS) soundVolumes[key] = clamp01(settings[key], soundVolumes[key] ?? 1);
}

export function setVolume(v) {
  ensureAudioGraph();
  setGain(masterGain, v, 0.8);
}

export function setMusicVolume(v) {
  ensureAudioGraph();
  setGain(musicGain, v, 1);
}

export function setSfxVolume(v) {
  ensureAudioGraph();
  setGain(sfxGain, v, 1);
}

export function setSoundVolume(key, v) {
  if (!SOUND_KEYS.has(key)) return;
  soundVolumes[key] = clamp01(v, soundVolumes[key] ?? 1);
}

function getSoundVolume(key, fallback = 1) {
  const settings = getSettings();
  const value = settings[key] ?? soundVolumes[key] ?? fallback;
  return clamp01(value, fallback);
}

function connectSfx(gain) {
  ensureAudioGraph();
  gain.connect(sfxGain || masterGain || ctx.destination);
}

function rampGain(gain, now, start, end, duration, soundKey) {
  const vol = getSoundVolume(soundKey, 1);
  if (vol <= 0.0001) {
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    return;
  }
  const safeStart = Math.max(0.0001, start * vol);
  const safeEnd   = Math.max(0.0001, end * vol);
  gain.gain.setValueAtTime(safeStart, now);
  gain.gain.exponentialRampToValueAtTime(safeEnd, now + duration);
}

export function playBeat() {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
  rampGain(gain, now, 0.05, 0.01, 0.15, 'beatSoundVolume');
  osc.connect(gain); connectSfx(gain);
  osc.start(now); osc.stop(now + 0.15);
}

export function playHit(combo) {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;

  const oscHit = ctx.createOscillator();
  const gainHit = ctx.createGain();
  oscHit.type = 'sawtooth';
  oscHit.frequency.setValueAtTime(250, now);
  oscHit.frequency.exponentialRampToValueAtTime(50, now + 0.15);
  rampGain(gainHit, now, 0.33, 0.01, 0.15, 'hitSoundVolume');
  oscHit.connect(gainHit); connectSfx(gainHit);
  oscHit.start(now); oscHit.stop(now + 0.15);

  const oscCombo = ctx.createOscillator();
  const gainCombo = ctx.createGain();
  oscCombo.type = 'sine';
  oscCombo.frequency.setValueAtTime(400 + Math.min(combo * 20, 800), now);
  rampGain(gainCombo, now, 0.5, 0.01, 0.3, 'comboSoundVolume');
  oscCombo.connect(gainCombo); connectSfx(gainCombo);
  oscCombo.start(now); oscCombo.stop(now + 0.3);
}

export function playMiss() {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.22);
  rampGain(gain, now, 0.18, 0.001, 0.22, 'missSoundVolume');
  osc.connect(gain); connectSfx(gain);
  osc.start(now); osc.stop(now + 0.22);
}

export function playBomb() {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  rampGain(gain, now, 0.4, 0.001, 0.18, 'bombSoundVolume');
  src.connect(gain); connectSfx(gain);
  src.start(now);
}

// ── Odtwarzanie audio z mapy ──────────────────────────────────────────────────
let mapSource    = null;
let mapBuffer    = null;
let mapStartedAt = 0;
let mapOffset    = 0;
let mapPlaying   = false;

export async function loadMapAudio(arrayBuffer) {
  if (!ctx || !arrayBuffer) return;
  // decodeAudioData może odłączyć ArrayBuffer w części przeglądarek,
  // więc zawsze dekodujemy kopię i zostawiamy oryginał dla ZIP/local cache.
  const copy = arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer;
  mapBuffer = await ctx.decodeAudioData(copy);
}

export function hasMapAudio() {
  return !!mapBuffer;
}

export function clearMapAudio() {
  stopMapAudio();
  mapBuffer = null;
  mapOffset = 0;
}

export function startMapAudio(offsetSec = 0, delaySec = 0) {
  if (!ctx || !mapBuffer) return;
  ensureAudioGraph();
  stopMapAudio();
  mapSource = ctx.createBufferSource();
  mapSource.buffer = mapBuffer;
  mapSource.connect(musicGain || masterGain || ctx.destination);

  const safeOffset = Math.max(0, offsetSec);
  const safeDelay  = Math.max(0, delaySec);
  mapOffset    = safeOffset;
  mapStartedAt = ctx.currentTime + safeDelay;
  mapSource.start(mapStartedAt, safeOffset);
  mapPlaying = true;
}

export function stopMapAudio() {
  if (mapSource) {
    try { mapSource.stop(); } catch {}
    mapSource = null;
  }
  mapPlaying = false;
}

export function pauseMapAudio() {
  if (!mapPlaying) return;
  mapOffset = getMapTime();
  stopMapAudio();
}

export function resumeMapAudio() {
  if (mapPlaying) return;
  if (mapOffset < 0) startMapAudio(0, -mapOffset);
  else startMapAudio(mapOffset);
}

export function getMapTime() {
  if (!ctx || !mapPlaying) return mapOffset;
  return mapOffset + (ctx.currentTime - mapStartedAt);
}

export function getMapDuration() {
  return mapBuffer?.duration ?? 0;
}

// ── Combo milestone sound ─────────────────────────────────────────────────────
export function playMilestone(combo) {
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
    osc.stop(now  + i * 0.07 + 0.22);
  }
}
