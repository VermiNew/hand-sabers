import { t, translateDom } from './i18n/index.ts';
import { loadSettings, setSetting } from './core/settings.ts';
import { initRemoteTrackingHost, isRemoteTrackingConnected } from './remote/host-session.ts';
import { decodeRemoteLandmarks } from './tracking/realtime.ts';
import type { TrackingSourcePreference } from './types/index.ts';
import { initPageInterfaceSounds } from './ui/interface-sounds.ts';

translateDom();
initPageInterfaceSounds();
initRemoteTrackingHost();
document.title = t('cameraDiagnostics.pageTitle');

const video = document.getElementById('cameraVideo') as HTMLVideoElement;
const previewFrame = video.closest('.preview-frame') as HTMLElement;
const previewTitle = document.getElementById('previewTitle') as HTMLElement;
const remoteTrackingCanvas = document.getElementById('remoteTrackingCanvas') as HTMLCanvasElement;
const remoteTrackingContext = remoteTrackingCanvas.getContext('2d');
const sampleCanvas = document.getElementById('sampleCanvas') as HTMLCanvasElement;
const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
const trackingSource = document.getElementById('trackingSource') as HTMLSelectElement;
const trackingSourcePhone = document.getElementById('trackingSourcePhone') as HTMLOptionElement;
const trackingSourceHint = document.getElementById('trackingSourceHint') as HTMLElement;
const cameraDeviceSection = document.getElementById('cameraDeviceSection') as HTMLElement;
const cameraSelect = document.getElementById('cameraSelect') as HTMLSelectElement;
const startButton = document.getElementById('startCamera') as HTMLButtonElement;
const startButtonText = document.getElementById('startCameraText') as HTMLElement;
const stopButton = document.getElementById('stopCamera') as HTMLButtonElement;
const previewEmpty = document.getElementById('previewEmpty') as HTMLElement;
const previewEmptyIcon = document.getElementById('previewEmptyIcon') as HTMLElement;
const previewEmptyText = document.getElementById('previewEmptyText') as HTMLElement;
const cameraStatus = document.getElementById('cameraStatus') as HTMLElement;
const cameraStatusText = document.getElementById('cameraStatusText') as HTMLElement;
const previewResolution = document.getElementById('previewResolution') as HTMLElement;
const resolutionMetric = document.getElementById('resolutionMetric') as HTMLElement;
const resolutionHint = document.getElementById('resolutionHint') as HTMLElement;
const fpsMetric = document.getElementById('fpsMetric') as HTMLElement;
const fpsHint = document.getElementById('fpsHint') as HTMLElement;
const lightMetric = document.getElementById('lightMetric') as HTMLElement;
const lightHint = document.getElementById('lightHint') as HTMLElement;
const permissionMetric = document.getElementById('permissionMetric') as HTMLElement;
const diagnosticMessage = document.getElementById('diagnosticMessage') as HTMLElement;
const settings = loadSettings();

let stream: MediaStream | null = null;
let frameRequest = 0;
let lastFrameCountAt = 0;
let frameCount = 0;
let lastLightSampleAt = 0;
let testRequested = false;
let activeSource: 'camera' | 'phone' | null = null;
let remoteFrameCount = 0;
let remoteFrameCountAt = 0;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
] as const;

function setStatus(state: 'idle' | 'loading' | 'ready' | 'error', key: string): void {
  cameraStatus.dataset['state'] = state;
  cameraStatusText.textContent = t(key);
}

function setMetricState(element: HTMLElement, state: 'good' | 'warn' | 'bad' | null): void {
  delete element.dataset['state'];
  if (state) element.dataset['state'] = state;
}

function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return t('cameraDiagnostics.errorPermission');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('cameraDiagnostics.errorNotFound');
  if (name === 'NotReadableError') return t('cameraDiagnostics.errorBusy');
  const message = error instanceof Error ? error.message : String(error);
  return t('cameraDiagnostics.errorGeneric', { message });
}

