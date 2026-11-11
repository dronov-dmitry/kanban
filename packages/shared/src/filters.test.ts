import { describe, expect, it } from 'vitest';
import {
  countActiveFilters,
  dueUrgency,
  EMPTY_FILTERS,
  matchesFilters,
  parseFilters,
  serializeFilters,
} from './filters';

const baseCard = {
  title: 'Fix login',
  description: 'Token refresh broken',
  priority: 'high' as const,
  due_date: null,
  archived_at: null,
};

describe('filters', () => {
  it('parses and serializes the URL DSL', () => {
    const filters = parseFilters('q:login,assignee:me,label:bug,priority:high,due:week,mine');
    expect(filters.q).toBe('login');
    expect(filters.assignees).toEqual(['me']);
    expect(filters.labels).toEqual(['bug']);
    expect(filters.priorities).toEqual(['high']);
    expect(filters.due).toBe('week');
    expect(filters.mine).toBe(true);
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });

  it('counts active filters', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters(parseFilters('label:a,label:b,mine'))).toBe(3);
  });

  it('matches text, priority and labels (OR within a group)', () => {
    const filters = parseFilters('q:login,priority:high,label:bug,label:design');
    expect(matchesFilters(baseCard, filters, { userId: 'u1', labelIds: ['design'] })).toBe(true);
    expect(matchesFilters(baseCard, filters, { userId: 'u1', labelIds: ['other'] })).toBe(false);
  });

  it('matches "mine" and "unassigned"', () => {
    const mine = parseFilters('mine');
    expect(matchesFilters(baseCard, mine, { userId: 'u1', assigneeIds: ['u1'] })).toBe(true);
    expect(matchesFilters(baseCard, mine, { userId: 'u1', assigneeIds: [] })).toBe(false);
    const unassigned = parseFilters('unassigned');
    expect(matchesFilters(baseCard, unassigned, { userId: 'u1', assigneeIds: [] })).toBe(true);
  });

  it('hides archived cards unless asked', () => {
    const archived = { ...baseCard, archived_at: 1 };
    expect(matchesFilters(archived, EMPTY_FILTERS, { userId: 'u1' })).toBe(false);
    expect(matchesFilters(archived, parseFilters('archived'), { userId: 'u1' })).toBe(true);
  });

  it('computes due urgency', () => {
    const now = new Date(2026, 10, 9, 12).getTime();
    const yesterday = new Date(2026, 10, 8, 12).getTime();
    expect(dueUrgency(yesterday, false, now)).toBe('overdue');
    expect(dueUrgency(now - 3_600_000, false, now)).toBe('today');
    expect(dueUrgency(now + 3_600_000, false, now)).toBe('today');
    expect(dueUrgency(now + 86_400_000, false, now)).toBe('soon');
    expect(dueUrgency(now + 10 * 86_400_000, false, now)).toBe('later');
    expect(dueUrgency(now, true, now)).toBeNull();
  });
});
