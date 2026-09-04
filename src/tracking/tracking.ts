import { state, S } from '../core/state.ts';
import { ui, setLoadingProgress, showCameraError, setCalibFeedback } from '../ui/ui.ts';
import { getSettings } from '../core/settings.ts';
import { getDetectIntervalMs, getPerformanceProfile } from '../core/performance.ts';
import { t } from '../i18n/index.ts';
import { isRemoteTrackingConnected } from '../remote/host-pairing.ts';
import type { Settings } from '../types/index.js';
import { decodeRemoteLandmarks, sendRealtimeLandmarks, sendRealtimePose } from './realtime.ts';
import type { DetectResult, Landmark, WorkerResult } from './realtime.ts';
import { drawHandLandmarks, HAND_CONNECTIONS } from './landmark-canvas.ts';
import { updateCalibrationSourceUI } from './calibration-source-ui.ts';
import { loadHandLandmarker } from './mediapipe-loader.ts';
import { createAutoFlipDetector } from './auto-flip.ts';
import { CALIB_STEPS, renderCalibrationStep } from './calibration-step-ui.ts';
export type { CalibStep } from './calibration-step-ui.ts';
export { CALIB_STEPS } from './calibration-step-ui.ts';

const URL_PARAMS = new URLSearchParams(location.search);
function isDebugVisuals(): boolean {
  return URL_PARAMS.has('dev') || URL_PARAMS.has('testing') || Boolean(getSettings().developerMode);
}
declare global {
  interface Window {
    __lastDetectMs?:     number;
    __lastHandConf?:     number;
    __filteredHandCount?: number;
    __rawHandCount?:     number;
    __remoteTrackingApplyMs?: number;
  }
}

