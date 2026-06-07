import { state, S } from '../core/state.ts';
import { ui, setLoadingProgress, showCameraError, setCalibFeedback } from '../ui/ui.js';
import { getSettings } from '../core/settings.ts';
import { getDetectIntervalMs, getPerformanceProfile } from '../core/performance.js';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
const MODEL_URL     = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const URL_PARAMS    = new URLSearchParams(location.search);
const DEBUG_VISUALS = URL_PARAMS.has('dev') || URL_PARAMS.has('testing');
const HAND_CONNECTIONS = Object.freeze([
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]);

export const CALIB_STEPS = [
  {
    id:      'arms',
    title:   'KROK 1 / 4 — ZASIĘG RĄK',
    instr:   'Wyciągnij obie ręce do przodu jak najszerzej.\nTrzymaj przez 2 sekundy.',
    autoMs:  2000,
  },
  {
    id:      'zone',
    title:   'KROK 2 / 4 — STREFA GRY',
    instr:   'Porusz rękami w całym obszarze gry.\nGóra, dół, boki — obejmij cały zakres.',
    autoMs:  3000,
  },
  {
    id:      'sides',
    title:   'KROK 3 / 4 — STRONY KAMERY',
    instr:   'Pokaż ręce po właściwych stronach ciała.\nSprawdzę, czy kamera nie zamienia lewej i prawej strony.',
    autoMs:  1600,
  },
  {
    id:      'confirm',
    title:   'KROK 4 / 4 — POTWIERDZENIE',
    instr:   'Pokaż obie ręce wyprostowane.\nUpewnij się że obie są widoczne.',
    autoMs:  1500,
  },
];

let handLandmarker = null;
let videoEl        = null;
let trackCanvas    = null;
let trackCtx       = null;
let worker         = null;
let lastDetectMs   = 0;
let onCalibDone    = () => {};
let autoAdvance    = () => {};
let onAutoFlipSuggestion = () => {};
let saberTargetSetter = null;

// Kalibracja — zbieramy bounds rąk i mapujemy je na strefę gry
const DEFAULT_CALIB = { minX: 0.1, maxX: 0.9, minY: 0.1, maxY: 0.9, rangeX: 3.2, rangeY: 3.0 };
const calibData = { ...DEFAULT_CALIB };
let   calibPoints = [];
let   calibStepStartMs = 0;
let   calibAutoTimer   = null;
let   calibAutoScheduled = false;
let   calibFeedLoop    = null;
let   trackingActive   = false;
let   cameraStream     = null;
let   autoFlipSamples  = [];
let   autoFlipAppliedThisCalib = false;
let   trackingProfile  = getPerformanceProfile(getSettings());
let   dynamicDetectIntervalMs = getDetectIntervalMs(trackingProfile);

export function setCalibAutoAdvanceHandler(fn) { autoAdvance = fn; }
export function setAutoFlipSuggestionHandler(fn) { onAutoFlipSuggestion = typeof fn === 'function' ? fn : () => {}; }
export function setSaberTargetSetter(fn) {
  saberTargetSetter = typeof fn === 'function' ? fn : null;
}

export function applyTrackingSettings(settings) {
  trackingProfile = getPerformanceProfile({ ...getSettings(), ...settings });
  dynamicDetectIntervalMs = getDetectIntervalMs(trackingProfile);
  // flipCamera jest źródłowo stosowane w workerze, więc każda zmiana ustawień trafia do niego wiadomością.
  if (worker) worker.postMessage({ type: 'setSettings', payload: settings });
}

function clearCalibAutoTimer() {
  calibAutoScheduled = false;
  if (calibAutoTimer) { clearTimeout(calibAutoTimer); calibAutoTimer = null; }
}

export function resetCalibration() {
  Object.assign(calibData, DEFAULT_CALIB);
  calibPoints = [];
  autoFlipSamples = [];
  autoFlipAppliedThisCalib = false;
  calibStepStartMs = performance.now();
  clearCalibAutoTimer();
}

