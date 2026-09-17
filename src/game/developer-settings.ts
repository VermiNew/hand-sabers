import type { Settings } from '../types/index.js';
import {
  getDeveloperAccessConfiguration,
  isDeveloperAccessGranted,
  unlockDeveloperAccess,
} from '../core/developer-access.ts';
import { t } from '../i18n/index.ts';
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
  const accessCard = document.getElementById('developerAccessCard');
  const tokenInput = document.getElementById('menuDeveloperToken') as HTMLInputElement | null;
  const unlockButton = document.getElementById('menuDeveloperUnlock') as HTMLButtonElement | null;
  const accessStatus = document.getElementById('menuDeveloperAccessStatus');
  const urlParams = new URLSearchParams(location.search);
  const requestedAtLoad = Boolean(settings.developerMode) || urlParams.has('dev') || urlParams.has('testing');

  function setAccessStatus(message: string, accessState: 'checking' | 'locked' | 'granted' | 'error'): void {
    if (accessCard) accessCard.dataset['state'] = accessState;
    if (accessStatus) accessStatus.textContent = message;
  }

  function syncAccessControls(): void {
    const granted = isDeveloperAccessGranted();
    if (enabledInput) enabledInput.disabled = !granted;
    if (accentInput) accentInput.disabled = !granted;
    if (quickToggle) {
      quickToggle.dataset['locked'] = String(!granted);
      quickToggle.title = granted ? t('settings.developer.name') : t('settings.developer.locked');
    }
    if (tokenInput) tokenInput.disabled = granted;
    if (unlockButton) unlockButton.disabled = granted;
  }

  function syncEnabledState(enabled: boolean): void {
    if (enabledInput) enabledInput.checked = enabled;
    quickToggle?.setAttribute('aria-pressed', String(enabled));
  }

  function applyEnabledState(enabled: boolean): void {
    const allowed = enabled && isDeveloperAccessGranted();
    settings.developerMode = allowed;
    syncEnabledState(allowed);
    setDeveloperPanelEnabled(renderer, allowed);
    setHitPlaneVisible(allowed);
  }

  if (enabledInput) {
    syncEnabledState(isDeveloperAccessGranted() && (Boolean(settings.developerMode) || isDeveloperPanelEnabled()));
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
    if (!isDeveloperAccessGranted()) {
      window.dispatchEvent(new CustomEvent('hand-sabers:open-settings', { detail: { tab: 'developer' } }));
      window.setTimeout(() => tokenInput?.focus(), 100);
      return;
    }
    const enabled = !isDeveloperPanelEnabled();
    if (!enabled) {
      const url = new URL(location.href);
      url.searchParams.delete('dev');
      url.searchParams.delete('testing');
      history.replaceState(history.state, '', url);
    }
    applyEnabledState(enabled);
  });

  unlockButton?.addEventListener('click', () => {
    const token = tokenInput?.value ?? '';
    if (!token) {
      setAccessStatus(t('settings.developer.tokenRequired'), 'error');
      tokenInput?.focus();
      return;
    }
    unlockButton.disabled = true;
    if (tokenInput) tokenInput.disabled = true;
    setAccessStatus(t('settings.developer.checking'), 'checking');
    void unlockDeveloperAccess(token).then(result => {
      if (tokenInput) tokenInput.value = '';
      if (!result.ok) {
        setAccessStatus(result.message, 'error');
        if (tokenInput) tokenInput.disabled = false;
        unlockButton.disabled = false;
        tokenInput?.focus();
        return;
      }
      setAccessStatus(t('settings.developer.granted'), 'granted');
      syncAccessControls();
      if (requestedAtLoad) applyEnabledState(true);
    });
  });
  tokenInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') unlockButton?.click();
  });

  syncEnabledState(false);
  syncAccessControls();
  void getDeveloperAccessConfiguration().then(configured => {
    if (isDeveloperAccessGranted()) return;
    if (configured) {
      setAccessStatus(t('settings.developer.locked'), 'locked');
      if (tokenInput) tokenInput.disabled = false;
      if (unlockButton) unlockButton.disabled = false;
    } else {
      setAccessStatus(t('settings.developer.notConfigured'), 'error');
      if (tokenInput) tokenInput.disabled = true;
      if (unlockButton) unlockButton.disabled = true;
    }
  });

  return {
    sync(): void {
      const enabled = isDeveloperAccessGranted() && settings.developerMode;
      syncEnabledState(enabled);
      setDeveloperPanelEnabled(renderer, enabled);
      setHitPlaneVisible(enabled);

      if (accentInput) accentInput.value = settings.devAccent || 'green';
      applyDevAccent(settings.devAccent || 'green');
    },
  };
}