async function updatePermission(): Promise<void> {
  if (!navigator.permissions?.query) {
    permissionMetric.textContent = t('cameraDiagnostics.unsupportedPermission');
    return;
  }
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    const render = () => {
      const key = status.state === 'granted'
        ? 'cameraDiagnostics.granted'
        : status.state === 'denied'
          ? 'cameraDiagnostics.deniedPermission'
          : 'cameraDiagnostics.promptPermission';
      permissionMetric.textContent = t(key);
      setMetricState(permissionMetric, status.state === 'granted' ? 'good' : status.state === 'denied' ? 'bad' : 'warn');
    };
    render();
    status.addEventListener('change', render);
  } catch {
    permissionMetric.textContent = t('cameraDiagnostics.unsupportedPermission');
  }
}

async function populateCameraList(selectedDeviceId = ''): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
    cameraSelect.replaceChildren();
    if (!devices.length) {
      cameraSelect.add(new Option(t('cameraDiagnostics.noCamera'), ''));
      return;
    }
    devices.forEach((device, index) => {
      cameraSelect.add(new Option(device.label || `${t('cameraDiagnostics.selectCamera')} ${index + 1}`, device.deviceId));
    });
    if (selectedDeviceId && devices.some(device => device.deviceId === selectedDeviceId)) cameraSelect.value = selectedDeviceId;
  } catch (error) {
    console.error('Camera enumeration failed:', error);
    cameraSelect.replaceChildren(new Option(t('cameraDiagnostics.listFailed'), ''));
    diagnosticMessage.textContent = t('cameraDiagnostics.listFailedHint');
  }
}

function sampleLight(): void {
  if (!sampleContext || !video.videoWidth || !video.videoHeight) return;
  sampleContext.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const pixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  let luminance = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    luminance += 0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!;
  }
  const average = luminance / (pixels.length / 4);
  if (average < 45) {
    lightMetric.textContent = t('cameraDiagnostics.brightnessDark');
    lightHint.textContent = t('cameraDiagnostics.lightAdd');
    setMetricState(lightMetric, 'bad');
  } else if (average > 215) {
    lightMetric.textContent = t('cameraDiagnostics.brightnessBright');
    lightHint.textContent = t('cameraDiagnostics.lightReduce');
    setMetricState(lightMetric, 'warn');
  } else {
    lightMetric.textContent = t('cameraDiagnostics.brightnessGood');
    lightHint.textContent = t('cameraDiagnostics.brightnessAverage', { value: Math.round(average) });
    setMetricState(lightMetric, 'good');
  }
}

function updateFrameMetrics(now: number): void {
  if (!stream) return;
  try {
    frameCount++;
    if (now - lastFrameCountAt >= 1000) {
      const elapsed = Math.max(1, now - lastFrameCountAt);
      const fps = Math.round(frameCount * 1000 / elapsed);
      fpsMetric.textContent = t('cameraDiagnostics.fpsValue', { value: fps });
      fpsHint.textContent = t(fps >= 24 ? 'cameraDiagnostics.fpsGood' : 'cameraDiagnostics.fpsBad');
      setMetricState(fpsMetric, fps >= 24 ? 'good' : fps >= 18 ? 'warn' : 'bad');
      frameCount = 0;
      lastFrameCountAt = now;
    }
    if (now - lastLightSampleAt >= 500) {
      sampleLight();
      lastLightSampleAt = now;
    }
  } catch (error) {
    console.error('Camera metrics update failed:', error);
    diagnosticMessage.textContent = t('cameraDiagnostics.metricsFailed');
  }
  if (stream) frameRequest = video.requestVideoFrameCallback(updateFrameMetrics);
}

function resetMetrics(): void {
  previewResolution.textContent = '—';
  resolutionMetric.textContent = '—';
  fpsMetric.textContent = '—';
  lightMetric.textContent = '—';
  resolutionHint.textContent = t('cameraDiagnostics.resolutionMin');
  fpsHint.textContent = t('cameraDiagnostics.fpsMin');
  lightHint.textContent = t('cameraDiagnostics.lightFacing');
  [resolutionMetric, fpsMetric, lightMetric].forEach(metric => setMetricState(metric, null));
}

function usesPhone(source = trackingSource.value as TrackingSourcePreference): boolean {
  return isRemoteTrackingConnected() && (source === 'phone' || source === 'auto');
}

function stopActiveMedia(): void {
  if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
  frameRequest = 0;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  remoteTrackingContext?.clearRect(0, 0, remoteTrackingCanvas.width, remoteTrackingCanvas.height);
  remoteTrackingCanvas.hidden = true;
  activeSource = null;
}