export function finishCalibStep(idx) {
  clearCalibAutoTimer();
  if (idx === 0 || idx === 1) {
    // Zbierz bounds z zebranych punktów
    if (calibPoints.length > 4) {
      const xs = calibPoints.map(p => p.x);
      const ys = calibPoints.map(p => p.y);
      const marginX = 0.08;
      const marginY = 0.08;
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const width  = Math.max(0.38, maxX - minX + marginX * 2);
      const height = Math.max(0.34, maxY - minY + marginY * 2);
      calibData.minX = Math.max(0, cx - width / 2);
      calibData.maxX = Math.min(1, cx + width / 2);
      calibData.minY = Math.max(0, cy - height / 2);
      calibData.maxY = Math.min(1, cy + height / 2);
      calibData.rangeX = 3.4;
      calibData.rangeY = 3.2;
    }
  }
  if (CALIB_STEPS[idx]?.id === 'confirm' && worker) {
    worker.postMessage({ type: 'setCalibration', payload: { ...calibData } });
  }
  calibPoints = [];
  calibStepStartMs = performance.now();
}

function getCalibInstruction(step) {
  if (!state.oneHandMode) return step.instr;
  if (step.id === 'arms') return 'Wyciągnij jedną rękę do przodu i na bok.\nTrzymaj przez 2 sekundy.';
  if (step.id === 'zone') return 'Porusz jedną ręką po całym obszarze gry.\nGóra, dół, boki — obejmij cały zakres.';
  if (step.id === 'sides') return 'Podnieś rękę, którą chcesz grać.\nSprawdzę stronę kamery dla wybranego miecza.';
  if (step.id === 'confirm') return 'Pokaż jedną rękę wyprostowaną.\nUpewnij się, że jest dobrze widoczna.';
  return step.instr;
}

export function renderCalibStep() {
  const step = CALIB_STEPS[state.calibIdx];
  if (!step) return;
  const pct = ((state.calibIdx) / CALIB_STEPS.length) * 100;
  ui.ovStep.textContent    = step.title;
  ui.ovInstr.textContent   = getCalibInstruction(step);
  ui.ovBar.style.width     = `${pct}%`;
  ui.ovProgress.classList.remove('indeterminate');
  scheduleCalibAuto();
}

async function loadMediaPipe(onProgress) {
  const { HandLandmarker, FilesetResolver } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js'
  );
  onProgress('Inicjalizacja FilesetResolver…', 0.3);
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
  onProgress('Ładowanie modelu HandLandmarker…', 0.6);
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU',
    },
    runningMode:          'VIDEO',
    numHands:             2,
    minHandDetectionConfidence: 0.42,
    minHandPresenceConfidence:  0.42,
    minTrackingConfidence:      0.42,
  });
  onProgress('Model gotowy', 1.0);
}


