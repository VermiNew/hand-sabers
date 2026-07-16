import { t } from '../i18n/index.ts';

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

function encodeLandmarks(result: DetectionResult, sequence: number, timestamp: number): ArrayBuffer {
  const hands = assignHands(result);
  const packet = new ArrayBuffer(528);
  const view = new DataView(packet);
  view.setUint8(0, 1);
  view.setUint8(1, 2);
  view.setUint8(2, (hands.left ? 1 : 0) | (hands.right ? 2 : 0));
  view.setUint32(4, sequence, true);
  view.setFloat64(8, timestamp, true);
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

export function initPhoneTracking(sendPacket: (packet: ArrayBuffer) => boolean): {
  setPeerConnected(connected: boolean): void;
} {
  const startButton = element<HTMLButtonElement>('remoteStartCamera');
  const preview = element<HTMLElement>('remoteTrackingPreview');
  const video = element<HTMLVideoElement>('remoteVideo');
  const canvas = element<HTMLCanvasElement>('remoteCanvas');
  const trackingStatus = element<HTMLElement>('remoteTrackingStatus');
  const context = canvas.getContext('2d');
  let peerConnected = false;
  let started = false;
  let sequence = 0;
  let lastDetectionAt = -Infinity;

  startButton.addEventListener('click', () => void (async () => {
    if (started || !peerConnected || !context) return;
    startButton.disabled = true;
    trackingStatus.textContent = t('remoteTracking.loadingTracker');
    preview.hidden = false;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
      });
      video.srcObject = stream;
      await video.play();
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const visionModule = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js' as string
      );
      const vision = await visionModule.FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
      const landmarker = await visionModule.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.42,
        minHandPresenceConfidence: 0.42,
        minTrackingConfidence: 0.42,
      }) as HandLandmarker;
      started = true;
      trackingStatus.textContent = t('remoteTracking.trackingActive');
      const detect = (now: number): void => {
        if (!started) return;
        if (peerConnected && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastDetectionAt >= 33) {
          lastDetectionAt = now;
          const result = landmarker.detectForVideo(video, now);
          drawHands(context, result);
          sendPacket(encodeLandmarks(result, sequence++, now));
        }
        requestAnimationFrame(detect);
      };
      requestAnimationFrame(detect);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      preview.hidden = true;
      startButton.disabled = !peerConnected;
      trackingStatus.textContent = t('remoteTracking.cameraFailed');
      window.dispatchEvent(new CustomEvent('hand-sabers:phone-tracking-error', {
        detail: t('remoteTracking.cameraFailed'),
      }));
    }
  })());

  return {
    setPeerConnected(connected: boolean): void {
      peerConnected = connected;
      startButton.disabled = started || !connected;
      if (started) trackingStatus.textContent = t(connected
        ? 'remoteTracking.trackingActive'
        : 'remoteTracking.trackingPaused');
    },
  };
}
