import { getCurrentLang, setLang } from '../i18n/index.ts';

export function initLanguageSettings(onLanguageChanged: () => void): void {
  const polishButton = document.getElementById('btnLangPl');
  const englishButton = document.getElementById('btnLangEn');

  function updateButtons(): void {
    const currentLanguage = getCurrentLang();
    polishButton?.classList.toggle('lang-active', currentLanguage === 'pl');
    englishButton?.classList.toggle('lang-active', currentLanguage === 'en');
  }

  polishButton?.addEventListener('click', () => {
    setLang('pl');
    updateButtons();
    onLanguageChanged();
  });

  englishButton?.addEventListener('click', () => {
    setLang('en');
    updateButtons();
    onLanguageChanged();
  });

  updateButtons();
}
