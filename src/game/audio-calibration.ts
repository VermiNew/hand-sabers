import { initAudio, resumeAudioContext, getAudioContext } from './audio.ts';
import { t } from '../i18n/index.ts';
import {
  BEAT_INTERVAL,
  MIN_TAPS,
  WARMUP_TAPS,
  computeCalibration,
} from './calibration-math.ts';
import type { CalibrationResult } from './calibration-math.ts';

let metronomeActive = false;
let metronomeTimer: ReturnType<typeof setTimeout> | null = null;
const visualTimers = new Set<ReturnType<typeof setTimeout>>();
let metronomeBeat = 0;
let tapTimes: number[] = [];
let startTime = 0;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let visualEl: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let counterEl: HTMLElement | null = null;
let actionsEl: HTMLElement | null = null;
let onCompleteCb: ((result: CalibrationResult) => void) | null = null;
let onStateChangeCb: ((active: boolean) => void) | null = null;
let reducedMotion = false;

function formatText(key: string, replacements?: Record<string, string>): string {
  let text = t(key);
  if (replacements) {
    for (const [name, value] of Object.entries(replacements)) {
      text = text.replace(`{{${name}}}`, value);
    }
  }
  return text;
}

function scheduleVisualTask(callback: () => void, delayMs: number): void {
  let timer: ReturnType<typeof setTimeout>;
  timer = setTimeout(() => {
    visualTimers.delete(timer);
    callback();
  }, delayMs);
  visualTimers.add(timer);
}

function clearVisualTasks(): void {
  for (const timer of visualTimers) clearTimeout(timer);
  visualTimers.clear();
}

function resetVisualState(): void {
  if (visualEl) {
    visualEl.style.transform = '';
    visualEl.style.borderColor = '';
    visualEl.style.boxShadow = '';
    visualEl.style.background = '';
  }
  document.querySelectorAll<HTMLElement>('#metronomeOverlay .metronome-dot.is-active').forEach(dot => {
    dot.classList.remove('is-active');
  });
}

