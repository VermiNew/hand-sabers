import { t } from '../i18n/index.ts';
import type { HandTrackingOptions } from './tracking-options-protocol.ts';
import type { PhoneTrackingMetricsEvent } from './tracking-metrics.ts';
import { encodePhoneCameraFrame } from './camera-frame-protocol.ts';
import type { PhoneCameraProcessing } from '../types/index.js';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const HAND_CONNECTIONS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];
const DEFAULT_HAND_TRACKING_OPTIONS: HandTrackingOptions = {
  handDetectionConfidence: 0.42,
  handPresenceConfidence: 0.42,
  handTrackingConfidence: 0.42,
};

interface Landmark { x: number; y: number; z: number }
interface Handedness { categoryName?: string; displayName?: string; score?: number }
interface DetectionResult {
  landmarks?: Landmark[][];
  handedness?: Handedness[][];
}
interface HandLandmarker {
  detectForVideo(video: HTMLVideoElement, timestamp: number): DetectionResult;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing phone tracking element: ${id}`);
  return found as T;
}

function clamp(value: number | undefined, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : 0;
}

function assignHands(result: DetectionResult): {
  left: Landmark[] | null;
  right: Landmark[] | null;
  leftConfidence: number;
  rightConfidence: number;
} {
  const candidates = (result.landmarks ?? [])
    .map((landmarks, index) => {
      const category = result.handedness?.[index]?.[0];
      const label = String(category?.categoryName ?? category?.displayName ?? '').toLowerCase();
      const side = label.includes('left') ? 'left' : label.includes('right') ? 'right' : null;
      return { landmarks, side, confidence: clamp(category?.score, 0, 1) };
    })
    .filter(candidate => candidate.landmarks.length >= 21);
  let left = candidates.find(candidate => candidate.side === 'left') ?? null;
  let right = candidates.find(candidate => candidate.side === 'right') ?? null;
  const unassigned = candidates.filter(candidate => candidate !== left && candidate !== right);
  left ??= unassigned.find(candidate => (candidate.landmarks[0]?.x ?? 0.5) >= 0.5) ?? null;
  right ??= unassigned.find(candidate => candidate !== left) ?? null;
  return {
    left: left?.landmarks ?? null,
    right: right?.landmarks ?? null,
    leftConfidence: left?.confidence ?? 0,
    rightConfidence: right?.confidence ?? 0,
  };
}

function encodeLandmarks(result: DetectionResult, sequence: number, sentAtEpochMs: number): ArrayBuffer {
  const hands = assignHands(result);
  const packet = new ArrayBuffer(528);
  const view = new DataView(packet);
  view.setUint8(0, 1);
  view.setUint8(1, 2);
  view.setUint8(2, (hands.left ? 1 : 0) | (hands.right ? 2 : 0));
  view.setUint32(4, sequence, true);
  view.setFloat64(8, sentAtEpochMs, true);
  view.setFloat32(16, hands.leftConfidence, true);
  view.setFloat32(20, hands.rightConfidence, true);
  for (const [handIndex, landmarks] of [hands.left, hands.right].entries()) {
    for (let landmarkIndex = 0; landmarkIndex < 21; landmarkIndex++) {
      const landmark = landmarks?.[landmarkIndex];
      const offset = 24 + handIndex * 252 + landmarkIndex * 12;
      view.setFloat32(offset, clamp(landmark?.x, -4, 4), true);
      view.setFloat32(offset + 4, clamp(landmark?.y, -4, 4), true);
      view.setFloat32(offset + 8, clamp(landmark?.z, -4, 4), true);
    }
  }
  return packet;
}

function drawHands(context: CanvasRenderingContext2D, result: DetectionResult): void {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.lineWidth = Math.max(2, context.canvas.width / 240);
  context.strokeStyle = '#36f2a1';
  context.fillStyle = '#eef7ff';
  for (const landmarks of result.landmarks ?? []) {
    for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
      const start = landmarks[startIndex];
      const end = landmarks[endIndex];
      if (!start || !end) continue;
      context.beginPath();
      context.moveTo(start.x * context.canvas.width, start.y * context.canvas.height);
      context.lineTo(end.x * context.canvas.width, end.y * context.canvas.height);
      context.stroke();
    }
    for (const point of landmarks) {
      context.beginPath();
      context.arc(point.x * context.canvas.width, point.y * context.canvas.height, context.lineWidth, 0, Math.PI * 2);
      context.fill();
    }
  }
}

export function initPhoneTracking(
  sendPacket: (packet: ArrayBuffer) => boolean,
  sendMetrics: (metrics: PhoneTrackingMetricsEvent) => boolean,
): {
  setPeerConnected(connected: boolean): void;
  setModelOptions(options: HandTrackingOptions): void;
  setProcessing(processing: PhoneCameraProcessing): void;
} {
  const startButton = element<HTMLButtonElement>('remoteStartCamera');
  const preview = element<HTMLElement>('remoteTrackingPreview');
  const video = element<HTMLVideoElement>('remoteVideo');
  const canvas = element<HTMLCanvasElement>('remoteCanvas');
  const trackingStatus = element<HTMLElement>('remoteTrackingStatus');
  const cameraNext = element<HTMLElement>('remoteCameraNext');
  const privacy = element<HTMLElement>('remoteCameraPrivacy');
  const context = canvas.getContext('2d');
  let peerConnected = false;
  let started = false;
  let starting = false;
  let activeStream: MediaStream | null = null;
  let animationFrame: number | null = null;
  let videoFrameCallback: number | null = null;
  let startAttempt = 0;
  let sequence = 0;
  let lastDetectionAt = -Infinity;
  let lastCameraFrameAt = -Infinity;
  let metricsStartedAt = performance.now();
  let metricsSamples = 0;
  let detectionMsTotal = 0;
  let encodeMsTotal = 0;
  let captureAgeMsTotal = 0;
  let captureAgeSamples = 0;
  let sentPackets = 0;
  let droppedPackets = 0;
  let modelOptions = { ...DEFAULT_HAND_TRACKING_OPTIONS };
  let processing: PhoneCameraProcessing = 'phone';
  let frameEncoding = false;
  const frameCanvas = document.createElement('canvas');
  const frameContext = frameCanvas.getContext('2d', { alpha: false });

  function stopCamera(): void {
    starting = false;
    started = false;
    startAttempt++;
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    if (videoFrameCallback !== null) {
      video.cancelVideoFrameCallback(videoFrameCallback);
      videoFrameCallback = null;
    }
    activeStream?.getTracks().forEach(track => track.stop());
    activeStream = null;
    video.srcObject = null;
    frameEncoding = false;
    preview.hidden = true;
    context?.clearRect(0, 0, canvas.width, canvas.height);
    startButton.disabled = !peerConnected;
  }

  startButton.addEventListener('click', () => void (async () => {
    if (started || !peerConnected || !context) return;
    const attempt = ++startAttempt;
    starting = true;
    startButton.disabled = true;
    trackingStatus.textContent = t('remoteTracking.loadingTracker');
    preview.hidden = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
      });
      if (attempt !== startAttempt || !peerConnected) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      activeStream = stream;
      video.srcObject = stream;
      await video.play();
      if (attempt !== startAttempt || !peerConnected) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const watchVideoFrame: VideoFrameRequestCallback = frameNow => {
        lastCameraFrameAt = frameNow;
        if (started && attempt === startAttempt) {
          videoFrameCallback = video.requestVideoFrameCallback(watchVideoFrame);
        }
      };

      if (processing === 'computer') {
        if (!frameContext) throw new Error('CAMERA_FRAME_CANVAS_UNAVAILABLE');
        const sourceWidth = video.videoWidth || 640;
        const sourceHeight = video.videoHeight || 480;
        const scale = Math.min(320 / sourceWidth, 240 / sourceHeight);
        frameCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
        frameCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
        starting = false;
        started = true;
        trackingStatus.textContent = t('remoteTracking.streamingCameraToComputer');
        if ('requestVideoFrameCallback' in video) {
          videoFrameCallback = video.requestVideoFrameCallback(watchVideoFrame);
        }
        const streamFrame = (now: number): void => {
          if (!started || attempt !== startAttempt) return;
          if (peerConnected && !frameEncoding && now - lastDetectionAt >= 1000 / 15) {
            lastDetectionAt = now;
            frameEncoding = true;
            const encodeStartedAt = performance.now();
            const sentAtEpochMs = Date.now();
            frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
            frameCanvas.toBlob(blob => {
              void (async () => {
                try {
                  if (!blob || !started || attempt !== startAttempt || processing !== 'computer') {
                    droppedPackets++;
                    return;
                  }
                  const jpeg = new Uint8Array(await blob.arrayBuffer());
                  const packet = encodePhoneCameraFrame({
                    sequence: sequence++,
                    sentAtEpochMs,
                    width: frameCanvas.width,
                    height: frameCanvas.height,
                    jpeg,
                  });
                  if (packet && sendPacket(packet)) sentPackets++;
                  else droppedPackets++;
                  metricsSamples++;
                  encodeMsTotal += performance.now() - encodeStartedAt;
                  if (Number.isFinite(lastCameraFrameAt)) {
                    captureAgeMsTotal += Math.max(0, encodeStartedAt - lastCameraFrameAt);
                    captureAgeSamples++;
                  }
                  const encodedAt = performance.now();
                  if (encodedAt - metricsStartedAt >= 1_000) {
                    sendMetrics({
                      v: 1,
                      type: 'tracking-metrics',
                      captureAgeMs: captureAgeSamples ? captureAgeMsTotal / captureAgeSamples : null,
                      detectionMs: 0,
                      encodeMs: metricsSamples ? encodeMsTotal / metricsSamples : 0,
                      bufferedBytes: 0,
                      sentPackets,
                      droppedPackets,
                    });
                    metricsStartedAt = encodedAt;
                    metricsSamples = 0;
                    encodeMsTotal = 0;
                    captureAgeMsTotal = 0;
                    captureAgeSamples = 0;
                    sentPackets = 0;
                    droppedPackets = 0;
                  }
                } catch {
                  droppedPackets++;
                } finally {
                  frameEncoding = false;
                }
              })();
            }, 'image/jpeg', 0.58);
          }
          animationFrame = requestAnimationFrame(streamFrame);
        };
        animationFrame = requestAnimationFrame(streamFrame);
        return;
      }
      const visionModule = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js' as string
      );
      const vision = await visionModule.FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
      const landmarker = await visionModule.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: modelOptions.handDetectionConfidence,
        minHandPresenceConfidence: modelOptions.handPresenceConfidence,
        minTrackingConfidence: modelOptions.handTrackingConfidence,
      }) as HandLandmarker;
      if (attempt !== startAttempt || !peerConnected) return;
      starting = false;
      started = true;
      trackingStatus.textContent = t('remoteTracking.trackingActive');
      if ('requestVideoFrameCallback' in video) {
        videoFrameCallback = video.requestVideoFrameCallback(watchVideoFrame);
      }
      const detect = (now: number): void => {
        if (!started || attempt !== startAttempt) return;
        try {
          if (peerConnected && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastDetectionAt >= 33) {
            lastDetectionAt = now;
            const detectionStartedAt = performance.now();
            const result = landmarker.detectForVideo(video, now);
            const detectionFinishedAt = performance.now();
            drawHands(context, result);
            const packet = encodeLandmarks(result, sequence++, Date.now());
            const encodedAt = performance.now();
            if (sendPacket(packet)) sentPackets++;
            else droppedPackets++;
            metricsSamples++;
            detectionMsTotal += detectionFinishedAt - detectionStartedAt;
            encodeMsTotal += encodedAt - detectionFinishedAt;
            if (Number.isFinite(lastCameraFrameAt)) {
              captureAgeMsTotal += Math.max(0, detectionStartedAt - lastCameraFrameAt);
              captureAgeSamples++;
            }
            if (encodedAt - metricsStartedAt >= 1_000) {
              sendMetrics({
                v: 1,
                type: 'tracking-metrics',
                captureAgeMs: captureAgeSamples ? captureAgeMsTotal / captureAgeSamples : null,
                detectionMs: metricsSamples ? detectionMsTotal / metricsSamples : 0,
                encodeMs: metricsSamples ? encodeMsTotal / metricsSamples : 0,
                bufferedBytes: 0,
                sentPackets,
                droppedPackets,
              });
              metricsStartedAt = encodedAt;
              metricsSamples = 0;
              detectionMsTotal = 0;
              encodeMsTotal = 0;
              captureAgeMsTotal = 0;
              captureAgeSamples = 0;
              sentPackets = 0;
              droppedPackets = 0;
            }
          }
          animationFrame = requestAnimationFrame(detect);
        } catch (error) {
          console.error('Phone hand tracking failed:', error);
          stopCamera();
          trackingStatus.textContent = t('remoteTracking.cameraFailed');
          window.dispatchEvent(new CustomEvent('hand-sabers:phone-tracking-error', {
            detail: t('remoteTracking.cameraFailed'),
          }));
        }
      };
      animationFrame = requestAnimationFrame(detect);
    } catch {
      if (attempt !== startAttempt) return;
      stopCamera();
      trackingStatus.textContent = t('remoteTracking.cameraFailed');
      window.dispatchEvent(new CustomEvent('hand-sabers:phone-tracking-error', {
        detail: t('remoteTracking.cameraFailed'),
      }));
    }
  })());

  return {
    setPeerConnected(connected: boolean): void {
      peerConnected = connected;
      if (!connected) {
        const wasTracking = starting || started || activeStream !== null;
        stopCamera();
        if (wasTracking) trackingStatus.textContent = t('remoteTracking.trackingPaused');
        return;
      }
      startButton.disabled = started;
      if (started) trackingStatus.textContent = t('remoteTracking.trackingActive');
    },
    setModelOptions(options: HandTrackingOptions): void {
      modelOptions = { ...options };
    },
    setProcessing(nextProcessing: PhoneCameraProcessing): void {
      if (processing === nextProcessing) return;
      processing = nextProcessing;
      if (starting || started || activeStream) stopCamera();
      trackingStatus.textContent = t(nextProcessing === 'computer'
        ? 'remoteTracking.computerProcessingReady'
        : 'remoteTracking.phoneProcessingReady');
      cameraNext.textContent = t(nextProcessing === 'computer'
        ? 'remoteTracking.cameraNextComputer'
        : 'remoteTracking.cameraNext');
      privacy.textContent = t(nextProcessing === 'computer'
        ? 'remoteTracking.privacyComputer'
        : 'remoteTracking.privacy');
    },
  };
}