function stopTest(): void {
  testRequested = false;
  stopActiveMedia();
  previewFrame.classList.remove('is-active');
  previewEmpty.hidden = false;
  previewEmptyIcon.textContent = 'videocam_off';
  previewEmptyText.textContent = t('cameraDiagnostics.startHint');
  previewTitle.textContent = t('cameraDiagnostics.rawImage');
  startButton.disabled = false;
  stopButton.disabled = true;
  cameraSelect.disabled = false;
  setStatus('idle', 'cameraDiagnostics.stopped');
  diagnosticMessage.textContent = t('cameraDiagnostics.privacy');
  resetMetrics();
}

function drawRemoteHands(packet: ArrayBuffer): void {
  if (activeSource !== 'phone' || !testRequested || !remoteTrackingContext) return;
  const result = decodeRemoteLandmarks(packet);
  if (!result) return;

  const context = remoteTrackingContext;
  const { width, height } = remoteTrackingCanvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#020712';
  context.fillRect(0, 0, width, height);
  context.lineWidth = 4;
  context.lineCap = 'round';

  for (const [handIndex, landmarks] of (result.landmarks ?? []).entries()) {
    const color = handIndex === 0 ? '#36f2a1' : '#2f7cff';
    context.strokeStyle = color;
    context.fillStyle = color;
    for (const [from, to] of HAND_CONNECTIONS) {
      const start = landmarks[from];
      const end = landmarks[to];
      if (!start || !end) continue;
      context.beginPath();
      context.moveTo(start.x * width, start.y * height);
      context.lineTo(end.x * width, end.y * height);
      context.stroke();
    }
    for (const landmark of landmarks) {
      context.beginPath();
      context.arc(landmark.x * width, landmark.y * height, 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  const handCount = result.landmarks?.length ?? 0;
  previewResolution.textContent = t('cameraDiagnostics.phoneHands', { count: handCount });
  resolutionMetric.textContent = t('cameraDiagnostics.phonePoints', { count: handCount * 21 });
  remoteFrameCount++;
  const now = performance.now();
  if (now - remoteFrameCountAt >= 1000) {
    const fps = Math.round(remoteFrameCount * 1000 / Math.max(1, now - remoteFrameCountAt));
    fpsMetric.textContent = t('cameraDiagnostics.fpsValue', { value: fps });
    fpsHint.textContent = t(fps >= 24 ? 'cameraDiagnostics.fpsGood' : 'cameraDiagnostics.phoneFpsBad');
    setMetricState(fpsMetric, fps >= 24 ? 'good' : fps >= 18 ? 'warn' : 'bad');
    remoteFrameCount = 0;
    remoteFrameCountAt = now;
  }
}

function startPhoneTest(): void {
  stopActiveMedia();
  activeSource = 'phone';
  remoteFrameCount = 0;
  remoteFrameCountAt = performance.now();
  remoteTrackingCanvas.hidden = false;
  previewFrame.classList.add('is-active');
  previewEmpty.hidden = true;
  previewTitle.textContent = t('cameraDiagnostics.phonePreview');
  previewResolution.textContent = t('cameraDiagnostics.phoneWaiting');
  resolutionMetric.textContent = '—';
  resolutionHint.textContent = t('cameraDiagnostics.phoneProcessed');
  fpsMetric.textContent = '—';
  fpsHint.textContent = t('cameraDiagnostics.phoneFpsWaiting');
  lightMetric.textContent = t('cameraDiagnostics.notApplicable');
  lightHint.textContent = t('cameraDiagnostics.phoneProcessed');
  permissionMetric.textContent = t('cameraDiagnostics.phonePermission');
  [resolutionMetric, fpsMetric].forEach(metric => setMetricState(metric, null));
  setMetricState(lightMetric, null);
  setMetricState(permissionMetric, 'good');
  startButton.disabled = true;
  stopButton.disabled = false;
  cameraSelect.disabled = true;
  setStatus('ready', 'cameraDiagnostics.phoneActive');
  diagnosticMessage.textContent = t('cameraDiagnostics.phoneMovingHint');
}

async function startCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('error', 'cameraDiagnostics.unavailable');
    diagnosticMessage.textContent = t('cameraDiagnostics.noApi');
    return;
  }

  stopActiveMedia();
  activeSource = 'camera';
  previewTitle.textContent = t('cameraDiagnostics.rawImage');
  resetMetrics();
  void updatePermission();
  startButton.disabled = true;
  cameraSelect.disabled = true;
  setStatus('loading', 'cameraDiagnostics.requesting');
  diagnosticMessage.textContent = t('cameraDiagnostics.requesting');

  try {
    const deviceId = cameraSelect.value;
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, min: 20 },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    const track = stream.getVideoTracks()[0]!;
    const settings = track.getSettings();
    const width = settings.width ?? video.videoWidth;
    const height = settings.height ?? video.videoHeight;
    const resolution = t('cameraDiagnostics.resolutionValue', { width, height });
    const resolutionGood = width >= 640 && height >= 360;
    previewResolution.textContent = resolution;
    resolutionMetric.textContent = resolution;
    resolutionHint.textContent = t(resolutionGood ? 'cameraDiagnostics.resolutionGood' : 'cameraDiagnostics.resolutionBad');
    setMetricState(resolutionMetric, resolutionGood ? 'good' : 'bad');

    await populateCameraList(settings.deviceId);
    previewFrame.classList.add('is-active');
    previewEmpty.hidden = true;
    stopButton.disabled = false;
    cameraSelect.disabled = false;
    setStatus('ready', 'cameraDiagnostics.active');
    diagnosticMessage.textContent = t('cameraDiagnostics.movingHint');
    lastFrameCountAt = performance.now();
    lastLightSampleAt = 0;
    frameCount = 0;
    frameRequest = video.requestVideoFrameCallback(updateFrameMetrics);
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    activeSource = null;
    testRequested = false;
    startButton.disabled = false;
    cameraSelect.disabled = false;
    setStatus('error', 'cameraDiagnostics.denied');
    diagnosticMessage.textContent = describeCameraError(error);
    await updatePermission();
  }
}