/** Play a short test sound using the current audio offset */
export function playTestSound(): void {
  initAudio();
  resumeAudioContext();
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
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

function createVisualOverlay(): { visual: HTMLElement; status: HTMLElement; counter: HTMLElement; actions: HTMLElement } {
  document.getElementById('metronomeOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'metronomeOverlay';
  overlay.className = 'metronome-overlay';

  const title = document.createElement('div');
  title.className = 'metronome-title';
  title.textContent = t('metronome.title');
  overlay.append(title);

  const visualWrap = document.createElement('div');
  visualWrap.className = 'metronome-visual-wrap';

  const visual = document.createElement('div');
  visual.id = 'metronomeVisual';
  visual.className = 'metronome-visual';
  visualWrap.append(visual);

  const dotsRow = document.createElement('div');
  dotsRow.className = 'metronome-dots';
  for (let i = 0; i < 5; i++) {
    const dot = document.createElement('div');
    dot.className = 'metronome-dot' + (i === 0 ? ' is-accent-pos' : '');
    dot.dataset['beat'] = String(i);
    dotsRow.append(dot);
  }
  visualWrap.append(dotsRow);
  overlay.append(visualWrap);

  const status = document.createElement('div');
  status.id = 'metronomeStatus';
  status.className = 'metronome-status';
  status.textContent = t('metronome.tapHint');
  overlay.append(status);

  const counter = document.createElement('div');
  counter.id = 'metronomeCounter';
  counter.className = 'metronome-counter';
  counter.textContent = formatText('metronome.warmupProgress', {
    collected: '0',
    needed: String(WARMUP_TAPS),
  });
  overlay.append(counter);

  const actions = document.createElement('div');
  actions.className = 'metronome-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'metronome-cancel';
  cancelBtn.textContent = t('metronome.cancel');
  cancelBtn.addEventListener('click', () => stopMetronome());
  actions.append(cancelBtn);
  overlay.append(actions);

  document.body.append(overlay);
  return { visual, status, counter, actions };
}

function removeVisualOverlay(): void {
  clearVisualTasks();
  resetVisualState();
  document.getElementById('metronomeOverlay')?.remove();
  visualEl = null;
  statusEl = null;
  counterEl = null;
  actionsEl = null;
}

function pulseVisual(accent: boolean, beatInPattern: number): void {
  if (!visualEl) return;

  const overlay = document.getElementById('metronomeOverlay');
  if (overlay) {
    const dots = overlay.querySelectorAll<HTMLElement>('.metronome-dot');
    dots.forEach(dot => {
      const isCurrent = Number(dot.dataset['beat']) === beatInPattern;
      dot.classList.toggle('is-active', isCurrent);
    });
  }

  if (reducedMotion) return;

  const color = accent ? '#36f2a1' : '#2f7cff';
  const shadow = accent ? '0 0 40px rgba(54,242,161,0.6)' : '0 0 24px rgba(47,124,255,0.4)';
  visualEl.style.transform = accent ? 'scale(1.2)' : 'scale(1.08)';
  visualEl.style.borderColor = color;
  visualEl.style.boxShadow = shadow;
  visualEl.style.background = accent ? 'rgba(54,242,161,0.15)' : 'rgba(47,124,255,0.12)';
  scheduleVisualTask(() => {
    if (visualEl) {
      visualEl.style.transform = 'scale(1)';
      visualEl.style.borderColor = '';
      visualEl.style.boxShadow = '';
      visualEl.style.background = '';
    }
  }, 100);
}

function updateStatus(key: string, replacements?: Record<string, string>): void {
  if (!statusEl) return;
  statusEl.textContent = formatText(key, replacements);
}

function updateCounter(): void {
  if (!counterEl) return;
  if (tapTimes.length < WARMUP_TAPS) {
    counterEl.textContent = formatText('metronome.warmupProgress', {
      collected: String(tapTimes.length),
      needed: String(WARMUP_TAPS),
    });
    return;
  }
  counterEl.textContent = formatText('metronome.measurementProgress', {
    collected: String(tapTimes.length - WARMUP_TAPS),
    needed: String(MIN_TAPS),
  });
}

function createResultButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function showResultActions(
  result: CalibrationResult,
  onApply: ((result: CalibrationResult) => void) | null,
  onRetry: () => void,
): void {
  if (!actionsEl) return;
  actionsEl.replaceChildren();

  const apply = () => {
    onApply?.(result);
    removeVisualOverlay();
  };
  actionsEl.append(createResultButton(
    t(result.stable ? 'metronome.apply' : 'metronome.applyAnyway'),
    'metronome-action metronome-apply',
    apply,
  ));
  actionsEl.append(createResultButton(t('metronome.retry'), 'metronome-action metronome-retry', onRetry));
  actionsEl.append(createResultButton(t('metronome.close'), 'metronome-cancel', removeVisualOverlay));
}

/** Start the FL Studio-style metronome calibration */
export function startMetronomeCalibration(
  onComplete?: (result: CalibrationResult) => void,
  onStateChange?: (active: boolean) => void,
): boolean {
  if (metronomeActive) return false;
  initAudio();
  resumeAudioContext();
  const ctx = getAudioContext();
  if (!ctx) return false;

  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  metronomeActive = true;
  metronomeBeat = 0;
  tapTimes = [];
  startTime = performance.now();
  onCompleteCb = onComplete ?? null;
  onStateChangeCb = onStateChange ?? null;

  const { visual, status, counter, actions } = createVisualOverlay();
  visualEl = visual;
  statusEl = status;
  counterEl = counter;
  actionsEl = actions;
  onStateChangeCb?.(true);

  const playClick = (accent: boolean, audioTime: number, beatInPattern: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0, audioTime);
    gain.gain.linearRampToValueAtTime(accent ? 0.25 : 0.15, audioTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, audioTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(audioTime);
    osc.stop(audioTime + 0.05);

    // Sync visual pulse with audio click
    const delayMs = (audioTime - ctx.currentTime) * 1000;
    if (delayMs <= 0) {
      pulseVisual(accent, beatInPattern);
    } else {
      scheduleVisualTask(() => pulseVisual(accent, beatInPattern), delayMs);
    }
  };

  function scheduleNextBeat(): void {
    if (!metronomeActive || !ctx) return;

    const beatTimePerf = startTime + metronomeBeat * BEAT_INTERVAL;
    const delay = beatTimePerf - performance.now();

    if (delay > 200) {
      metronomeTimer = setTimeout(scheduleNextBeat, delay - 100);
      return;
    }

    if (delay > 0) {
      metronomeTimer = setTimeout(() => {
        if (!metronomeActive) return;
        const beatInPattern = metronomeBeat % 5;
        const isAccent = beatInPattern === 0;
        const audioTime = ctx.currentTime + 0.001;
        playClick(isAccent, audioTime, beatInPattern);
        metronomeBeat++;
        scheduleNextBeat();
      }, delay);
    } else {
      metronomeBeat++;
      scheduleNextBeat();
    }
  }

  // First beat immediately (accent)
  playClick(true, ctx.currentTime + 0.001, 0);
  metronomeBeat = 1;
  scheduleNextBeat();

  keydownHandler = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || !metronomeActive) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.tagName === 'BUTTON')) {
      return;
    }
    e.preventDefault();
    const tapTime = performance.now();
    tapTimes.push(tapTime);
    updateCounter();

    if (visualEl && !reducedMotion) {
      visualEl.style.transform = 'scale(1.35)';
      scheduleVisualTask(() => { if (visualEl) visualEl.style.transform = 'scale(1)'; }, 80);
    }

    const collected = tapTimes.length - WARMUP_TAPS;

    if (tapTimes.length < WARMUP_TAPS) {
      updateStatus('metronome.warmup');
    } else if (collected < MIN_TAPS) {
      updateStatus('metronome.collecting', { collected: String(collected), needed: String(MIN_TAPS) });
    } else {
      const result = computeCalibration(tapTimes, startTime);
      if (result.stable) {
        updateStatus('metronome.stable', {
          ms: String(result.offsetMs),
          spread: String(result.spread),
        });
      } else {
        updateStatus('metronome.unstable', { spread: String(result.spread) });
      }
      if (counterEl) {
        counterEl.textContent = formatText('metronome.resultDetails', {
          spread: String(result.spread),
          taps: String(result.taps),
          needed: String(MIN_TAPS),
        });
      }
      const complete = onCompleteCb;
      const stateChange = onStateChangeCb;
      onCompleteCb = null;
      stopMetronome({ keepOverlay: true });
      showResultActions(result, complete, () => {
        removeVisualOverlay();
        startMetronomeCalibration(complete ?? undefined, stateChange ?? undefined);
      });
    }
  };
  window.addEventListener('keydown', keydownHandler);
  return true;
}

/** Stop the metronome calibration */
export function stopMetronome({ keepOverlay = false }: { keepOverlay?: boolean } = {}): void {
  if (metronomeTimer) {
    clearTimeout(metronomeTimer);
    metronomeTimer = null;
  }
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  metronomeActive = false;
  clearVisualTasks();
  resetVisualState();

  if (!keepOverlay) {
    removeVisualOverlay();
  }

  if (!keepOverlay) {
    onCompleteCb = null;
    visualEl = null;
    statusEl = null;
    counterEl = null;
    actionsEl = null;
  }
  const stateChange = onStateChangeCb;
  onStateChangeCb = null;
  stateChange?.(false);
}

/** Check if metronome calibration is running */
export function isMetronomeActive(): boolean {
  return metronomeActive;
}
