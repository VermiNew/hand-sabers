/**
 * Creator metronome (#14) — a QOL helper that emits short click ticks at the
 * BPM currently entered in #bpmInput. Independent from audio-calibration.ts
 * (which measures latency); this one just helps the user feel the tempo while
 * placing beats. Uses the creator's shared AudioContext (state.audioCtx).
 * Ticks alternate between two pitches (down-beat brighter, off-beat softer)
 * so the user can track the measure without it getting monotonous.
 */
import { state } from './state.ts';
import { initAudioCtx } from './audio.ts';
import { t } from '../i18n/index.ts';

// Tunable constants
const DOWN_FREQ_HZ = 1500;  // bright down-beat
const OFF_FREQ_HZ = 900;    // softer off-beat
const CLICK_DUR_SEC = 0.028;
const CLICK_GAIN = 0.13;

let isRunning = false;
let tickTimer: ReturnType<typeof setTimeout> | null = null;
let nextTickTimeSec = 0;
let beatCounter = 0;

function currentBpm(): number {
  const raw = Number(state.map.meta.bpm);
  return Number.isFinite(raw) && raw >= 20 && raw <= 400 ? raw : 120;
}

/** Schedule one click of `freq` Hz to play at audio time `whenSec`. */
function scheduleClick(ctx: AudioContext, whenSec: number, freq: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  // Envelope: quick attack, fast decay to ~-50dB at CLICK_DUR_SEC.
  gain.gain.setValueAtTime(0.0001, whenSec);
  gain.gain.exponentialRampToValueAtTime(CLICK_GAIN, whenSec + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, whenSec + CLICK_DUR_SEC);
  osc.connect(gain).connect(ctx.destination);
  osc.start(whenSec);
  osc.stop(whenSec + CLICK_DUR_SEC + 0.01);
}

/** Recursive scheduler using setTimeout + lookahead (no setInterval drift). */
function scheduleNext(): void {
  if (!isRunning || !state.audioCtx) return;
  const ctx = state.audioCtx;
  const lookaheadSec = 0.1; // schedule ticks up to 100ms ahead
  const intervalSec = 60 / currentBpm();

  // Schedule any ticks that fall within the lookahead window.
  while (nextTickTimeSec < ctx.currentTime + lookaheadSec) {
    const isDownBeat = beatCounter % 4 === 0;
    scheduleClick(ctx, nextTickTimeSec, isDownBeat ? DOWN_FREQ_HZ : OFF_FREQ_HZ);
    nextTickTimeSec += intervalSec;
    beatCounter++;
  }
  tickTimer = setTimeout(scheduleNext, 25);
}

/** Sync the button's label, aria-pressed and title to the running state. */
function syncButton(): void {
  const btn = document.getElementById('btnMetronome');
  if (!btn) return;
  const label = btn.querySelector('.metro-text');
  const pressed = isRunning;
  btn.setAttribute('aria-pressed', String(pressed));
  if (label) label.textContent = pressed ? t('creator.metronomeOn') : t('creator.metronomeOff');
  btn.setAttribute('title', t(pressed ? 'creator.metronomeTitleOn' : 'creator.metronomeTitle'));
}

export function toggleMetronome(): void {
  isRunning ? stopMetronome() : startMetronome();
}

export function startMetronome(): void {
  if (isRunning) return;
  initAudioCtx();            // ensures state.audioCtx exists & resumed
  if (!state.audioCtx) return;
  if (state.audioCtx.state === 'suspended') void state.audioCtx.resume();
  isRunning = true;
  beatCounter = 0;
  nextTickTimeSec = state.audioCtx.currentTime + 0.05; // small delay for clean start
  scheduleNext();
  syncButton();
}

export function stopMetronome(): void {
  isRunning = false;
  if (tickTimer) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
  beatCounter = 0;
  syncButton();
}

export function isMetronomeRunning(): boolean {
  return isRunning;
}

export function bindMetronome(): void {
  document.getElementById('btnMetronome')?.addEventListener('click', () => {
    toggleMetronome();
  });
  // Stop the metronome if the BPM becomes invalid (e.g. user clears the field).
  const bpmInput = document.getElementById('bpmInput') as HTMLInputElement | null;
  bpmInput?.addEventListener('input', () => {
    const v = parseFloat(bpmInput.value);
    if (isRunning && (!Number.isFinite(v) || v < 20 || v > 400)) stopMetronome();
  });
  // Clean up on page hide so we don't leave oscillators scheduled.
  window.addEventListener('pagehide', stopMetronome);
  syncButton();
}