function updateSourceUi(): void {
  const connected = isRemoteTrackingConnected();
  trackingSourcePhone.disabled = !connected;
  if (!connected && trackingSource.value === 'phone') {
    trackingSource.value = 'auto';
    setSetting('trackingSource', 'auto');
  }

  const source = trackingSource.value as TrackingSourcePreference;
  const phoneActive = usesPhone(source);
  const hintKey = source === 'camera'
    ? 'cameraDiagnostics.sourcePcHint'
    : source === 'phone'
      ? 'cameraDiagnostics.sourcePhoneReady'
      : connected ? 'cameraDiagnostics.sourceAutoPhone' : 'cameraDiagnostics.sourceAutoPc';
  trackingSourceHint.textContent = t(hintKey);
  cameraDeviceSection.hidden = phoneActive;
  startButtonText.textContent = t(phoneActive ? 'cameraDiagnostics.startPhone' : 'cameraDiagnostics.start');
}

function startSelectedTest(): void {
  if (usesPhone()) startPhoneTest();
  else void startCamera();
}

function handleRemoteState(): void {
  const wasPhoneActive = activeSource === 'phone';
  updateSourceUi();
  if (!testRequested) return;
  const shouldUsePhone = usesPhone();
  if (shouldUsePhone && !wasPhoneActive) startPhoneTest();
  else if (!shouldUsePhone && wasPhoneActive) void startCamera();
}

startButton.addEventListener('click', () => {
  testRequested = true;
  startSelectedTest();
});
stopButton.addEventListener('click', stopTest);
trackingSource.addEventListener('change', () => {
  const source = trackingSource.value as TrackingSourcePreference;
  if (source === 'phone' && !isRemoteTrackingConnected()) {
    trackingSource.value = 'auto';
  }
  setSetting('trackingSource', trackingSource.value as TrackingSourcePreference);
  updateSourceUi();
  if (testRequested) startSelectedTest();
});
cameraSelect.addEventListener('change', () => {
  if (activeSource === 'camera' && stream) void startCamera();
});
navigator.mediaDevices?.addEventListener('devicechange', () => void populateCameraList(cameraSelect.value));
window.addEventListener('hand-sabers:remote-tracking-state', handleRemoteState);
window.addEventListener('hand-sabers:remote-tracking-packet', event => {
  drawRemoteHands((event as CustomEvent<ArrayBuffer>).detail);
});
window.addEventListener('pagehide', stopActiveMedia);

trackingSource.value = settings.trackingSource;
updateSourceUi();
void updatePermission();
void populateCameraList();