function setupCalibFeed() {
  const calibCanvas = document.getElementById('calibCanvas');
  if (!calibCanvas) return;
  calibCanvas.width  = 440;
  calibCanvas.height = 286;
  const calibCtx = calibCanvas.getContext('2d');
  if (!calibCtx || calibCanvas.dataset.feedStarted === '1') return;
  calibCanvas.dataset.feedStarted = '1';

  function drawCalibFeed() {
    const active = state.appState === S.CALIB;
    const w = calibCanvas.width;
    const h = calibCanvas.height;

    if (active) {
      calibCtx.clearRect(0, 0, w, h);

      if (videoEl && videoEl.readyState >= 2) {
        calibCtx.save();
        calibCtx.translate(w, 0);
        calibCtx.scale(-1, 1);
        calibCtx.drawImage(videoEl, 0, 0, w, h);
        calibCtx.restore();

        if (calibPoints.length) {
          let minX = 1, maxX = 0, minY = 1, maxY = 0;
          for (const p of calibPoints) {
            const x = 1 - p.x;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          calibCtx.strokeStyle = 'rgba(54,242,161,0.95)';
          calibCtx.lineWidth = 2;
          calibCtx.strokeRect(minX * w, minY * h, Math.max(8, (maxX - minX) * w), Math.max(8, (maxY - minY) * h));
        }
      } else {
        calibCtx.fillStyle = 'rgba(5,7,13,0.72)';
        calibCtx.fillRect(0, 0, w, h);
        calibCtx.fillStyle = 'rgba(226,232,240,0.62)';
        calibCtx.font = '12px JetBrains Mono, monospace';
        calibCtx.textAlign = 'center';
        calibCtx.fillText('Czekam na kamerę…', w / 2, h / 2);
      }
    }

    calibFeedLoop = window.setTimeout(drawCalibFeed, active ? 33 : 250);
  }
  drawCalibFeed();
}

async function startCamera() {
  videoEl = document.getElementById('rawVideo');
  const profile = getPerformanceProfile(getSettings());
  trackingProfile = profile;
  dynamicDetectIntervalMs = getDetectIntervalMs(profile);
  const cam = profile.camera || { width: 640, height: 360, frameRate: 30 };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: cam.width },
      height: { ideal: cam.height },
      frameRate: { ideal: cam.frameRate, max: cam.frameRate },
      facingMode: 'user',
    }
  });
  cameraStream = stream;
  videoEl.srcObject = stream;
  await new Promise(res => videoEl.onloadedmetadata = res);
  await videoEl.play();

  const track   = stream.getVideoTracks()[0];
  const settings= track.getSettings();
  if (ui.dCam) ui.dCam.textContent = `${settings.width}×${settings.height}@${settings.frameRate}`;
}