export interface CalibData {
  minX: number; maxX: number;
  minY: number; maxY: number;
  rangeX: number; rangeY: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handLandmarker: any = null;
let videoEl:        HTMLVideoElement | null = null;
let trackCanvas:    HTMLCanvasElement | null = null;
let trackCtx:       CanvasRenderingContext2D | null = null;
let handsPauseCanvas: HTMLCanvasElement | null = null;
let handsPauseCtx:    CanvasRenderingContext2D | null = null;
let worker:         Worker | null = null;
let lastDetectMs    = 0;
let autoAdvance:    () => void = () => {};
let onAutoFlipSuggestion: (info: { flipCamera: boolean; confidence: number }) => void = () => {};
let saberTargetSetter: ((side: 'left' | 'right', pos: { x: number; y: number; z: number }) => void) | null = null;

const DEFAULT_CALIB: CalibData = { minX: 0.1, maxX: 0.9, minY: 0.1, maxY: 0.9, rangeX: 3.2, rangeY: 3.0 };
const calibData: CalibData = { ...DEFAULT_CALIB };
let calibPoints:        Landmark[] = [];
let latestLandmarks:    Landmark[][] = [];
let calibAutoTimer:  ReturnType<typeof setTimeout> | null = null;
let calibAutoScheduled = false;
let calibFeedLoop:   ReturnType<typeof setTimeout> | null = null;
let trackingActive           = false;
let cameraStream:            MediaStream | null = null;
const autoFlipDetector = createAutoFlipDetector();
let trackingProfile          = getPerformanceProfile(getSettings());
let dynamicDetectIntervalMs  = getDetectIntervalMs(trackingProfile);
let trackingSource: 'camera' | 'remote' | null = null;

function updateCalibrationSourceIndicator(remoteConnected = isRemoteTrackingConnected()): void {
  updateCalibrationSourceUI(trackingSource, remoteConnected);
}

export function setCalibAutoAdvanceHandler(fn: () => void): void { autoAdvance = fn; }
export function setAutoFlipSuggestionHandler(fn: ((info: { flipCamera: boolean; confidence: number }) => void) | null): void {
  onAutoFlipSuggestion = typeof fn === 'function' ? fn : () => {};
}
export function setSaberTargetSetter(fn: (side: 'left' | 'right', pos: { x: number; y: number; z: number }) => void): void {
  saberTargetSetter = typeof fn === 'function' ? fn : null;
}

export function applyTrackingSettings(settings: Partial<Settings>): void {
  trackingProfile         = getPerformanceProfile({ ...getSettings(), ...settings } as Settings);
  dynamicDetectIntervalMs = getDetectIntervalMs(trackingProfile);
  if (worker) worker.postMessage({ type: 'setSettings', payload: settings });
}

function clearCalibAutoTimer(): void {
  calibAutoScheduled = false;
  if (calibAutoTimer) { clearTimeout(calibAutoTimer); calibAutoTimer = null; }
}

export function resetCalibration(): void {
  Object.assign(calibData, DEFAULT_CALIB);
  calibPoints              = [];
  autoFlipDetector.reset();
  clearCalibAutoTimer();
}

/** Returns a snapshot of the current calibration data. */
export function getCalibrationData(): CalibData {
  return { ...calibData };
}

/** Restores previously saved calibration data and sends it to the worker. */
export function restoreCalibrationData(data: CalibData): void {
  Object.assign(calibData, data);
  if (worker) {
    worker.postMessage({ type: 'setCalibration', payload: { ...calibData } });
  }
}

export function finishCalibStep(idx: number): void {
  clearCalibAutoTimer();
  if (idx === 0 || idx === 1) {
    if (calibPoints.length > 4) {
      const xs     = calibPoints.map(p => p.x);
      const ys     = calibPoints.map(p => p.y);
      const marginX = 0.08;
      const marginY = 0.08;
      const minX   = Math.min(...xs), maxX = Math.max(...xs);
      const minY   = Math.min(...ys), maxY = Math.max(...ys);
      const cx     = (minX + maxX) / 2;
      const cy     = (minY + maxY) / 2;
      const width  = Math.max(0.38, maxX - minX + marginX * 2);
      const height = Math.max(0.34, maxY - minY + marginY * 2);
      calibData.minX   = Math.max(0, cx - width  / 2);
      calibData.maxX   = Math.min(1, cx + width  / 2);
      calibData.minY   = Math.max(0, cy - height / 2);
      calibData.maxY   = Math.min(1, cy + height / 2);
      calibData.rangeX = 3.4;
      calibData.rangeY = 3.2;
    }
  }
  if (CALIB_STEPS[idx]?.id === 'confirm' && worker) {
    worker.postMessage({ type: 'setCalibration', payload: { ...calibData } });
  }
  calibPoints = [];
}

export function renderCalibStep(): void {
  renderCalibrationStep(state.calibIdx, state.oneHandMode, scheduleCalibAuto);
}

function setupCalibFeed(): void {
  const calibCanvas = document.getElementById('calibCanvas') as HTMLCanvasElement | null;
  if (!calibCanvas) return;
  calibCanvas.width  = 440;
  calibCanvas.height = 286;
  const calibCtx = calibCanvas.getContext('2d');
  if (!calibCtx || calibCanvas.dataset['feedStarted'] === '1') return;
  calibCanvas.dataset['feedStarted'] = '1';

  function drawCalibFeed(): void {
    const active = state.appState === S.CALIB;
    const w = calibCanvas!.width;
    const h = calibCanvas!.height;

    if (active) {
      calibCtx!.clearRect(0, 0, w, h);

      if ((videoEl && videoEl.readyState >= 2) || trackingSource === 'remote') {
        if (videoEl && videoEl.readyState >= 2) {
          calibCtx!.save();
          calibCtx!.translate(w, 0);
          calibCtx!.scale(-1, 1);
          calibCtx!.drawImage(videoEl, 0, 0, w, h);
          calibCtx!.restore();
        } else {
          calibCtx!.fillStyle = 'rgba(5,7,13,0.9)';
          calibCtx!.fillRect(0, 0, w, h);
        }

        // Draw ML hand skeleton overlay
        for (const hand of latestLandmarks) {
          calibCtx!.strokeStyle = 'rgba(47,124,255,0.85)';
          calibCtx!.lineWidth   = 2;
          for (const [a, b] of HAND_CONNECTIONS) {
            const pa = hand[a]!, pb = hand[b]!;
            calibCtx!.beginPath();
            calibCtx!.moveTo((1 - pa.x) * w, pa.y * h);
            calibCtx!.lineTo((1 - pb.x) * w, pb.y * h);
            calibCtx!.stroke();
          }
          for (const lm of hand) {
            calibCtx!.fillStyle = '#7eb8ff';
            calibCtx!.beginPath();
            calibCtx!.arc((1 - lm.x) * w, lm.y * h, 4, 0, Math.PI * 2);
            calibCtx!.fill();
          }
        }

        if (calibPoints.length) {
          let minX = 1, maxX = 0, minY = 1, maxY = 0;
          for (const p of calibPoints) {
            const x = 1 - p.x;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          calibCtx!.strokeStyle = 'rgba(54,242,161,0.95)';
          calibCtx!.lineWidth   = 2;
          calibCtx!.strokeRect(minX * w, minY * h, Math.max(8, (maxX - minX) * w), Math.max(8, (maxY - minY) * h));
        }
      } else {
        calibCtx!.fillStyle = 'rgba(5,7,13,0.72)';
        calibCtx!.fillRect(0, 0, w, h);
        calibCtx!.fillStyle   = 'rgba(226,232,240,0.62)';
        calibCtx!.font        = '12px JetBrains Mono, monospace';
        calibCtx!.textAlign   = 'center';
        calibCtx!.fillText(t('calib.waitingCamera'), w / 2, h / 2);
      }
    }

    calibFeedLoop = setTimeout(drawCalibFeed, active ? 33 : 250);
  }
  drawCalibFeed();
}

async function startCamera(): Promise<void> {
  videoEl = document.getElementById('rawVideo') as HTMLVideoElement;
  const profile = getPerformanceProfile(getSettings());
  trackingProfile         = profile;
  dynamicDetectIntervalMs = getDetectIntervalMs(profile);
  const cam    = profile.camera || { width: 640, height: 360, frameRate: 30 };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width:     { ideal: cam.width },
      height:    { ideal: cam.height },
      frameRate: { ideal: cam.frameRate, max: cam.frameRate },
      facingMode: 'user',
    },
  });
  cameraStream     = stream;
  videoEl.srcObject = stream;
  await new Promise<void>(res => { videoEl!.onloadedmetadata = () => res(); });
  await videoEl.play();

  const track    = stream.getVideoTracks()[0]!;
  const settings = track.getSettings();
  if (ui.dCam) ui.dCam.textContent = `${settings.width}×${settings.height}@${settings.frameRate}`;
}

