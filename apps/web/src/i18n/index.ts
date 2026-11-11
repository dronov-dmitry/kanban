import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ru from './ru.json';

type Locale = 'ru' | 'en';

const STORAGE_KEY = 'kanban.lang';

function isLocale(value: string | null): value is Locale {
  return value === 'ru' || value === 'en';
}

export function detectLocale(): Locale {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (isLocale(stored)) return stored;

  const preferred =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];

  for (const language of preferred) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'ru') return 'ru';
    if (base === 'en') return 'en';
  }

  return 'en';
}

const initial = detectLocale();

function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  document.title = i18n.t('meta.title');
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', i18n.t('meta.description'));
}

i18n.on('languageChanged', (language) => {
  applyDocumentLocale(language === 'en' ? 'en' : 'ru');
});

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
    },
    lng: initial,
    fallbackLng: 'ru',
    interpolation: { escapeValue: false },
    returnNull: false,
    showSupportNotice: false,
  })
  .then(() => applyDocumentLocale(initial));

export function setLanguage(locale: string): void {
  const next = locale === 'en' ? 'en' : 'ru';
  if (i18n.language !== next) void i18n.changeLanguage(next);
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
}

document.documentElement.lang = initial;

export default i18n;