function initWorker() {
  worker = new Worker(new URL('./tracking.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onWorkerResult;
  const s = getSettings();
  worker.postMessage({ type: 'setSettings', payload: { sensitivity: s.sensitivity, flipCamera: s.flipCamera, oneHandMode: s.oneHandMode || null } });
}

let latestWorkerResult = null;
function onWorkerResult(e) {
  if (e.data.type !== 'result') return;
  latestWorkerResult = e.data.payload;
}

function drawLandmarks(result) {
  if (!DEBUG_VISUALS || !trackCtx) return;
  const w = trackCanvas.width, h = trackCanvas.height;
  trackCtx.clearRect(0, 0, w, h);

  if (!result?.landmarks) return;
  for (const hand of result.landmarks) {
    trackCtx.strokeStyle = 'rgba(54,242,161,0.7)';
    trackCtx.lineWidth   = 1.5;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand[a], pb = hand[b];
      trackCtx.beginPath();
      trackCtx.moveTo((1 - pa.x) * w, pa.y * h);
      trackCtx.lineTo((1 - pb.x) * w, pb.y * h);
      trackCtx.stroke();
    }
    for (const lm of hand) {
      trackCtx.fillStyle = '#2f7cff';
      trackCtx.beginPath();
      trackCtx.arc((1 - lm.x) * w, lm.y * h, 3, 0, Math.PI * 2);
      trackCtx.fill();
    }
  }
}

let detectLoop = null;

function scheduleDetect(delayMs = 0) {
  if (!trackingActive) return;
  detectLoop = window.setTimeout(runDetect, Math.max(0, delayMs));
}

function desiredFlipFromHandSample(handedness, wristX, currentFlip) {
  const label = String(handedness || '').toLowerCase();
  const side = label.includes('left') ? 'left' : label.includes('right') ? 'right' : null;
  if (!side || !Number.isFinite(wristX)) return null;
  const mappedRawX = currentFlip ? (1 - wristX) : wristX;
  const worldX = 0.5 - mappedRawX;
  const shouldBeLeftSide = side === 'left';
  const isMappedLeftSide = worldX < 0;
  return shouldBeLeftSide === isMappedLeftSide ? currentFlip : !currentFlip;
}

function collectAutoFlipSamples(result) {
  if (autoFlipAppliedThisCalib || state.appState !== S.CALIB || CALIB_STEPS[state.calibIdx]?.id !== 'sides') return;
  const currentFlip = Boolean(getSettings().flipCamera);
  const handed = result?.handedness || [];
  const landmarks = result?.landmarks || [];
  for (let i = 0; i < landmarks.length; i++) {
    const h = handed?.[i]?.[0];
    if ((h?.score ?? 0) < 0.62) continue;
    const desired = desiredFlipFromHandSample(h?.categoryName || h?.displayName, landmarks[i]?.[0]?.x, currentFlip);
    if (desired !== null) autoFlipSamples.push(desired);
    if (autoFlipSamples.length > 15) autoFlipSamples.shift();
  }
  if (autoFlipSamples.length < 5) return;
  const trueCount = autoFlipSamples.filter(Boolean).length;
  const desiredFlip = trueCount >= Math.ceil(autoFlipSamples.length / 2);
  autoFlipAppliedThisCalib = true;
  if (desiredFlip !== currentFlip) {
    onAutoFlipSuggestion({ flipCamera: desiredFlip, confidence: Math.max(trueCount, autoFlipSamples.length - trueCount) / autoFlipSamples.length });
    applyTrackingSettings({ flipCamera: desiredFlip });
  }
}

function runDetect() {
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

  const t0 = performance.now();
  const result = handLandmarker.detectForVideo(videoEl, now);
  const detectMs = performance.now() - t0;
  window.__lastDetectMs = detectMs;

  // FIX 4: wykładnicze wygładzanie zamiast asymetrycznych kroków
  {
    const targetInterval = detectMs / 0.75;
    const baseMs = getDetectIntervalMs(trackingProfile);
    const alpha = detectMs > dynamicDetectIntervalMs * 0.80 ? 0.65 : 0.90;
    const proposed = dynamicDetectIntervalMs * alpha + targetInterval * (1 - alpha);
    dynamicDetectIntervalMs = Math.max(baseMs, Math.min(120, proposed));
  }

  if (ui.dDetect) ui.dDetect.textContent = `${detectMs.toFixed(1)}ms`;

  drawLandmarks(result);
  collectAutoFlipSamples(result);

  // Wyślij do workera
  if (worker && result.landmarks?.length) {
    const candidates = result.landmarks.map((lms, i) => {
      const handedness = result.handedness?.[i]?.[0];
      return {
        landmarks: lms,
        score:     handedness?.score ?? 0.8,
        handedness: handedness?.categoryName || handedness?.displayName || null,
      };
    });
    worker.postMessage({ type: 'setState', payload: { appState: state.appState, oneHandMode: state.oneHandMode || null } });
    worker.postMessage({ type: 'analyze', payload: { candidates } });
  } else if (worker) {
    worker.postMessage({ type: 'analyze', payload: { candidates: [] } });
  }

  // Zastosuj wynik z poprzedniej klatki
  applyWorkerResult(latestWorkerResult);

  // Zbierz punkty kalibracji
  if (state.appState === S.CALIB && result.landmarks?.length) {
    for (const hand of result.landmarks) {
      calibPoints.push(hand[0]); // nadgarstek
    }
  }

  // Dev panel
  if (ui.dConf) {
    const conf = result.handedness?.[0]?.[0]?.score ?? 0;
    ui.dConf.textContent = conf.toFixed(2);
  }
  if (ui.dLat) ui.dLat.textContent = `${detectMs.toFixed(1)}ms`;

  scheduleDetect(dynamicDetectIntervalMs - (performance.now() - lastDetectMs));
}

function applyWorkerResult(r) {
  if (!r) {
    state.handsLeftActive  = false;
    state.handsRightActive = false;
    updateHandDots(false, false);
    return;
  }

  state.handsLeftActive  = r.leftActive;
  state.handsRightActive = r.rightActive;
  state.saberQuatL = r.leftQuat;
  state.saberQuatR = r.rightQuat;

  if (r.leftPos  && saberTargetSetter) saberTargetSetter('left',  r.leftPos);
  if (r.rightPos && saberTargetSetter) saberTargetSetter('right', r.rightPos);

  updateHandDots(r.leftActive, r.rightActive);

  // Statystyki dla dev panelu
  window.__lastHandConf      = r.leftConf || r.rightConf;
  window.__filteredHandCount = r.filteredCount;
  window.__rawHandCount      = r.rawCount;

  if (ui.dHandL) ui.dHandL.textContent = r.leftActive  ? `(${r.leftConf.toFixed(2)})` : 'offline';
  if (ui.dHandR) ui.dHandR.textContent = r.rightActive ? `(${r.rightConf.toFixed(2)})` : 'offline';
  if (ui.dHandsBackend) ui.dHandsBackend.textContent = `${r.filteredCount}/${r.rawCount}`;
}

function updateHandDots(l, r) {
  if (ui.dotL) ui.dotL.className = 'dot' + (l ? ' active-l' : '');
  if (ui.dotR) ui.dotR.className = 'dot' + (r ? ' active-r' : '');
}

// Kalibracja: auto-advance po czasie
function hasRequiredCalibrationHands() {
  if (state.oneHandMode === 'left') return state.handsLeftActive;
  if (state.oneHandMode === 'right') return state.handsRightActive;
  return state.handsLeftActive && state.handsRightActive;
}

function scheduleCalibAuto() {
  if (state.appState !== S.CALIB) return;
  if (calibAutoScheduled) return;
  const step = CALIB_STEPS[state.calibIdx];
  if (!step) return;
  if (calibAutoTimer) { clearTimeout(calibAutoTimer); calibAutoTimer = null; }
  calibAutoScheduled = true;
  calibAutoTimer = setTimeout(() => {
    calibAutoScheduled = false;
    calibAutoTimer = null;
    if (hasRequiredCalibrationHands()) {
      updateCalibFeedback(true, state.oneHandMode ? 'Wykryto rękę' : 'Wykryto obie ręce');
      setTimeout(() => autoAdvance(), 400);
    } else {
      updateCalibFeedback(false, state.oneHandMode ? 'Pokaż wybraną rękę' : 'Pokaż obie ręce');
      scheduleCalibAuto();
    }
  }, step.autoMs);
}

export function stopTracking() {
  trackingActive = false;
  latestWorkerResult = null;
  calibAutoScheduled = false;

  if (detectLoop) {
    cancelAnimationFrame(detectLoop);
    clearTimeout(detectLoop);
    detectLoop = null;
  }
  if (calibFeedLoop) {
    cancelAnimationFrame(calibFeedLoop);
    clearTimeout(calibFeedLoop);
    calibFeedLoop = null;
  }
  if (calibAutoTimer) {
    clearTimeout(calibAutoTimer);
    calibAutoTimer = null;
  }

  if (worker) {
    worker.terminate();
    worker = null;
  }
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
    cameraStream = null;
  }
  if (videoEl) videoEl.srcObject = null;

  const calibCanvas = document.getElementById('calibCanvas');
  if (calibCanvas) delete calibCanvas.dataset.feedStarted;
  calibPoints = [];
}

function updateCalibFeedback(ok, hint) {
  setCalibFeedback(ok, hint);
}

export async function initMP(onReady) {
  trackCanvas = document.getElementById('trackCanvas');
  if (trackCanvas && DEBUG_VISUALS) {
    trackCanvas.width  = 240;
    trackCanvas.height = 156;
    trackCtx = trackCanvas.getContext('2d', { alpha: false });
  }

  setupCalibFeed();

  try {
    setLoadingProgress('Ładowanie modelu…', 'Proszę czekać…', null);
    await loadMediaPipe((msg, ratio) => setLoadingProgress(msg, '', ratio));
    await startCamera();
    setupCalibFeed();
    initWorker();
    trackingActive = true;
    scheduleDetect();

    if (ui.dStatus) ui.dStatus.textContent = 'TRACKING OK';
    scheduleCalibAuto();
    onReady();
  } catch (err) {
    console.error('initMP error:', err);
    showCameraError(err);
  }
}
