import { format, formatDistanceToNowStrict, isSameDay, isToday, isTomorrow } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

const AVATAR_COLORS = [
  '#4F46E5',
  '#0EA5E9',
  '#15803D',
  '#B45309',
  '#B91C1C',
  '#7C3AED',
  '#DB2777',
  '#0F766E',
];

export function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

export function dateLocale(locale: string) {
  return locale === 'en' ? enUS : ru;
}

export function formatDate(timestamp: number, locale = 'ru', pattern = 'd MMM'): string {
  return format(new Date(timestamp), pattern, { locale: dateLocale(locale) });
}

export function formatDateTime(timestamp: number, locale = 'ru'): string {
  return format(new Date(timestamp), 'd MMM yyyy, HH:mm', { locale: dateLocale(locale) });
}

export function formatRelative(timestamp: number, locale = 'ru'): string {
  return formatDistanceToNowStrict(new Date(timestamp), {
    addSuffix: true,
    locale: dateLocale(locale),
  });
}

export function formatDue(timestamp: number, locale = 'ru'): string {
  const date = new Date(timestamp);
  if (isToday(date)) return locale === 'en' ? 'Today' : 'Сегодня';
  if (isTomorrow(date)) return locale === 'en' ? 'Tomorrow' : 'Завтра';
  if (isSameDay(date, new Date())) return locale === 'en' ? 'Today' : 'Сегодня';
  return format(date, 'd MMM', { locale: dateLocale(locale) });
}

/** Convert a local `YYYY-MM-DD` input value to a timestamp at 09:00 local time. */
export function dateInputToTimestamp(value: string): number | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 9, 0, 0, 0).getTime();
}

export function timestampToDateInput(timestamp: number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function renderMarkdown(markdown: string): string {
  if (!markdown.trim()) return '';
  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'code',
      'pre',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'input',
      'img',
      'span',
    ],
    ALLOWED_ATTR: [
      'href',
      'title',
      'target',
      'rel',
      'class',
      'type',
      'checked',
      'disabled',
      'src',
      'alt',
    ],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  for (const anchor of template.content.querySelectorAll('a')) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  return template.innerHTML;
}

export function sanitizeSnippet(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['mark'],
    ALLOWED_ATTR: [],
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, delay: number) {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function taskCountLabel(count: number, locale: string): string {
  if (locale === 'en') return `${count} ${count === 1 ? 'task' : 'tasks'}`;
  return `${count} ${pluralRu(count, 'задача', 'задачи', 'задач')}`;
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#64748B',
  normal: '#0EA5E9',
  high: '#B45309',
  urgent: '#B91C1C',
};

export const LABEL_PALETTE = [
  '#4F46E5',
  '#0EA5E9',
  '#15803D',
  '#B45309',
  '#B91C1C',
  '#7C3AED',
  '#DB2777',
  '#0F766E',
  '#65A30D',
  '#64748B',
];

export const LIST_COLORS = ['#4F46E5', '#0EA5E9', '#15803D', '#B45309', '#B91C1C', '#7C3AED'];