function initWorker(): void {
  worker = new Worker(new URL('./tracking.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onWorkerMessage;
  const s = getSettings();
  worker.postMessage({ type: 'setSettings', payload: { sensitivity: s.sensitivity, flipCamera: s.flipCamera, oneHandMode: s.oneHandMode || null } });
}

let latestWorkerResult: WorkerResult | null = null;
const remoteWorkerSentAtQueue: Array<number | null> = [];

function onWorkerMessage(e: MessageEvent<{ type: string; payload: WorkerResult }>): void {
  if (e.data.type !== 'result') return;
  latestWorkerResult = e.data.payload;
  applyWorkerResult(latestWorkerResult);
  if (trackingSource !== 'remote') return;
  const sentAtEpochMs = remoteWorkerSentAtQueue.shift() ?? null;
  if (sentAtEpochMs === null) return;
  const elapsed = Date.now() - sentAtEpochMs;
  if (elapsed < 0 || elapsed > 5_000) return;
  window.__remoteTrackingApplyMs = elapsed;
  if (ui.dLat) ui.dLat.textContent = `${elapsed.toFixed(0)}ms`;
}

function drawLandmarks(result: DetectResult): void {
  if (trackCtx && trackCanvas) {
    drawHandLandmarks(trackCanvas, trackCtx, result, isDebugVisuals() ? videoEl : null);
  }
  if (state.appState === S.PAUSED && handsPauseCtx && handsPauseCanvas) {
    drawHandLandmarks(handsPauseCanvas, handsPauseCtx, result, videoEl);
  }
}

let detectLoop: ReturnType<typeof setTimeout> | null = null;

function scheduleDetect(delayMs = 0): void {
  if (!trackingActive) return;
  detectLoop = setTimeout(runDetect, Math.max(0, delayMs));
}

function collectAutoFlipSamples(result: DetectResult): void {
  if (state.appState !== S.CALIB || CALIB_STEPS[state.calibIdx]?.id !== 'sides') return;
  const currentFlip = Boolean(getSettings().flipCamera);
  const suggestion = autoFlipDetector.collect(result, currentFlip);
  if (suggestion && suggestion.flipCamera !== currentFlip) {
    onAutoFlipSuggestion(suggestion);
    applyTrackingSettings({ flipCamera: suggestion.flipCamera });
  }
}

function processDetectionResult(
  result: DetectResult,
  now: number,
  detectMs: number,
  remoteSentAtEpochMs: number | null = null,
): void {
  latestLandmarks = result.landmarks ?? [];
  drawLandmarks(result);
  collectAutoFlipSamples(result);
  sendRealtimeLandmarks(result, now, isDebugVisuals());

  if (worker && result.landmarks?.length) {
    const candidates = result.landmarks.map((landmarks, index) => {
      const hand = result.handedness?.[index]?.[0];
      return {
        landmarks,
        score: hand?.score ?? 0.8,
        handedness: hand?.categoryName ?? hand?.displayName ?? null,
      };
    });
    worker.postMessage({ type: 'setState', payload: { appState: state.appState, oneHandMode: state.oneHandMode || null } });
    if (trackingSource === 'remote') remoteWorkerSentAtQueue.push(remoteSentAtEpochMs);
    worker.postMessage({ type: 'analyze', payload: { candidates } });
  } else if (worker) {
    if (trackingSource === 'remote') remoteWorkerSentAtQueue.push(remoteSentAtEpochMs);
    worker.postMessage({ type: 'analyze', payload: { candidates: [] } });
  }

  if (state.appState === S.CALIB && result.landmarks?.length) {
    for (const hand of result.landmarks) {
      if (hand[0]) calibPoints.push(hand[0]);
    }
  }

  if (ui.dConf) {
    const confidence = result.handedness?.[0]?.[0]?.score ?? 0;
    ui.dConf.textContent = confidence.toFixed(2);
  }
  if (ui.dLat) ui.dLat.textContent = `${detectMs.toFixed(1)}ms`;
}

window.addEventListener('hand-sabers:remote-tracking-packet', event => {
  if (!trackingActive || trackingSource !== 'remote') return;
  const startedAt = performance.now();
  const packet = (event as CustomEvent<ArrayBuffer>).detail;
  const result = decodeRemoteLandmarks(packet);
  if (!result) return;
  const sentAtEpochMs = new DataView(packet).getFloat64(8, true);
  processDetectionResult(
    result,
    startedAt,
    performance.now() - startedAt,
    sentAtEpochMs >= 1_000_000_000_000 ? sentAtEpochMs : null,
  );
});

window.addEventListener('hand-sabers:remote-tracking-state', event => {
  const connected = Boolean((event as CustomEvent<{ connected?: boolean }>).detail?.connected);
  updateCalibrationSourceIndicator(connected);
  if (trackingSource === 'remote' && !connected) {
    remoteWorkerSentAtQueue.length = 0;
    delete window.__remoteTrackingApplyMs;
    latestLandmarks = [];
    latestWorkerResult = null;
    worker?.postMessage({ type: 'analyze', payload: { candidates: [] } });
    applyWorkerResult(null);
  }
});

function runDetect(): void {
  if (!trackingActive) return;
  if (!handLandmarker || !videoEl || videoEl.readyState < 2) {
    scheduleDetect(80);
    return;
  }

  const now = performance.now();
  const dt  = now - lastDetectMs;
  if (dt < dynamicDetectIntervalMs) {
    scheduleDetect(dynamicDetectIntervalMs - dt);
    return;
  }
  lastDetectMs = now;

  const t0       = performance.now();
  const result: DetectResult = handLandmarker.detectForVideo(videoEl, now);
  const detectMs = performance.now() - t0;
  window.__lastDetectMs = detectMs;

  {
    const targetInterval = detectMs / 0.75;
    const baseMs  = getDetectIntervalMs(trackingProfile);
    const alpha   = detectMs > dynamicDetectIntervalMs * 0.80 ? 0.65 : 0.90;
    const proposed = dynamicDetectIntervalMs * alpha + targetInterval * (1 - alpha);
    dynamicDetectIntervalMs = Math.max(baseMs, Math.min(120, proposed));
  }

  if (ui.dDetect) ui.dDetect.textContent = `${detectMs.toFixed(1)}ms`;

  processDetectionResult(result, now, detectMs);

  scheduleDetect(dynamicDetectIntervalMs - (performance.now() - lastDetectMs));
}

function applyWorkerResult(r: WorkerResult | null): void {
  if (!r) {
    state.handsLeftActive  = false;
    state.handsRightActive = false;
    updateHandDots(false, false);
    return;
  }

  state.handsLeftActive  = r.leftActive;
  state.handsRightActive = r.rightActive;
  state.saberQuatL = r.leftQuat  ?? null;
  state.saberQuatR = r.rightQuat ?? null;

  if (r.leftPos  && saberTargetSetter) saberTargetSetter('left',  r.leftPos);
  if (r.rightPos && saberTargetSetter) saberTargetSetter('right', r.rightPos);

  updateHandDots(r.leftActive, r.rightActive);

  window.__lastHandConf      = r.leftConf || r.rightConf;
  window.__filteredHandCount = r.filteredCount;
  window.__rawHandCount      = r.rawCount;

  if (ui.dHandL) ui.dHandL.textContent = r.leftActive  ? `(${r.leftConf.toFixed(2)})` : 'offline';
  if (ui.dHandR) ui.dHandR.textContent = r.rightActive ? `(${r.rightConf.toFixed(2)})` : 'offline';
  if (ui.dHandsBackend) ui.dHandsBackend.textContent = `${r.filteredCount}/${r.rawCount}`;
  sendRealtimePose(r, performance.now());
}

function updateHandDots(l: boolean, r: boolean): void {
  if (ui.dotL) ui.dotL.className = 'dot' + (l ? ' active-l' : '');
  if (ui.dotR) ui.dotR.className = 'dot' + (r ? ' active-r' : '');
}

function hasRequiredCalibrationHands(): boolean {
  if (state.oneHandMode === 'left')  return state.handsLeftActive;
  if (state.oneHandMode === 'right') return state.handsRightActive;
  return state.handsLeftActive && state.handsRightActive;
}

/** When true, the manual "DALEJ" button is shown and auto-advance is disabled. */
let manualCalibrationMode = false;

export function setManualCalibrationMode(enabled: boolean): void {
  manualCalibrationMode = enabled;
  if (enabled) clearCalibAutoTimer();
}

function scheduleCalibAuto(): void {
  if (state.appState !== S.CALIB) return;
  if (calibAutoScheduled) return;
  if (manualCalibrationMode) return;
  const step = CALIB_STEPS[state.calibIdx];
  if (!step) return;
  if (calibAutoTimer) { clearTimeout(calibAutoTimer); calibAutoTimer = null; }
  // Automatic mode: uniform 2-second hold for every step (slower, with Lyra's text)
  const holdMs = 2000;
  calibAutoScheduled = true;
  calibAutoTimer = setTimeout(() => {
    calibAutoScheduled = false;
    calibAutoTimer     = null;
    if (hasRequiredCalibrationHands()) {
      updateCalibFeedback(true, t(state.oneHandMode ? 'calib.detectedOne' : 'calib.detectedBoth'));
      setTimeout(() => autoAdvance(), 400);
    } else {
      updateCalibFeedback(false, t(state.oneHandMode ? 'calib.showOne' : 'calib.showBoth'));
      scheduleCalibAuto();
    }
  }, holdMs);
}

export function stopTracking(): void {
  trackingActive     = false;
  trackingSource     = null;
  remoteWorkerSentAtQueue.length = 0;
  delete window.__remoteTrackingApplyMs;
  latestWorkerResult = null;
  calibAutoScheduled = false;

  if (detectLoop)    { clearTimeout(detectLoop);    detectLoop    = null; }
  if (calibFeedLoop) { clearTimeout(calibFeedLoop); calibFeedLoop = null; }
  if (calibAutoTimer){ clearTimeout(calibAutoTimer); calibAutoTimer = null; }

  if (worker) { worker.terminate(); worker = null; }
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
    cameraStream = null;
  }
  if (videoEl) videoEl.srcObject = null;

  const calibCanvas = document.getElementById('calibCanvas') as HTMLCanvasElement | null;
  if (calibCanvas) delete calibCanvas.dataset['feedStarted'];
  calibPoints = [];
}

function updateCalibFeedback(ok: boolean, hint: string): void {
  setCalibFeedback(ok, hint);
}

export async function initMP(onReady: () => void): Promise<boolean> {
  trackCanvas = document.getElementById('trackCanvas') as HTMLCanvasElement | null;
  if (trackCanvas) {
    trackCanvas.width  = 240;
    trackCanvas.height = 156;
    trackCtx = trackCanvas.getContext('2d', { alpha: false });
  }
  handsPauseCanvas = document.getElementById('handsPauseCanvas') as HTMLCanvasElement | null;
  handsPauseCtx = handsPauseCanvas?.getContext('2d', { alpha: false }) ?? null;
  const sourcePreference = getSettings().trackingSource;
  const remoteConnected = isRemoteTrackingConnected();
  const phoneRequiredButMissing = sourcePreference === 'phone' && !remoteConnected;
  const useRemoteTracking = sourcePreference === 'phone'
    || (sourcePreference === 'auto' && remoteConnected);
  trackingSource = useRemoteTracking ? 'remote' : 'camera';
  updateCalibrationSourceIndicator(remoteConnected);

  setupCalibFeed();

  try {
    if (phoneRequiredButMissing) throw new Error(t('remoteTracking.phoneRequired'));
    if (useRemoteTracking) {
      setLoadingProgress(t('remoteTracking.preparingPhoneData'), t('remoteTracking.preparingPhoneDataDetail'), null);
      if (ui.dCam) ui.dCam.textContent = 'PHONE';
    } else {
      setLoadingProgress(t('overlay.loadingModel'), t('overlay.loadingRuntimeDetail'), null);
      handLandmarker = await loadHandLandmarker((msg, detail, ratio) => setLoadingProgress(msg, detail, ratio));
      setLoadingProgress(t('overlay.startingCamera'), t('overlay.startingCameraDetail'), null);
      await startCamera();
      setLoadingProgress(t('overlay.cameraReady'), t('overlay.cameraReadyDetail'), null);
      setupCalibFeed();
    }
    setLoadingProgress(t('overlay.initializingWorker'), t('overlay.initializingWorkerDetail'), null);
    initWorker();
    trackingActive = true;
    if (!useRemoteTracking) scheduleDetect();
    setLoadingProgress(t('overlay.allReady'), t('overlay.allReadyDetail'), 1.0);

    if (ui.dStatus) ui.dStatus.textContent = useRemoteTracking ? 'PHONE TRACKING' : 'TRACKING OK';
    scheduleCalibAuto();
    onReady();
    return true;
  } catch (err) {
    console.error('initMP error:', err);
    stopTracking();
    showCameraError(err);
    return false;
  }
}
