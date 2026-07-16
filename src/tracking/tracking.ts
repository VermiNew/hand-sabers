import { state, S } from '../core/state.ts';
import { ui, setLoadingProgress, showCameraError, setCalibFeedback } from '../ui/ui.ts';
import { getSettings } from '../core/settings.ts';
import { getDetectIntervalMs, getPerformanceProfile } from '../core/performance.ts';
import { t } from '../i18n/index.ts';
import { canSendRealtime, PROTOCOL_VERSION, sendRealtimePacket } from '../multiplayer/client.ts';
import { isRemoteTrackingConnected } from '../remote/host-pairing.ts';
import type { Settings, SaberQuat } from '../types/index.js';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
const MODEL_URL     = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const URL_PARAMS = new URLSearchParams(location.search);
function isDebugVisuals(): boolean {
  return URL_PARAMS.has('dev') || URL_PARAMS.has('testing') || Boolean(getSettings().developerMode);
}
const HAND_CONNECTIONS: readonly [number, number][] = Object.freeze([
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]);

export interface CalibStep {
  id:     string;
  title:  string;
  instr:  string;
  autoMs: number;
}

export const CALIB_STEPS: readonly CalibStep[] = [
  { id: 'arms',    title: 'KROK 1 / 4 — ZASIĘG RĄK',    instr: 'Wyciągnij obie ręce do przodu jak najszerzej.\nTrzymaj przez 2 sekundy.',                                           autoMs: 2000 },
  { id: 'zone',    title: 'KROK 2 / 4 — STREFA GRY',    instr: 'Porusz rękami w całym obszarze gry.\nGóra, dół, boki — obejmij cały zakres.',                                       autoMs: 3000 },
  { id: 'sides',   title: 'KROK 3 / 4 — STRONY KAMERY', instr: 'Pokaż ręce po właściwych stronach ciała.\nSprawdzę, czy kamera nie zamienia lewej i prawej strony.',               autoMs: 1600 },
  { id: 'confirm', title: 'KROK 4 / 4 — POTWIERDZENIE', instr: 'Pokaż obie ręce wyprostowane.\nUpewnij się że obie są widoczne.',                                                   autoMs: 1500 },
];

declare global {
  interface Window {
    __lastDetectMs?:     number;
    __lastHandConf?:     number;
    __filteredHandCount?: number;
    __rawHandCount?:     number;
  }
}

interface CalibData {
  minX: number; maxX: number;
  minY: number; maxY: number;
  rangeX: number; rangeY: number;
}

interface Landmark { x: number; y: number; z: number; }

interface HandednessCategory {
  score: number;
  categoryName?: string;
  displayName?:  string;
}

interface DetectResult {
  landmarks?:  Landmark[][];
  handedness?: HandednessCategory[][];
}

