import pl from './pl.json';
import en from './en.json';

export type Lang = 'pl' | 'en';

const translations = { pl, en } as const;

let currentLang: Lang = detectLang();

function detectLang(): Lang {
  const stored = localStorage.getItem('lang');
  if (stored === 'pl' || stored === 'en') return stored;
  const browserLang = navigator.language.split('-')[0];
  return browserLang === 'pl' ? 'pl' : 'en';
}

export function getCurrentLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  translateDOM();
}

export function t(key: string, params?: Record<string, string | number>): string {
  const keys = key.split('.');
  let value: unknown = translations[currentLang];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }

  if (typeof value !== 'string') {
    console.warn(`Translation value is not a string: ${key}`);
    return key;
  }

  if (!params) return value;

  return value.replace(/\{(\w+)\}/g, (_, paramKey: string) => {
    return params[paramKey] !== undefined ? String(params[paramKey]) : `{${paramKey}}`;
  });
}

export function translateDOM(): void {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;

    const attr = el.getAttribute('data-i18n-attr');
    const translated = t(key);

    if (attr) {
      el.setAttribute(attr, translated);
    } else {
      el.textContent = translated;
    }
  });
}
