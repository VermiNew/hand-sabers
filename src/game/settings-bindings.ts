import {
  SETTINGS_CHANGED_EVENT,
  resetSettings,
  setSetting,
  type SettingsChangedDetail,
} from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import { bindStyledRange } from '../ui/settings-range.ts';
import { initLanguageSettings } from '../ui/language-settings.ts';
import type { Settings } from '../types/index.js';
import { applyAudioSettings } from './audio.ts';
import { initArenaSettings } from './arena-settings.ts';
import { initAudioSettings } from './audio-settings.ts';
import { initDeveloperSettings } from './developer-settings.ts';
import { initGameplaySettings } from './gameplay-settings.ts';
import { initGraphicsSettings } from './graphics-settings.ts';
import { initMusicReactiveSettings } from './music-reactive-settings.ts';
import { initProfileSettings } from './profile.ts';
import { initSaberSettings } from './saber-settings.ts';
import { initTrackingSettings } from './tracking-settings.ts';

interface SettingsBindingsOptions {
  settings: Settings;
  applyTranslations(): void;
  isTrackingStarted(): boolean;
  onStopTracking(): void;
  onCalibrationInvalidated(): void;
}

export interface SettingsBindingsController {
  updateTrackingSourceHint(): void;
}

export function initSettingsBindings({
  settings,
  applyTranslations,
  isTrackingStarted,
  onStopTracking,
  onCalibrationInvalidated,
}: SettingsBindingsOptions): SettingsBindingsController {
  const settingsReset = document.getElementById('mainSettingsReset');
  const trackingSettingsController = initTrackingSettings(settings, {
    onSourceChange(changed) {
      if (!changed || !isTrackingStarted()) return;
      onStopTracking();
      onCalibrationInvalidated();
    },
  });

  initLanguageSettings(applyTranslations);
  const audioSettingsController = initAudioSettings(settings, bindStyledRange);
  initProfileSettings(settings);
  const gameplaySettingsController = initGameplaySettings(settings);
  const saberSettingsController = initSaberSettings(settings);
  const arenaSettingsController = initArenaSettings(settings);
  const musicReactiveSettingsController = initMusicReactiveSettings(settings);
  const graphicsSettingsController = initGraphicsSettings(settings);
  const developerSettingsController = initDeveloperSettings(settings);

  const audioKeys = new Set<keyof Settings>([
    'volume',
    'musicVolume',
    'sfxVolume',
    'hitSoundVolume',
    'comboSoundVolume',
    'missSoundVolume',
    'bombSoundVolume',
    'beatSoundVolume',
    'milestoneSoundVolume',
    'audioOffsetMs',
  ]);
  const gameplayKeys = new Set<keyof Settings>(['noFail', 'oneHandMode']);
  const trackingKeys = new Set<keyof Settings>(['sensitivity', 'flipCamera']);

  window.addEventListener(SETTINGS_CHANGED_EVENT, event => {
    const detail = (event as CustomEvent<SettingsChangedDetail>).detail;
    if (!detail || detail.source !== 'devpanel') return;
    const changed = new Set(detail.changedKeys);
    if (detail.changedKeys.some(key => audioKeys.has(key))) audioSettingsController.sync();
    if (detail.changedKeys.some(key => gameplayKeys.has(key))) gameplaySettingsController.sync();
    if (detail.changedKeys.some(key => trackingKeys.has(key))) trackingSettingsController.sync();
    if (changed.has('performanceMode')) graphicsSettingsController.sync();
  });

  settingsReset?.addEventListener('click', () => {
    if (!window.confirm(t('settings.resetConfirm'))) return;

    const localNoFail = settings.noFail;
    const localTrainingMode = settings.trainingMode;
    const previousTrackingSource = settings.trackingSource;
    resetSettings();
    if (gameplaySettingsController.hasMultiplayerRules()) {
      setSetting('noFail', localNoFail);
      setSetting('trainingMode', localTrainingMode);
    }
    if (isTrackingStarted() && previousTrackingSource !== settings.trackingSource) {
      onStopTracking();
      onCalibrationInvalidated();
    }
    audioSettingsController.sync();
    gameplaySettingsController.sync();
    saberSettingsController.sync();
    arenaSettingsController.sync();
    musicReactiveSettingsController.sync();
    graphicsSettingsController.sync();
    trackingSettingsController.sync();
    developerSettingsController.sync();
    applyAudioSettings(settings);
  });

  return {
    updateTrackingSourceHint: () => trackingSettingsController.updateSourceHint(),
  };
}