interface WorkerResult {
  leftActive:    boolean;
  rightActive:   boolean;
  leftQuat?:     SaberQuat;
  rightQuat?:    SaberQuat;
  leftPos?:      { x: number; y: number; z: number };
  rightPos?:     { x: number; y: number; z: number };
  leftConf:      number;
  rightConf:     number;
  filteredCount: number;
  rawCount:      number;
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
let autoFlipSamples:         boolean[] = [];
let autoFlipAppliedThisCalib = false;
let trackingProfile          = getPerformanceProfile(getSettings());
let dynamicDetectIntervalMs  = getDetectIntervalMs(trackingProfile);
let realtimeSequence         = 0;
let lastRealtimePoseMs       = -Infinity;
let lastRealtimeLandmarksMs  = -Infinity;
let trackingSource: 'camera' | 'remote' | null = null;

function decodeRemoteLandmarks(packet: ArrayBuffer): DetectResult | null {
  if (packet.byteLength !== 528) return null;
  const view = new DataView(packet);
  if (view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== 2 || view.getUint8(2) > 3) return null;
  const flags = view.getUint8(2);
  const landmarks: Landmark[][] = [];
  const handedness: HandednessCategory[][] = [];
  for (let handIndex = 0; handIndex < 2; handIndex++) {
    if ((flags & (1 << handIndex)) === 0) continue;
    const hand: Landmark[] = [];
    for (let landmarkIndex = 0; landmarkIndex < 21; landmarkIndex++) {
      const offset = 24 + handIndex * 252 + landmarkIndex * 12;
      hand.push({
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
      });
    }
    landmarks.push(hand);
    handedness.push([{
      score: view.getFloat32(handIndex === 0 ? 16 : 20, true),
      categoryName: handIndex === 0 ? 'Left' : 'Right',
    }]);
  }
  return { landmarks, handedness };
}

function writePose(
  view: DataView,
  offset: number,
  active: boolean,
  confidence: number,
  position: { x: number; y: number; z: number } | undefined,
  orientation: SaberQuat | undefined,
): void {
  const values = active && position && orientation
    ? [
        confidence,
        position.x, position.y, position.z,
        orientation.bladeDir.x, orientation.bladeDir.y, orientation.bladeDir.z,
        orientation.rollDir.x, orientation.rollDir.y, orientation.rollDir.z,
      ]
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  values.forEach((value, index) => view.setFloat32(offset + index * 4, value, true));
}

function sendRealtimePose(result: WorkerResult, now: number): void {
  if (!canSendRealtime() || now - lastRealtimePoseMs < 1000 / 60) return;
  const leftReady = result.leftActive && Boolean(result.leftPos && result.leftQuat);
  const rightReady = result.rightActive && Boolean(result.rightPos && result.rightQuat);
  const packet = new ArrayBuffer(96);
  const view = new DataView(packet);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, 1);
  view.setUint8(2, (leftReady ? 1 : 0) | (rightReady ? 2 : 0));
  view.setUint32(4, realtimeSequence++, true);
  view.setFloat64(8, now, true);
  writePose(view, 16, leftReady, result.leftConf, result.leftPos, result.leftQuat);
  writePose(view, 56, rightReady, result.rightConf, result.rightPos, result.rightQuat);
  if (sendRealtimePacket(packet)) lastRealtimePoseMs = now;
}

function assignLandmarksToSides(result: DetectResult): {
  left: Landmark[] | null;
  right: Landmark[] | null;
  leftConfidence: number;
  rightConfidence: number;
} {
  const settings = getSettings();
  const candidates = (result.landmarks ?? [])
    .map((landmarks, index) => {
      const handedness = result.handedness?.[index]?.[0];
      const label = String(handedness?.categoryName ?? handedness?.displayName ?? '').toLowerCase();
      const rawSide = label.includes('left') ? 'left' : label.includes('right') ? 'right' : null;
      const side = settings.flipCamera
        ? rawSide === 'left' ? 'right' : rawSide === 'right' ? 'left' : null
        : rawSide;
      const wristX = landmarks[0]?.x ?? 0.5;
      const worldX = 0.5 - (settings.flipCamera ? 1 - wristX : wristX);
      return { landmarks, confidence: handedness?.score ?? 0, side, worldX };
    })
    .filter(candidate => candidate.landmarks.length >= 21);

  if ((settings.oneHandMode === 'left' || settings.oneHandMode === 'right') && candidates.length) {
    const selected = [...candidates].sort((a, b) => b.confidence - a.confidence)[0]!;
    return settings.oneHandMode === 'left'
      ? { left: selected.landmarks, right: null, leftConfidence: selected.confidence, rightConfidence: 0 }
      : { left: null, right: selected.landmarks, leftConfidence: 0, rightConfidence: selected.confidence };
  }

  const sorted = [...candidates].sort((a, b) => a.worldX - b.worldX);
  let left = candidates.find(candidate => candidate.side === 'left') ?? null;
  let right = candidates.find(candidate => candidate.side === 'right' && candidate !== left) ?? null;
  if (!left && !right && sorted.length === 1) {
    if (sorted[0]!.worldX <= 0) left = sorted[0]!;
    else right = sorted[0]!;
  } else {
    left ??= sorted.find(candidate => candidate !== right) ?? null;
    right ??= [...sorted].reverse().find(candidate => candidate !== left) ?? null;
  }
  return {
    left: left?.landmarks ?? null,
    right: right?.landmarks ?? null,
    leftConfidence: left?.confidence ?? 0,
    rightConfidence: right?.confidence ?? 0,
  };
}

function safeLandmarkValue(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(-4, Math.min(4, value!)) : 0;
}

