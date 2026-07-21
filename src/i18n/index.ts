import i18next from 'i18next';
import pl from './pl.json';
import en from './en.json';
import { contestTranslations } from './contest.ts';

export type Lang = 'pl' | 'en';

type TranslationTree = Record<string, unknown>;

let languageSelectionNeeded = false;

function mergeTranslations(base: TranslationTree, overrides: TranslationTree): TranslationTree {
  const merged: TranslationTree = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    if (
      current && value
      && typeof current === 'object' && !Array.isArray(current)
      && typeof value === 'object' && !Array.isArray(value)
    ) {
      merged[key] = mergeTranslations(current as TranslationTree, value as TranslationTree);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function detectLang(): Lang {
  const stored = localStorage.getItem('lang');
  if (stored === 'pl' || stored === 'en') return stored;

  const browserLanguages = [...(navigator.languages ?? []), navigator.language]
    .map(language => String(language || '').toLowerCase())
    .filter(Boolean);
  if (browserLanguages.some(language => language === 'pl' || language.startsWith('pl-'))) return 'pl';
  if (browserLanguages.some(language => language === 'en' || language.startsWith('en-'))) return 'en';

  languageSelectionNeeded = true;
  return 'en';
}

const initialLanguage = detectLang();

document.documentElement.lang = initialLanguage;

void i18next.init({
  lng: initialLanguage,
  fallbackLng: 'en',
  resources: {
    pl: { translation: mergeTranslations(pl as TranslationTree, contestTranslations.pl as unknown as TranslationTree) },
    en: { translation: mergeTranslations(en as TranslationTree, contestTranslations.en as unknown as TranslationTree) },
  },
  interpolation: { escapeValue: false },
});

export function t(key: string, options?: Record<string, unknown>): string {
  return options ? i18next.t(key, options) : i18next.t(key);
}

export function translateDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    const key = element.dataset['i18n'];
    if (key) element.textContent = t(key);
  });
  const translatedAttributes = [
    ['i18nPlaceholder', 'placeholder'],
    ['i18nTitle', 'title'],
    ['i18nAriaLabel', 'aria-label'],
  ] as const;
  for (const [datasetKey, attribute] of translatedAttributes) {
    root.querySelectorAll<HTMLElement>(`[data-${datasetKey.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}]`).forEach(element => {
      const key = element.dataset[datasetKey];
      if (key) element.setAttribute(attribute, t(key));
    });
  }
}

export function setLang(lang: Lang): void {
  languageSelectionNeeded = false;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  void i18next.changeLanguage(lang);
}

export function getCurrentLang(): Lang {
  const lng = i18next.language;
  return lng === 'pl' ? 'pl' : 'en';
}

export function needsLanguageSelection(): boolean {
  return languageSelectionNeeded;
}
