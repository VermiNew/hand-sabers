import { setSetting } from '../core/settings.ts';
import type { Settings } from '../types/index.js';
import { updateRangeProgress } from '../ui/settings-range.ts';
import { setScenePerformanceProfile } from './scene.ts';

export interface MusicReactiveSettingsController {
  sync(): void;
}

export function initMusicReactiveSettings(settings: Settings): MusicReactiveSettingsController {
  const enabledInput = document.getElementById('menuMusicReactive') as HTMLInputElement | null;
  const autoButton = document.getElementById('btnMusicIntensityAuto');
  const manualButton = document.getElementById('btnMusicIntensityManual');
  const manualRow = document.getElementById('menuMusicIntensityManualRow');
  const intensityInput = document.getElementById('menuMusicReactiveIntensity') as HTMLInputElement | null;
  const intensityValue = document.getElementById('menuMusicReactiveIntensityValue');

  function applyLiveSettings(): void {
    setScenePerformanceProfile(settings);
  }

  function updateIntensityMode(): void {
    const manual = settings.musicReactiveIntensityMode === 'manual';
    autoButton?.classList.toggle('is-active', !manual);
    manualButton?.classList.toggle('is-active', manual);
    autoButton?.setAttribute('aria-pressed', String(!manual));
    manualButton?.setAttribute('aria-pressed', String(manual));
    manualRow?.classList.toggle('is-hidden', !manual);
    if (intensityInput) intensityInput.disabled = !manual;
  }

  function setIntensityMode(mode: Settings['musicReactiveIntensityMode']): void {
    settings.musicReactiveIntensityMode = mode;
    setSetting('musicReactiveIntensityMode', mode);
    updateIntensityMode();
    applyLiveSettings();
  }

  enabledInput?.addEventListener('change', () => {
    settings.musicReactiveEnabled = enabledInput.checked;
    setSetting('musicReactiveEnabled', enabledInput.checked);
    applyLiveSettings();
  });

  autoButton?.addEventListener('click', () => setIntensityMode('auto'));
  manualButton?.addEventListener('click', () => setIntensityMode('manual'));
  intensityInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(1.5, Number(intensityInput.value)));
    settings.musicReactiveIntensity = value;
    setSetting('musicReactiveIntensity', value);
    updateRangeProgress(intensityInput);
    if (intensityValue) intensityValue.textContent = `${value.toFixed(1)}×`;
    applyLiveSettings();
  });

  function sync(): void {
    if (enabledInput) enabledInput.checked = settings.musicReactiveEnabled;
    if (intensityInput) {
      intensityInput.value = String(settings.musicReactiveIntensity);
      updateRangeProgress(intensityInput);
    }
    if (intensityValue) intensityValue.textContent = `${settings.musicReactiveIntensity.toFixed(1)}×`;
    updateIntensityMode();
    applyLiveSettings();
  }

  sync();
  return { sync };
}
