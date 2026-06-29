const video = document.getElementById('cameraVideo') as HTMLVideoElement;
const previewFrame = video.closest('.preview-frame') as HTMLElement;
const sampleCanvas = document.getElementById('sampleCanvas') as HTMLCanvasElement;
const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
const cameraSelect = document.getElementById('cameraSelect') as HTMLSelectElement;
const startButton = document.getElementById('startCamera') as HTMLButtonElement;
const stopButton = document.getElementById('stopCamera') as HTMLButtonElement;
const previewEmpty = document.getElementById('previewEmpty') as HTMLElement;
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

let stream: MediaStream | null = null;
let frameRequest = 0;
let lastFrameCountAt = 0;
let frameCount = 0;
let lastLightSampleAt = 0;

function setStatus(state: 'idle' | 'loading' | 'ready' | 'error', text: string): void {
  cameraStatus.dataset['state'] = state;
  cameraStatusText.textContent = text;
}

function setMetricState(element: HTMLElement, state: 'good' | 'warn' | 'bad' | null): void {
  delete element.dataset['state'];
  if (state) element.dataset['state'] = state;
}

function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Brak dostępu do kamery. Zezwól na użycie kamery w ustawieniach witryny.';
  }
  if (name === 'NotFoundError') return 'Nie znaleziono kamery podłączonej do urządzenia.';
  if (name === 'NotReadableError') return 'Kamera jest zajęta przez inną aplikację lub kartę.';
  if (name === 'OverconstrainedError') return 'Wybrana kamera nie obsługuje wymaganych parametrów.';
  return 'Nie udało się uruchomić kamery. Sprawdź urządzenie i spróbuj ponownie.';
}

async function updatePermission(): Promise<void> {
  if (!navigator.permissions?.query) return;
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    const render = () => {
      const labels = { granted: 'PRZYZNANE', denied: 'ZABLOKOWANE', prompt: 'OCZEKUJE' };
      permissionMetric.textContent = labels[status.state];
      setMetricState(permissionMetric, status.state === 'granted' ? 'good' : status.state === 'denied' ? 'bad' : 'warn');
    };
    render();
    status.addEventListener('change', render);
  } catch {
    // Some browsers expose Permissions API without supporting the camera name.
  }
}

async function populateCameraList(selectedDeviceId = ''): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
  cameraSelect.replaceChildren();
  if (!devices.length) {
    cameraSelect.add(new Option('Brak wykrytych kamer', ''));
    return;
  }
  devices.forEach((device, index) => {
    cameraSelect.add(new Option(device.label || `Kamera ${index + 1}`, device.deviceId));
  });
  if (selectedDeviceId && devices.some(device => device.deviceId === selectedDeviceId)) {
    cameraSelect.value = selectedDeviceId;
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
    lightMetric.textContent = 'ZA CIEMNO';
    lightHint.textContent = 'Dodaj światło przed sobą';
    setMetricState(lightMetric, 'bad');
  } else if (average > 215) {
    lightMetric.textContent = 'ZA JASNO';
    lightHint.textContent = 'Ogranicz prześwietlenie obrazu';
    setMetricState(lightMetric, 'warn');
  } else {
    lightMetric.textContent = 'DOBRE';
    lightHint.textContent = `Średnia jasność: ${Math.round(average)} / 255`;
    setMetricState(lightMetric, 'good');
  }
}

function updateFrameMetrics(now: number): void {
  if (!stream) return;
  frameCount++;
  if (now - lastFrameCountAt >= 1000) {
    const elapsed = Math.max(1, now - lastFrameCountAt);
    const fps = Math.round(frameCount * 1000 / elapsed);
    fpsMetric.textContent = `${fps} FPS`;
    fpsHint.textContent = fps >= 24 ? 'Płynność wystarczająca do śledzenia' : 'Zamknij inne aplikacje używające kamery';
    setMetricState(fpsMetric, fps >= 24 ? 'good' : fps >= 18 ? 'warn' : 'bad');
    frameCount = 0;
    lastFrameCountAt = now;
  }
  if (now - lastLightSampleAt >= 500) {
    sampleLight();
    lastLightSampleAt = now;
  }
  frameRequest = video.requestVideoFrameCallback(updateFrameMetrics);
}

function resetMetrics(): void {
  previewResolution.textContent = '—';
  resolutionMetric.textContent = '—';
  fpsMetric.textContent = '—';
  lightMetric.textContent = '—';
  resolutionHint.textContent = 'Oczekiwane minimum: 640×360';
  fpsHint.textContent = 'Oczekiwane minimum: 24 FPS';
  lightHint.textContent = 'Stań przodem do źródła światła';
  [resolutionMetric, fpsMetric, lightMetric].forEach(metric => setMetricState(metric, null));
}

function stopCamera(): void {
  if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
  frameRequest = 0;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  previewFrame.classList.remove('is-active');
  previewEmpty.hidden = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  cameraSelect.disabled = false;
  setStatus('idle', 'KAMERA ZATRZYMANA');
  diagnosticMessage.textContent = 'Test nie wysyła obrazu poza urządzenie.';
  resetMetrics();
}

async function startCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('error', 'BRAK OBSŁUGI KAMERY');
    diagnosticMessage.textContent = 'Ta przeglądarka nie udostępnia API kamery.';
    return;
  }

  stopCamera();
  startButton.disabled = true;
  cameraSelect.disabled = true;
  setStatus('loading', 'URUCHAMIANIE KAMERY');
  diagnosticMessage.textContent = 'Czekam na dostęp do urządzenia…';

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
    const resolution = `${width}×${height}`;
    const resolutionGood = width >= 640 && height >= 360;
    previewResolution.textContent = resolution;
    resolutionMetric.textContent = resolution;
    resolutionHint.textContent = resolutionGood ? 'Rozdzielczość wystarczająca' : 'Wybierz kamerę o wyższej rozdzielczości';
    setMetricState(resolutionMetric, resolutionGood ? 'good' : 'bad');

    await populateCameraList(settings.deviceId);
    previewFrame.classList.add('is-active');
    previewEmpty.hidden = true;
    stopButton.disabled = false;
    cameraSelect.disabled = false;
    setStatus('ready', 'KAMERA DZIAŁA');
    diagnosticMessage.textContent = 'Porusz dłońmi w całym obszarze kadru i sprawdź płynność obrazu.';
    lastFrameCountAt = performance.now();
    lastLightSampleAt = 0;
    frameCount = 0;
    frameRequest = video.requestVideoFrameCallback(updateFrameMetrics);
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    startButton.disabled = false;
    cameraSelect.disabled = false;
    setStatus('error', 'BŁĄD KAMERY');
    diagnosticMessage.textContent = describeCameraError(error);
    await updatePermission();
  }
}

startButton.addEventListener('click', () => void startCamera());
stopButton.addEventListener('click', stopCamera);
cameraSelect.addEventListener('change', () => {
  if (stream) void startCamera();
});
navigator.mediaDevices?.addEventListener('devicechange', () => void populateCameraList(cameraSelect.value));
window.addEventListener('pagehide', stopCamera);

void updatePermission();
void populateCameraList();
