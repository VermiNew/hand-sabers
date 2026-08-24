import {
  getPerformanceMode,
  getPerformanceModeDescription,
  getPerformanceModes,
  getPerformanceProfile,
} from '../core/performance.ts';
import { setSetting } from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import type { PerformanceMode, Settings } from '../types/index.js';
import { ui } from '../ui/ui.ts';
import { updateRangeProgress } from '../ui/settings-range.ts';
import { applyTrackingSettings } from '../tracking/tracking.ts';
import { prewarmGameplayResources } from './gameplay.ts';
import { getScenePerformanceProfile, setScenePerformanceProfile } from './scene.ts';

type CustomBooleanSetting =
  | 'customAntialias'
  | 'customReflections'
  | 'customFloorGlows'
  | 'customSaberGlints'
  | 'customSaberTrails'
  | 'customBackgroundShader'
  | 'customFog'
  | 'customGrid';

export interface GraphicsSettingsController {
  sync(): void;
}

export function initGraphicsSettings(settings: Settings): GraphicsSettingsController {
  const performanceInput = document.getElementById('menuPerformanceMode') as HTMLSelectElement | null;
  const performanceHint = document.getElementById('menuPerformanceHint');
  const graphicsModeInfo = document.getElementById('menuGraphicsModeInfo');
  const customSection = document.getElementById('menuCustomGraphicsSection');
  const customToggles: Array<[HTMLInputElement | null, CustomBooleanSetting]> = [
    [document.getElementById('menuCustomAntialias') as HTMLInputElement | null, 'customAntialias'],
    [document.getElementById('menuCustomReflections') as HTMLInputElement | null, 'customReflections'],
    [document.getElementById('menuCustomFloorGlows') as HTMLInputElement | null, 'customFloorGlows'],
    [document.getElementById('menuCustomSaberGlints') as HTMLInputElement | null, 'customSaberGlints'],
    [document.getElementById('menuCustomSaberTrails') as HTMLInputElement | null, 'customSaberTrails'],
    [document.getElementById('menuCustomBackgroundShader') as HTMLInputElement | null, 'customBackgroundShader'],
    [document.getElementById('menuCustomFog') as HTMLInputElement | null, 'customFog'],
    [document.getElementById('menuCustomGrid') as HTMLInputElement | null, 'customGrid'],
  ];
  const hitShardsInput = document.getElementById('menuCustomHitShards') as HTMLInputElement | null;
  const hitShardsValue = document.getElementById('menuCustomHitShardsValue');
  const trailSamplesInput = document.getElementById('menuCustomSaberTrailSamples') as HTMLInputElement | null;
  const trailSamplesValue = document.getElementById('menuCustomSaberTrailSamplesValue');
  const trailIntensityInput = document.getElementById('menuCustomSaberTrailIntensity') as HTMLInputElement | null;
  const trailIntensityValue = document.getElementById('menuCustomSaberTrailIntensityValue');
  const arenaDetailInput = document.getElementById('menuCustomArenaDetail') as HTMLInputElement | null;
  const arenaDetailValue = document.getElementById('menuCustomArenaDetailValue');
  const renderScaleInput = document.getElementById('menuCustomRenderScale') as HTMLInputElement | null;
  const renderScaleValue = document.getElementById('menuCustomRenderScaleValue');

  function getModeSummary(): string {
    const selected = getPerformanceMode(settings);
    const profile = getScenePerformanceProfile();
    const active = window.__graphicsQualityMode ?? profile.qualityMode ?? selected;
    const label = window.__graphicsProfile ?? profile.label ?? active;
    const dpr = window.__graphicsDpr ? `, DPR ${Number(window.__graphicsDpr).toFixed(2)}` : '';
    return selected === 'auto'
      ? t('settings.performance.currentModeAuto', { active, details: `${label}${dpr}` })
      : t('settings.performance.currentModeActive', { active, details: `${label}${dpr}` });
  }

  function updateModeInfo(): void {
    if (graphicsModeInfo) graphicsModeInfo.textContent = getModeSummary();
  }

  function updateCustomVisibility(): void {
    customSection?.classList.toggle('is-hidden', performanceInput?.value !== 'custom');
  }

  function updatePerformanceHint(): void {
    if (!performanceHint || !performanceInput) return;
    const mode = getPerformanceMode({ performanceMode: performanceInput.value } as Settings);
    const activeProfile = window.__graphicsQualityMode
      ? t('performance.activeProfile', { mode: window.__graphicsQualityMode })
      : '';
    performanceHint.textContent = `${getPerformanceModeDescription(mode)}${mode === 'auto' ? activeProfile : ''}`;
    updateModeInfo();
  }

  function applyLiveSettings(): void {
    setScenePerformanceProfile(settings);
    updateModeInfo();
  }

  function applyPerformanceMode(): void {
    setScenePerformanceProfile(settings);
    prewarmGameplayResources();
    applyTrackingSettings({ performanceMode: settings.performanceMode });
    const profile = getPerformanceProfile(settings);
    if (ui.dStatus) ui.dStatus.textContent = `PERF: ${profile.label}`;
    updateCustomVisibility();
    updatePerformanceHint();
  }

  function syncControls(): void {
    if (performanceInput) performanceInput.value = getPerformanceMode(settings);
    for (const [input, key] of customToggles) if (input) input.checked = settings[key];

    if (hitShardsInput) {
      hitShardsInput.value = String(settings.customHitShards);
      updateRangeProgress(hitShardsInput);
    }
    if (hitShardsValue) hitShardsValue.textContent = String(settings.customHitShards);

    if (trailSamplesInput) {
      trailSamplesInput.value = String(settings.customSaberTrailSamples);
      updateRangeProgress(trailSamplesInput);
    }
    if (trailSamplesValue) trailSamplesValue.textContent = String(settings.customSaberTrailSamples);

    if (trailIntensityInput) {
      trailIntensityInput.value = String(settings.customSaberTrailIntensity);
      updateRangeProgress(trailIntensityInput);
    }
    if (trailIntensityValue) trailIntensityValue.textContent = `${Math.round(settings.customSaberTrailIntensity * 100)}%`;

    if (arenaDetailInput) {
      arenaDetailInput.value = String(settings.customArenaDetail);
      updateRangeProgress(arenaDetailInput);
    }
    if (arenaDetailValue) arenaDetailValue.textContent = `${Math.round(settings.customArenaDetail * 100)}%`;

    if (renderScaleInput) {
      renderScaleInput.value = String(settings.customRenderScale);
      updateRangeProgress(renderScaleInput);
    }
    if (renderScaleValue) renderScaleValue.textContent = `${Math.round(settings.customRenderScale * 100)}%`;

    updateCustomVisibility();
    updatePerformanceHint();
  }

  if (performanceInput) {
    performanceInput.innerHTML = getPerformanceModes()
      .map(mode => `<option value="${mode.value}">${mode.label}</option>`)
      .join('');
    performanceInput.addEventListener('change', () => {
      const value = performanceInput.value as PerformanceMode;
      settings.performanceMode = value;
      setSetting('performanceMode', value);
      applyPerformanceMode();
    });
  }

  for (const [input, key] of customToggles) {
    input?.addEventListener('change', () => {
      settings[key] = input.checked;
      setSetting(key, input.checked);
      if (performanceInput?.value === 'custom') applyLiveSettings();
    });
  }

  hitShardsInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(7, Math.round(Number(hitShardsInput.value))));
    settings.customHitShards = value;
    setSetting('customHitShards', value);
    updateRangeProgress(hitShardsInput);
    if (hitShardsValue) hitShardsValue.textContent = String(value);
    if (performanceInput?.value === 'custom') applyLiveSettings();
  });

  trailSamplesInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(16, Math.round(Number(trailSamplesInput.value))));
    settings.customSaberTrailSamples = value;
    setSetting('customSaberTrailSamples', value);
    updateRangeProgress(trailSamplesInput);
    if (trailSamplesValue) trailSamplesValue.textContent = String(value);
    if (performanceInput?.value === 'custom') applyLiveSettings();
  });

  trailIntensityInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(1.25, Number(trailIntensityInput.value)));
    settings.customSaberTrailIntensity = value;
    setSetting('customSaberTrailIntensity', value);
    updateRangeProgress(trailIntensityInput);
    if (trailIntensityValue) trailIntensityValue.textContent = `${Math.round(value * 100)}%`;
    if (performanceInput?.value === 'custom') applyLiveSettings();
  });

  arenaDetailInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(1.25, Number(arenaDetailInput.value)));
    settings.customArenaDetail = value;
    setSetting('customArenaDetail', value);
    updateRangeProgress(arenaDetailInput);
    if (arenaDetailValue) arenaDetailValue.textContent = `${Math.round(value * 100)}%`;
    if (performanceInput?.value === 'custom') applyLiveSettings();
  });

  renderScaleInput?.addEventListener('input', () => {
    const value = Math.max(0.5, Math.min(1.5, Number(renderScaleInput.value)));
    settings.customRenderScale = value;
    setSetting('customRenderScale', value);
    updateRangeProgress(renderScaleInput);
    if (renderScaleValue) renderScaleValue.textContent = `${Math.round(value * 100)}%`;
    if (performanceInput?.value === 'custom') applyLiveSettings();
  });

  syncControls();
  window.setInterval(updateModeInfo, 1200);

  return {
    sync(): void {
      syncControls();
      applyPerformanceMode();
    },
  };
}
