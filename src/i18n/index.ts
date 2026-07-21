import i18next from 'i18next';
import pl from './pl.json';
import en from './en.json';

export type Lang = 'pl' | 'en';

function detectLang(): Lang {
  const stored = localStorage.getItem('lang');
  if (stored === 'pl' || stored === 'en') return stored;
  return navigator.language.startsWith('pl') ? 'pl' : 'en';
}

void i18next.init({
  lng: detectLang(),
  fallbackLng: 'pl',
  resources: {
    pl: { translation: pl },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

export function t(key: string, options?: Record<string, unknown>): string {
  return options ? i18next.t(key, options) : i18next.t(key);
}

export function setLang(lang: Lang): void {
  localStorage.setItem('lang', lang);
  void i18next.changeLanguage(lang);
}

export function getCurrentLang(): Lang {
  const lng = i18next.language;
  return lng === 'pl' ? 'pl' : 'en';
}
