import { getSettings } from '../core/settings.ts';
import { t } from '../i18n/index.ts';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type ModelLoadProgress = (message: string, detail: string, ratio: number | null) => void;

function formatMegabytes(bytes: number): string {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}

async function downloadModel(onProgress: ModelLoadProgress): Promise<Uint8Array> {
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

// MediaPipe's CDN module does not expose local TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadHandLandmarker(onProgress: ModelLoadProgress): Promise<any> {
  onProgress(t('overlay.loadingRuntime'), t('overlay.loadingRuntimeDetail'), 0.1);
  const { HandLandmarker, FilesetResolver } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js' as string
  );
  onProgress(t('overlay.initializingResolver'), t('overlay.initializingResolverDetail'), 0.35);
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
  const modelAssetBuffer = await downloadModel(onProgress);
  const settings = getSettings();
  onProgress(t('overlay.loadingLandmarker'), t('overlay.initializingLandmarkerDetail'), 1);
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: settings.handDetectionConfidence,
    minHandPresenceConfidence: settings.handPresenceConfidence,
    minTrackingConfidence: settings.handTrackingConfidence,
  });
  onProgress(t('overlay.modelReady'), t('overlay.modelReadyDetail'), 1);
  return handLandmarker;
}
