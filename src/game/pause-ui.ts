import { PAUSE_REASONS } from '../core/pause.ts';
import { t } from '../i18n/index.ts';
import type { PauseReason } from '../types/index.js';

export function applyPauseTranslations(): void {
  document.querySelectorAll('.pause-menu-title').forEach(element => {
    element.textContent = t('pause.title');
  });
  const handsPauseTitle = document.getElementById('handsPauseTitle');
  if (handsPauseTitle) handsPauseTitle.textContent = t('pause.trackingTitle');
  const pauseSub = document.getElementById('pauseSub');
  if (pauseSub) pauseSub.textContent = t('pause.handsLost');

  const translations: Array<[string, string]> = [
    ['pauseResume', 'pause.resume'],
    ['pauseRestart', 'pause.restart'],
    ['pauseMaps', 'pause.maps'],
    ['pauseQuit', 'pause.mainMenu'],
    ['handsPauseQuit', 'pause.mainMenu'],
  ];
  for (const [id, key] of translations) {
    const element = document.getElementById(id);
    if (element) element.textContent = t(key);
  }
}

export function setPauseMenuMessage(reason: PauseReason): void {
  const message = document.getElementById('pauseMenuSub');
  if (!message) return;
  if (reason === PAUSE_REASONS.FOCUS) {
    message.textContent = `${t('pause.focusLost')} ${t('pause.focusResumeHint')}`;
    message.hidden = false;
  } else if (reason === PAUSE_REASONS.HANDS) {
    message.textContent = t('pause.handsLostManual');
    message.hidden = false;
  } else {
    message.textContent = '';
    message.hidden = true;
  }
}

export function setPauseResumeButtonDisabled(disabled: boolean): void {
  const resumeButton = document.getElementById('pauseResume') as HTMLButtonElement | null;
  if (resumeButton) resumeButton.disabled = disabled;
}

export function syncPauseMenuActions(multiplayerRoundActive: boolean): void {
  const restart = document.getElementById('pauseRestart') as HTMLButtonElement | null;
  const maps = document.getElementById('pauseMaps') as HTMLButtonElement | null;
  const quit = document.getElementById('pauseQuit');
  const handsPauseQuit = document.getElementById('handsPauseQuit');
  const title = document.querySelector('.pause-menu-title');
  if (restart) restart.hidden = multiplayerRoundActive;
  if (maps) maps.hidden = multiplayerRoundActive;
  if (quit) quit.textContent = t(multiplayerRoundActive ? 'pause.leaveRoomMenu' : 'pause.mainMenu');
  if (handsPauseQuit) handsPauseQuit.textContent = t(multiplayerRoundActive ? 'pause.leaveRoomMenu' : 'pause.mainMenu');
  if (title) title.textContent = t(multiplayerRoundActive ? 'pause.titleMP' : 'pause.title');
}
