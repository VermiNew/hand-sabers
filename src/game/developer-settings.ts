import type { Settings } from '../types/index.js';
import {
  applyDevAccent,
  isDeveloperPanelEnabled,
  setDeveloperPanelEnabled,
} from '../ui/devpanel.ts';
import { renderer, setHitPlaneVisible } from './scene.ts';

export interface DeveloperSettingsController {
  sync(): void;
}

export function initDeveloperSettings(settings: Settings): DeveloperSettingsController {
  const enabledInput = document.getElementById('menuDeveloperMode') as HTMLInputElement | null;
  const accentInput = document.getElementById('menuDevAccent') as HTMLSelectElement | null;
  const quickToggle = document.getElementById('mainDevMode') as HTMLButtonElement | null;

  function syncEnabledState(enabled: boolean): void {
    if (enabledInput) enabledInput.checked = enabled;
    quickToggle?.setAttribute('aria-pressed', String(enabled));
  }

  function applyEnabledState(enabled: boolean): void {
    settings.developerMode = enabled;
    syncEnabledState(enabled);
    setDeveloperPanelEnabled(renderer, enabled);
    setHitPlaneVisible(enabled);
  }

  if (enabledInput) {
    syncEnabledState(Boolean(settings.developerMode) || isDeveloperPanelEnabled());
    enabledInput.addEventListener('change', () => {
      applyEnabledState(enabledInput.checked);
    });
  }

  if (accentInput) {
    accentInput.value = settings.devAccent || 'green';
    accentInput.addEventListener('change', () => {
      settings.devAccent = accentInput.value;
      applyDevAccent(accentInput.value);
    });
  }

  quickToggle?.addEventListener('click', () => {
    const enabled = !isDeveloperPanelEnabled();
    if (!enabled) {
      const url = new URL(location.href);
      url.searchParams.delete('dev');
      url.searchParams.delete('testing');
      history.replaceState(history.state, '', url);
    }
    applyEnabledState(enabled);
  });

  syncEnabledState(Boolean(settings.developerMode) || isDeveloperPanelEnabled());

  return {
    sync(): void {
      syncEnabledState(settings.developerMode);
      setDeveloperPanelEnabled(renderer, settings.developerMode);
      setHitPlaneVisible(settings.developerMode);

      if (accentInput) accentInput.value = settings.devAccent || 'green';
      applyDevAccent(settings.devAccent || 'green');
    },
  };
}
