import { ulid } from '@kanban/shared';
import { type SessionPayload, useAuthStore } from './auth-store';
import { API_URL } from './config';
import { db, enqueueMutation, type OutboxItem } from './offline';

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  request_id?: string;
  errors?: Array<{ path: string; code: string }>;
  current?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: ProblemDetails;

  constructor(status: number, problem: ProblemDetails) {
    super(problem.detail ?? problem.title ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code ?? `http_${status}`;
    this.problem = problem;
  }
}

/** Thrown when a mutation was written to the offline outbox instead of the network. */
export class OfflineQueuedError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineQueuedError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  queue?: boolean;
  retry?: boolean;
  signal?: AbortSignal;
}

let refreshPromise: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        useAuthStore.getState().clear();
        window.dispatchEvent(new CustomEvent('kanban:unauthorized'));
        return false;
      }
      const payload = (await response.json()) as SessionPayload;
      useAuthStore.getState().setSession(payload);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const mutationId = isMutation ? ulid() : null;
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...authHeaders(),
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(mutationId ? { 'Idempotency-Key': mutationId, 'X-Client-Mutation-Id': mutationId } : {}),
    'X-Client-Version': '1',
    ...options.headers,
  };

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    if (isMutation && options.queue !== false && mutationId) {
      await enqueueMutation({
        id: mutationId,
        path,
        method,
        body: options.body,
        createdAt: Date.now(),
        attempts: 0,
      });
      throw new OfflineQueuedError();
    }
    throw new ApiError(0, {
      code: 'network',
      detail: 'Network is unavailable',
      status: 0,
    });
  }

  if (response.status === 401 && options.retry !== false && isMutation === false) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retry: false });
    }
  }
  if (response.status === 401 && options.retry !== false) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retry: false });
    }
  }

  if (!response.ok) {
    const problem = (await parseResponse<ProblemDetails>(response)) ?? {};
    throw new ApiError(response.status, problem);
  }
  return parseResponse<T>(response);
}

export function get<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'GET' });
}

export function post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'POST', body });
}

export function patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'PATCH', body });
}

export function del<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'DELETE' });
}

export async function uploadAttachment<T>(cardId: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_URL}/v1/cards/${cardId}/attachments/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) {
    const problem = (await parseResponse<ProblemDetails>(response)) ?? {};
    throw new ApiError(response.status, problem);
  }
  return (await response.json()) as T;
}

export async function downloadWithAuth(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new ApiError(response.status, {
      code: 'download_failed',
      detail: 'Could not download file',
    });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function fetchWsTicket(boardId: string): Promise<{ ticket: string }> {
  return post<{ ticket: string }>(`/v1/boards/${boardId}/ws-ticket`);
}

let syncing = false;

export async function syncOutbox(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  const state = useAuthStore.getState();
  if (!state.accessToken && !state.refreshToken) return;
  syncing = true;
  try {
    const items = await db.outbox.orderBy('createdAt').toArray();
    for (const item of items) {
      if (!navigator.onLine) break;
      if (item.method === 'GET') {
        await db.outbox.delete(item.id);
        continue;
      }
      try {
        const token = useAuthStore.getState().accessToken;
        const response = await fetch(`${API_URL}${item.path}`, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Idempotency-Key': item.id,
            'X-Client-Mutation-Id': item.id,
            'X-Client-Version': '1',
          },
          body: item.body === undefined ? undefined : JSON.stringify(item.body),
        });

        if (response.status === 401) {
          const refreshed = await refreshSession();
          if (!refreshed) break;
          const retryToken = useAuthStore.getState().accessToken;
          const retry = await fetch(`${API_URL}${item.path}`, {
            method: item.method,
            headers: {
              'Content-Type': 'application/json',
              ...(retryToken ? { Authorization: `Bearer ${retryToken}` } : {}),
              'Idempotency-Key': item.id,
              'X-Client-Mutation-Id': item.id,
            },
            body: item.body === undefined ? undefined : JSON.stringify(item.body),
          });
          if (retry.status === 401) break;
          if (retry.status >= 500) {
            item.attempts += 1;
            await db.outbox.put(item);
            break;
          }
          await db.outbox.delete(item.id);
          continue;
        }

        if (response.status === 409) {
          const problem = (await parseResponse<ProblemDetails>(response)) ?? {};
          await db.outbox.delete(item.id);
          window.dispatchEvent(new CustomEvent('kanban:conflict', { detail: problem }));
          continue;
        }

        if (response.status >= 500) {
          item.attempts += 1;
          await db.outbox.put(item);
          break;
        }

        await db.outbox.delete(item.id);
        if (!response.ok) {
          const problem = (await parseResponse<ProblemDetails>(response)) ?? {};
          window.dispatchEvent(new CustomEvent('kanban:sync-error', { detail: problem }));
        }
      } catch {
        break;
      }
    }
  } finally {
    syncing = false;
    window.dispatchEvent(new CustomEvent('kanban:outbox'));
  }
}

export function startOutboxSync(): () => void {
  const onOnline = () => {
    void syncOutbox();
  };
  const onFocus = () => {
    void syncOutbox();
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  const interval = window.setInterval(() => {
    if (navigator.onLine) void syncOutbox();
  }, 15_000);
  void syncOutbox();
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
    window.clearInterval(interval);
  };
}

export function queueSummary(items: OutboxItem[]): number {
  return items.length;
}
