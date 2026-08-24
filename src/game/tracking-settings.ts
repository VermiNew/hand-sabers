import { setSetting } from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import { isRemoteTrackingConnected } from '../remote/host-pairing.ts';
import {
  applyTrackingSettings,
  setAutoFlipSuggestionHandler,
} from '../tracking/tracking.ts';
import { bindStyledRange } from '../ui/settings-range.ts';
import type { Settings, TrackingSourcePreference } from '../types/index.js';

interface TrackingSettingsOptions {
  onSourceChange(changed: boolean): void;
}

type HandModelSettingKey = 'handDetectionConfidence' | 'handPresenceConfidence' | 'handTrackingConfidence';

export interface TrackingSettingsController {
  sync(): void;
  updateSourceHint(): void;
}

export function initTrackingSettings(
  settings: Settings,
  { onSourceChange }: TrackingSettingsOptions,
): TrackingSettingsController {
  const sourceInput = document.getElementById('menuTrackingSource') as HTMLSelectElement | null;
  const sourceHint = document.getElementById('menuTrackingSourceHint');
  const flipCameraInput = document.getElementById('menuFlipCamera') as HTMLInputElement | null;
  const modelInputs: Array<[HandModelSettingKey, HTMLInputElement | null]> = [
    ['handDetectionConfidence', document.getElementById('menuHandDetectionConfidence') as HTMLInputElement | null],
    ['handPresenceConfidence', document.getElementById('menuHandPresenceConfidence') as HTMLInputElement | null],
    ['handTrackingConfidence', document.getElementById('menuHandTrackingConfidence') as HTMLInputElement | null],
  ];

  function updateSourceHint(): void {
    if (!sourceHint) return;
    const source = settings.trackingSource;
    const connected = isRemoteTrackingConnected();
    const key = source === 'camera'
      ? 'remoteTracking.sourceCameraHint'
      : source === 'phone'
        ? connected ? 'remoteTracking.sourcePhoneReady' : 'remoteTracking.sourcePhoneMissing'
        : connected ? 'remoteTracking.sourceAutoPhone' : 'remoteTracking.sourceAutoCamera';
    sourceHint.textContent = t(key);
    sourceHint.classList.toggle('is-error', source === 'phone' && !connected);
  }

  sourceInput?.addEventListener('change', () => {
    const value = sourceInput.value as TrackingSourcePreference;
    const changed = settings.trackingSource !== value;
    settings.trackingSource = value;
    setSetting('trackingSource', value);
    onSourceChange(changed);
    updateSourceHint();
  });

  flipCameraInput?.addEventListener('change', () => {
    settings.flipCamera = flipCameraInput.checked;
    window.__trackingFlip = flipCameraInput.checked;
    setSetting('flipCamera', flipCameraInput.checked);
    applyTrackingSettings({ flipCamera: flipCameraInput.checked });
  });

  for (const [key, input] of modelInputs) {
    if (!input) continue;
    input.value = String(settings[key]);
    bindStyledRange(input);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      settings[key] = value;
      setSetting(key, value);
    });
  }

  setAutoFlipSuggestionHandler(({ flipCamera }) => {
    settings.flipCamera = flipCamera;
    window.__trackingFlip = flipCamera;
    setSetting('flipCamera', flipCamera);
    if (flipCameraInput) flipCameraInput.checked = flipCamera;
  });

  window.addEventListener('hand-sabers:remote-tracking-state', updateSourceHint);

  function sync(): void {
    if (sourceInput) sourceInput.value = settings.trackingSource;
    if (flipCameraInput) flipCameraInput.checked = settings.flipCamera;
    for (const [key, input] of modelInputs) {
      if (!input) continue;
      input.value = String(settings[key]);
      input.dispatchEvent(new Event('input'));
    }
    window.__trackingSensitivity = settings.sensitivity;
    window.__trackingFlip = settings.flipCamera;
    applyTrackingSettings(settings);
    updateSourceHint();
  }

  sync();
  return { sync, updateSourceHint };
}
