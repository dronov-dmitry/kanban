import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ru from './ru.json';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('kanban.lang') : null;
const initial = stored === 'en' || stored === 'ru' ? stored : 'ru';

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: initial,
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(locale: string): void {
  const next = locale === 'en' ? 'en' : 'ru';
  if (i18n.language !== next) void i18n.changeLanguage(next);
  localStorage.setItem('kanban.lang', next);
  document.documentElement.lang = next;
}

document.documentElement.lang = initial;

export default i18n;
