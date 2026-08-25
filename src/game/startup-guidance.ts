import { needsLanguageSelection, t } from '../i18n/index.ts';
import { narratorShow } from './narrator.ts';

const SETTINGS_RECOMMENDATION_KEY = 'hs_settings_recommendation_seen';

function requestFirstRunTutorial(force = false): void {
  window.dispatchEvent(new CustomEvent('hand-sabers:open-tutorial', { detail: { force } }));
}

export function initStartupGuidance(): void {
  if (needsLanguageSelection()) {
    window.dispatchEvent(new CustomEvent('hand-sabers:open-settings', { detail: { tab: 'language' } }));
    window.setTimeout(() => {
      void narratorShow({ text: t('narrator.chooseLanguage'), buttons: [t('calib.ok')] });
    }, 250);
    return;
  }

  if (localStorage.getItem(SETTINGS_RECOMMENDATION_KEY) !== '1') {
    localStorage.setItem(SETTINGS_RECOMMENDATION_KEY, '1');
    window.setTimeout(() => {
      void narratorShow({
        text: t('narrator.configureSettings'),
        buttons: [t('narrator.openSettings'), t('narrator.quickGuide'), t('narrator.later')],
      }).then(choice => {
        if (choice === 0) {
          window.dispatchEvent(new CustomEvent('hand-sabers:open-settings', { detail: { tab: 'gameplay' } }));
        } else if (choice === 1) {
          requestFirstRunTutorial(true);
        }
      });
    }, 900);
    return;
  }

  window.setTimeout(() => requestFirstRunTutorial(), 650);
}
