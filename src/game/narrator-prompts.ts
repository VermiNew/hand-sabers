import { S, state } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { isNarratorVisible, narratorQuick, narratorShow } from './narrator.ts';

const WELCOME_STORAGE_KEY = 'hs_welcome_seen';
const COMBO_MESSAGES: Record<number, { key: string; mood: 'happy' | 'excited' | 'celebrate' }> = {
  50: { key: 'narrator.combo50', mood: 'happy' },
  100: { key: 'narrator.combo100', mood: 'excited' },
  200: { key: 'narrator.combo200', mood: 'celebrate' },
};

export function showFirstRunWelcome(): void {
  if (localStorage.getItem(WELCOME_STORAGE_KEY) === '1') return;
  try { localStorage.setItem(WELCOME_STORAGE_KEY, '1'); } catch {}
  window.setTimeout(() => {
    if (!document.body.classList.contains('menu-open') || state.appState !== S.MENU) return;
    void narratorShow({
      text: t('narrator.welcome'),
      buttons: [t('narrator.letsGo'), t('narrator.openTutorial')],
      mood: 'happy',
    }).then(choice => {
      if (choice === 1) {
        window.dispatchEvent(new CustomEvent('hand-sabers:open-tutorial', { detail: { force: true } }));
      }
    });
  }, 1200);
}

export function bindComboNarrator(): void {
  window.__narratorCombo = (combo: number) => {
    if (isNarratorVisible()) return;
    const message = COMBO_MESSAGES[combo];
    if (message) narratorQuick(t(message.key), message.mood, 3500);
  };
}