function sendRealtimeLandmarks(result: DetectResult, now: number): void {
  if (!isDebugVisuals() || !canSendRealtime() || now - lastRealtimeLandmarksMs < 1000 / 30) return;
  const assigned = assignLandmarksToSides(result);
  const packet = new ArrayBuffer(528);
  const view = new DataView(packet);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, 2);
  view.setUint8(2, (assigned.left ? 1 : 0) | (assigned.right ? 2 : 0));
  view.setUint32(4, realtimeSequence++, true);
  view.setFloat64(8, now, true);
  view.setFloat32(16, Math.max(0, Math.min(1, assigned.leftConfidence)), true);
  view.setFloat32(20, Math.max(0, Math.min(1, assigned.rightConfidence)), true);
  for (const [handIndex, landmarks] of [assigned.left, assigned.right].entries()) {
    for (let landmarkIndex = 0; landmarkIndex < 21; landmarkIndex++) {
      const landmark = landmarks?.[landmarkIndex];
      const offset = 24 + handIndex * 252 + landmarkIndex * 12;
      view.setFloat32(offset, safeLandmarkValue(landmark?.x), true);
      view.setFloat32(offset + 4, safeLandmarkValue(landmark?.y), true);
      view.setFloat32(offset + 8, safeLandmarkValue(landmark?.z), true);
    }
  }
  if (sendRealtimePacket(packet)) lastRealtimeLandmarksMs = now;
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
  autoFlipSamples          = [];
  autoFlipAppliedThisCalib = false;
  clearCalibAutoTimer();
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

function getCalibInstruction(step: CalibStep): string {
  if (!state.oneHandMode) return step.instr;
  if (step.id === 'arms')    return 'Wyciągnij jedną rękę do przodu i na bok.\nTrzymaj przez 2 sekundy.';
  if (step.id === 'zone')    return 'Porusz jedną ręką po całym obszarze gry.\nGóra, dół, boki — obejmij cały zakres.';
  if (step.id === 'sides')   return 'Podnieś rękę, którą chcesz grać.\nSprawdzę stronę kamery dla wybranego miecza.';
  if (step.id === 'confirm') return 'Pokaż jedną rękę wyprostowaną.\nUpewnij się, że jest dobrze widoczna.';
  return step.instr;
}

const CALIB_STEP_LABELS = ['ZASIĘG', 'STREFA', 'STRONY', 'POTW.'];

export function renderCalibStep(): void {
  const step = CALIB_STEPS[state.calibIdx];
  if (!step) return;
  const total = CALIB_STEPS.length;
  const idx   = state.calibIdx;
  const pct   = ((idx + 1) / total) * 100;

  if (ui.calibStep)  ui.calibStep.textContent  = step.title;
  if (ui.calibInstr) ui.calibInstr.textContent = getCalibInstruction(step);
  if (ui.calibBar)   ui.calibBar.style.width   = `${pct}%`;

  if (ui.calibStepBadge) {
    ui.calibStepBadge.textContent = `KROK ${idx + 1} / ${total}`;
  }
  if (ui.calibProgressLabel) {
    ui.calibProgressLabel.textContent = `${Math.round(pct)}%`;
  }

  if (ui.calibStepsTrack) {
    ui.calibStepsTrack.innerHTML = CALIB_STEPS.map((_, i) => {
      const cls = i < idx ? 'is-done' : i === idx ? 'is-active' : '';
      const connector = i < total - 1
        ? `<div class="calib-step-connector${i < idx ? ' is-done' : ''}"></div>`
        : '';
      return `<div class="calib-step-dot ${cls}">
        <div class="calib-step-num">${i < idx ? '<span class="material-symbols-rounded" style="font-size:13px">check</span>' : i + 1}</div>
        <span class="calib-step-label">${CALIB_STEP_LABELS[i] ?? ''}</span>
      </div>${connector}`;
    }).join('');
  }

  scheduleCalibAuto();
}

async function loadMediaPipe(onProgress: (msg: string, detail: string, ratio: number | null) => void): Promise<void> {
  onProgress(t('overlay.loadingRuntime'), t('overlay.loadingRuntimeDetail'), 0.1);
  const { HandLandmarker, FilesetResolver } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js' as string
  );
  onProgress(t('overlay.initializingResolver'), t('overlay.initializingResolverDetail'), 0.35);
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
  const modelAssetBuffer = await downloadModel(onProgress);
  onProgress(t('overlay.loadingLandmarker'), t('overlay.initializingLandmarkerDetail'), 1);
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer, delegate: 'GPU' },
    runningMode:                 'VIDEO',
    numHands:                    2,
    minHandDetectionConfidence:  0.42,
    minHandPresenceConfidence:   0.42,
    minTrackingConfidence:       0.42,
  });
  onProgress(t('overlay.modelReady'), t('overlay.modelReadyDetail'), 1.0);
}

