import { setSetting } from '../core/settings.ts';
import { initAudio, resumeAudioContext, getAudioContext } from './audio.ts';

let metronomeActive = false;
let metronomeTimer: ReturnType<typeof setInterval> | null = null;
let metronomeBeat = 0;
let tapTimes: number[] = [];
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

/** Play a short test sound using the current audio offset */
export function playTestSound(): void {
  initAudio();
  resumeAudioContext();
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Play a short beep similar to a hit sound
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** Start the FL Studio-style metronome calibration */
export function startMetronomeCalibration(onComplete?: (offsetMs: number) => void): void {
  if (metronomeActive) return;
  initAudio();
  resumeAudioContext();
  const ctx = getAudioContext();
  if (!ctx) return;

  metronomeActive = true;
  metronomeBeat = 0;
  tapTimes = [];

  // 120 BPM = 500ms per beat
  const beatInterval = 500;
  const playClick = (accent: boolean) => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(accent ? 0.25 : 0.15, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  };

  // Pattern: tik, tik, tik, tik, TIK (4 soft + 1 accent)
  metronomeTimer = setInterval(() => {
    const isAccent = metronomeBeat % 5 === 4;
    playClick(isAccent);
    metronomeBeat++;
  }, beatInterval);

  // First click immediately
  playClick(true);

  // Listen for spacebar taps
  keydownHandler = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || !metronomeActive) return;
    e.preventDefault();
    tapTimes.push(performance.now());
    // Need at least 4 taps to calculate
    if (tapTimes.length >= 4) {
      stopMetronome();
      // Calculate average offset from tap times relative to beat times
      // The accent beat happens every 5 beats (2500ms), starting at t=0
      const offsets: number[] = [];
      for (const tapTime of tapTimes) {
        // Find nearest accent beat time
        const accentPeriod = 2500;
        const nearestAccent = Math.round(tapTime / accentPeriod) * accentPeriod;
        const offset = tapTime - nearestAccent;
        offsets.push(offset);
      }
      // Average offset, clamped to ±500ms
      const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
      const clampedOffset = Math.max(-500, Math.min(500, Math.round(avgOffset)));
      setSetting('audioOffsetMs', clampedOffset);
      onComplete?.(clampedOffset);
    }
  };
  window.addEventListener('keydown', keydownHandler);
}

/** Stop the metronome calibration */
export function stopMetronome(): void {
  if (metronomeTimer) {
    clearInterval(metronomeTimer);
    metronomeTimer = null;
  }
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  metronomeActive = false;
}

/** Check if metronome calibration is running */
export function isMetronomeActive(): boolean {
  return metronomeActive;
}
