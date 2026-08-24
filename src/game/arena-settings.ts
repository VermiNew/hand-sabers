import { ARENA_THEMES, getArenaTheme } from '../core/arena-themes.ts';
import { setSetting } from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import type { Settings } from '../types/index.js';
import { applyBackgroundTheme, setArenaTheme } from './scene.ts';

export interface ArenaSettingsController {
  sync(): void;
}

export function applyArenaTheme(themeId: string): void {
  const theme = getArenaTheme(themeId);
  setArenaTheme(theme.sceneBg, theme.fog, theme.ambient, theme.floor);
  applyBackgroundTheme(theme.shader);
}

export function initArenaSettings(settings: Settings): ArenaSettingsController {
  const themeInput = document.getElementById('menuArenaTheme') as HTMLSelectElement | null;

  if (themeInput) {
    themeInput.innerHTML = ARENA_THEMES
      .map(theme => `<option value="${theme.id}">${t(`arena.${theme.id}`)}</option>`)
      .join('');
    themeInput.addEventListener('change', () => {
      settings.arenaTheme = themeInput.value;
      setSetting('arenaTheme', themeInput.value);
      applyArenaTheme(themeInput.value);
    });
  }

  function sync(): void {
    const themeId = settings.arenaTheme || 'cosmic';
    if (themeInput) themeInput.value = themeId;
    applyArenaTheme(themeId);
  }

  sync();
  return { sync };
}
