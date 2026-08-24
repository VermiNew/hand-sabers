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

  if (enabledInput) {
    enabledInput.checked = Boolean(settings.developerMode) || isDeveloperPanelEnabled();
    enabledInput.addEventListener('change', () => {
      settings.developerMode = enabledInput.checked;
      setDeveloperPanelEnabled(renderer, enabledInput.checked);
      setHitPlaneVisible(enabledInput.checked);
    });
  }

  if (accentInput) {
    accentInput.value = settings.devAccent || 'green';
    accentInput.addEventListener('change', () => {
      settings.devAccent = accentInput.value;
      applyDevAccent(accentInput.value);
    });
  }

  document.getElementById('mainDevMode')?.addEventListener('click', () => {
    const query = new URLSearchParams(location.search);
    if (!query.has('dev')) query.set('dev', '');
    const serialized = query.toString().replace(/=(?=&|$)/g, '');
    location.href = `${location.pathname}${serialized ? `?${serialized}` : ''}${location.hash}`;
  });

  return {
    sync(): void {
      if (enabledInput) enabledInput.checked = settings.developerMode;
      setDeveloperPanelEnabled(renderer, settings.developerMode);
      setHitPlaneVisible(settings.developerMode);

      if (accentInput) accentInput.value = settings.devAccent || 'green';
      applyDevAccent(settings.devAccent || 'green');
    },
  };
}