function formatMegabytes(bytes: number): string {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}

async function downloadModel(
  onProgress: (msg: string, detail: string, ratio: number | null) => void,
): Promise<Uint8Array> {
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);

  const totalBytes = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress(
      t('overlay.loadingLandmarker'),
      `${t('overlay.loadingLandmarkerDetail')}\n${formatMegabytes(buffer.byteLength)}\u00a0MB`,
      1,
    );
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    const size = totalBytes > 0
      ? `${formatMegabytes(loadedBytes)}\u00a0/\u00a0${formatMegabytes(totalBytes)}\u00a0MB`
      : `${formatMegabytes(loadedBytes)}\u00a0MB`;
    onProgress(
      t('overlay.loadingLandmarker'),
      `${t('overlay.loadingLandmarkerDetail')}\n${size}`,
      totalBytes > 0 ? loadedBytes / totalBytes : null,
    );
  }

  const model = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    model.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return model;
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
        calibCtx!.fillText('Czekam na kamerę…', w / 2, h / 2);
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
function onWorkerMessage(e: MessageEvent<{ type: string; payload: WorkerResult }>): void {
  if (e.data.type !== 'result') return;
  latestWorkerResult = e.data.payload;
}

function drawLandmarksToCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  result: DetectResult,
): void {
  const w = canvas.width, h = canvas.height;
  context.clearRect(0, 0, w, h);

  if (videoEl && videoEl.readyState >= 2) {
    context.save();
    context.translate(w, 0);
    context.scale(-1, 1);
    context.drawImage(videoEl, 0, 0, w, h);
    context.restore();
  } else {
    context.fillStyle = 'rgba(5,7,13,0.9)';
    context.fillRect(0, 0, w, h);
  }

  if (!result?.landmarks) return;
  for (const hand of result.landmarks) {
    context.strokeStyle = 'rgba(47,124,255,0.85)';
    context.lineWidth   = 1.5;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand[a]!, pb = hand[b]!;
      context.beginPath();
      context.moveTo((1 - pa.x) * w, pa.y * h);
      context.lineTo((1 - pb.x) * w, pb.y * h);
      context.stroke();
    }
    for (const lm of hand) {
      context.fillStyle = '#7eb8ff';
      context.beginPath();
      context.arc((1 - lm.x) * w, lm.y * h, 3, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawLandmarks(result: DetectResult): void {
  if (isDebugVisuals() && trackCtx && trackCanvas) {
    drawLandmarksToCanvas(trackCanvas, trackCtx, result);
  }
  if (state.appState === S.PAUSED && handsPauseCtx && handsPauseCanvas) {
    drawLandmarksToCanvas(handsPauseCanvas, handsPauseCtx, result);
  }
}

let detectLoop: ReturnType<typeof setTimeout> | null = null;

function scheduleDetect(delayMs = 0): void {
  if (!trackingActive) return;
  detectLoop = setTimeout(runDetect, Math.max(0, delayMs));
}

function desiredFlipFromHandSample(handedness: string | undefined, wristX: number, currentFlip: boolean): boolean | null {
  const label = String(handedness || '').toLowerCase();
  const side  = label.includes('left') ? 'left' : label.includes('right') ? 'right' : null;
  if (!side || !Number.isFinite(wristX)) return null;
  const mappedRawX      = currentFlip ? (1 - wristX) : wristX;
  const worldX          = 0.5 - mappedRawX;
  const shouldBeLeftSide = side === 'left';
  const isMappedLeftSide = worldX < 0;
  return shouldBeLeftSide === isMappedLeftSide ? currentFlip : !currentFlip;
}

function collectAutoFlipSamples(result: DetectResult): void {
  if (autoFlipAppliedThisCalib || state.appState !== S.CALIB || CALIB_STEPS[state.calibIdx]?.id !== 'sides') return;
  const currentFlip = Boolean(getSettings().flipCamera);
  const handed      = result?.handedness ?? [];
  const landmarks   = result?.landmarks  ?? [];
  for (let i = 0; i < landmarks.length; i++) {
    const h = handed[i]?.[0];
    if ((h?.score ?? 0) < 0.62) continue;
    const desired = desiredFlipFromHandSample(h?.categoryName ?? h?.displayName, landmarks[i]?.[0]?.x ?? 0.5, currentFlip);
    if (desired !== null) autoFlipSamples.push(desired);
    if (autoFlipSamples.length > 15) autoFlipSamples.shift();
  }
  if (autoFlipSamples.length < 5) return;
  const trueCount   = autoFlipSamples.filter(Boolean).length;
  const desiredFlip = trueCount >= Math.ceil(autoFlipSamples.length / 2);
  autoFlipAppliedThisCalib = true;
  if (desiredFlip !== currentFlip) {
    onAutoFlipSuggestion({ flipCamera: desiredFlip, confidence: Math.max(trueCount, autoFlipSamples.length - trueCount) / autoFlipSamples.length });
    applyTrackingSettings({ flipCamera: desiredFlip });
  }
}

function processDetectionResult(result: DetectResult, now: number, detectMs: number): void {
  latestLandmarks = result.landmarks ?? [];
  drawLandmarks(result);
  collectAutoFlipSamples(result);
  sendRealtimeLandmarks(result, now);

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
    worker.postMessage({ type: 'analyze', payload: { candidates } });
  } else if (worker) {
    worker.postMessage({ type: 'analyze', payload: { candidates: [] } });
  }

  applyWorkerResult(latestWorkerResult);

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
  const result = decodeRemoteLandmarks((event as CustomEvent<ArrayBuffer>).detail);
  if (!result) return;
  processDetectionResult(result, startedAt, performance.now() - startedAt);
});

window.addEventListener('hand-sabers:remote-tracking-state', event => {
  const connected = Boolean((event as CustomEvent<{ connected?: boolean }>).detail?.connected);
  if (trackingSource === 'remote' && !connected) {
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

function scheduleCalibAuto(): void {
  if (state.appState !== S.CALIB) return;
  if (calibAutoScheduled) return;
  const step = CALIB_STEPS[state.calibIdx];
  if (!step) return;
  if (calibAutoTimer) { clearTimeout(calibAutoTimer); calibAutoTimer = null; }
  calibAutoScheduled = true;
  calibAutoTimer = setTimeout(() => {
    calibAutoScheduled = false;
    calibAutoTimer     = null;
    if (hasRequiredCalibrationHands()) {
      updateCalibFeedback(true, state.oneHandMode ? 'Wykryto rękę' : 'Wykryto obie ręce');
      setTimeout(() => autoAdvance(), 400);
    } else {
      updateCalibFeedback(false, state.oneHandMode ? 'Pokaż wybraną rękę' : 'Pokaż obie ręce');
      scheduleCalibAuto();
    }
  }, step.autoMs);
}

export function stopTracking(): void {
  trackingActive     = false;
  trackingSource     = null;
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

export async function initMP(onReady: () => void): Promise<void> {
  trackCanvas = document.getElementById('trackCanvas') as HTMLCanvasElement | null;
  if (trackCanvas) {
    trackCanvas.width  = 240;
    trackCanvas.height = 156;
    trackCtx = trackCanvas.getContext('2d', { alpha: false });
  }
  handsPauseCanvas = document.getElementById('handsPauseCanvas') as HTMLCanvasElement | null;
  handsPauseCtx = handsPauseCanvas?.getContext('2d', { alpha: false }) ?? null;
  const useRemoteTracking = isRemoteTrackingConnected();
  trackingSource = useRemoteTracking ? 'remote' : 'camera';

  setupCalibFeed();

  try {
    if (useRemoteTracking) {
      setLoadingProgress(t('remoteTracking.preparingPhoneData'), t('remoteTracking.preparingPhoneDataDetail'), null);
      if (ui.dCam) ui.dCam.textContent = 'PHONE';
    } else {
      setLoadingProgress(t('overlay.loadingModel'), t('overlay.loadingRuntimeDetail'), null);
      await loadMediaPipe((msg, detail, ratio) => setLoadingProgress(msg, detail, ratio));
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
  } catch (err) {
    trackingSource = null;
    console.error('initMP error:', err);
    showCameraError(err);
  }
}
