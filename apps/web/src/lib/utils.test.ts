import { describe, expect, it } from 'vitest';
import {
  dateInputToTimestamp,
  initials,
  pluralRu,
  taskCountLabel,
  timestampToDateInput,
} from './utils';

describe('client utilities', () => {
  it('builds initials from names', () => {
    expect(initials('Аня Иванова')).toBe('АИ');
    expect(initials('Дима')).toBe('ДИ');
    expect(initials('  ')).toBe('?');
  });

  it('round-trips a date input value', () => {
    const timestamp = dateInputToTimestamp('2026-11-12');
    expect(timestamp).not.toBeNull();
    expect(timestampToDateInput(timestamp)).toBe('2026-11-12');
    expect(dateInputToTimestamp('')).toBeNull();
  });

  it('pluralises russian task counts', () => {
    expect(pluralRu(1, 'задача', 'задачи', 'задач')).toBe('задача');
    expect(pluralRu(3, 'задача', 'задачи', 'задач')).toBe('задачи');
    expect(pluralRu(11, 'задача', 'задачи', 'задач')).toBe('задач');
    expect(taskCountLabel(2, 'ru')).toBe('2 задачи');
    expect(taskCountLabel(2, 'en')).toBe('2 tasks');
  });
});
