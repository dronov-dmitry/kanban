export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type DueFilter = 'overdue' | 'today' | 'week' | 'none';

export interface FilterState {
  q: string;
  assignees: string[];
  labels: string[];
  priorities: Priority[];
  due: DueFilter | null;
  mine: boolean;
  unassigned: boolean;
  archived: boolean;
  hideEmpty: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  q: '',
  assignees: [],
  labels: [],
  priorities: [],
  due: null,
  mine: false,
  unassigned: false,
  archived: false,
  hideEmpty: false,
};

const FLAGS = ['mine', 'unassigned', 'archived', 'hideEmpty'] as const;
type Flag = (typeof FLAGS)[number];

/** Parse the shareable `?f=` DSL: `assignee:me,label:bug,priority:high,due:week,mine`. */
export function parseFilters(raw: string | null | undefined): FilterState {
  const state: FilterState = { ...EMPTY_FILTERS, assignees: [], labels: [], priorities: [] };
  if (!raw) return state;

  for (const token of raw.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    if ((FLAGS as readonly string[]).includes(trimmed)) {
      state[trimmed as Flag] = true;
      continue;
    }
    const separator = trimmed.indexOf(':');
    const key = separator === -1 ? 'q' : trimmed.slice(0, separator);
    const value = separator === -1 ? trimmed : trimmed.slice(separator + 1);
    if (!value) continue;

    switch (key) {
      case 'q':
      case 'text':
        state.q = decodeURIComponent(value);
        break;
      case 'assignee':
        state.assignees.push(value);
        break;
      case 'label':
        state.labels.push(value);
        break;
      case 'priority':
        if (value === 'low' || value === 'normal' || value === 'high' || value === 'urgent') {
          state.priorities.push(value);
        }
        break;
      case 'due':
        if (value === 'overdue' || value === 'today' || value === 'week' || value === 'none') {
          state.due = value;
        }
        break;
      default:
        break;
    }
  }
  return state;
}

export function serializeFilters(state: FilterState): string {
  const parts: string[] = [];
  if (state.q) parts.push(`q:${encodeURIComponent(state.q)}`);
  for (const assignee of state.assignees) parts.push(`assignee:${assignee}`);
  for (const label of state.labels) parts.push(`label:${label}`);
  for (const priority of state.priorities) parts.push(`priority:${priority}`);
  if (state.due) parts.push(`due:${state.due}`);
  for (const flag of FLAGS) {
    if (state[flag]) parts.push(flag);
  }
  return parts.join(',');
}

export function countActiveFilters(state: FilterState): number {
  let count = state.q ? 1 : 0;
  count += state.assignees.length;
  count += state.labels.length;
  count += state.priorities.length;
  count += state.due ? 1 : 0;
  count += state.mine ? 1 : 0;
  count += state.unassigned ? 1 : 0;
  count += state.archived ? 1 : 0;
  return count;
}

export interface FilterableCard {
  title: string;
  description: string;
  priority: Priority;
  due_date: number | null;
  archived_at: number | null;
}

export interface FilterContext {
  userId: string;
  now?: number;
  labelIds?: string[];
  assigneeIds?: string[];
}

function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function matchesFilters(
  card: FilterableCard,
  filters: FilterState,
  context: FilterContext,
): boolean {
  if (!filters.archived && card.archived_at !== null) return false;
  if (filters.archived && card.archived_at === null) return false;

  if (filters.q) {
    const haystack = `${card.title}\n${card.description}`.toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) return false;
  }

  const assignees = context.assigneeIds ?? [];
  if (filters.mine || filters.assignees.includes('me')) {
    if (!assignees.includes(context.userId)) return false;
  }
  const concreteAssignees = filters.assignees.filter((id) => id !== 'me');
  if (concreteAssignees.length > 0 && !assignees.some((id) => concreteAssignees.includes(id))) {
    return false;
  }
  if (filters.unassigned && assignees.length > 0) return false;

  if (filters.labels.length > 0) {
    const labelIds = context.labelIds ?? [];
    if (!labelIds.some((id) => filters.labels.includes(id))) return false;
  }

  if (filters.priorities.length > 0 && !filters.priorities.includes(card.priority)) return false;

  if (filters.due) {
    const now = context.now ?? Date.now();
    const due = card.due_date;
    if (filters.due === 'none') {
      if (due !== null) return false;
    } else {
      if (due === null) return false;
      const today = startOfDay(now);
      const dueDay = startOfDay(due);
      if (filters.due === 'overdue' && dueDay >= today) return false;
      if (filters.due === 'today' && dueDay !== today) return false;
      if (filters.due === 'week' && (dueDay < today || dueDay > today + 7 * 86_400_000))
        return false;
    }
  }

  return true;
}

export function dueUrgency(
  dueDate: number | null,
  done = false,
  now = Date.now(),
): 'overdue' | 'today' | 'soon' | 'later' | null {
  if (dueDate === null || done) return null;
  const today = startOfDay(now);
  const due = startOfDay(dueDate);
  if (due < today) return dueDate < now ? 'overdue' : 'today';
  if (due === today) return 'today';
  if (due <= today + 2 * 86_400_000) return 'soon';
  return 'later';
}
