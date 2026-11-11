import type { Member, UserSettings } from '@kanban/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { get, patch } from './api';
import type {
  ArchiveResponse,
  AuditRow,
  BoardSnapshotResponse,
  BoardSummary,
  CardDetailResponse,
  InvitationSummary,
  NotificationRow,
  ProfileResponse,
  ServiceInviteRow,
  SessionInfo,
  UserBanRow,
  WorkspaceSummary,
} from './api-types';
import { useAuthStore } from './auth-store';
import { cacheSnapshot, readSnapshot } from './offline';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => get<{ data: WorkspaceSummary[] }>('/v1/workspaces'),
    staleTime: 30_000,
  });
}

export function useBoards(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['boards', workspaceId],
    queryFn: () => get<{ data: BoardSummary[] }>(`/v1/workspaces/${workspaceId}/boards`),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useSharedBoards(enabled = true) {
  return useQuery({
    queryKey: ['boards', 'shared'],
    queryFn: () => get<{ data: BoardSummary[] }>('/v1/boards/shared'),
    enabled,
    staleTime: 15_000,
  });
}

export function useWorkspaceBans(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['bans', workspaceId],
    queryFn: () => get<{ data: UserBanRow[] }>(`/v1/workspaces/${workspaceId}/bans`),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export function useServiceInvites(enabled: boolean) {
  return useQuery({
    queryKey: ['service-invites'],
    queryFn: () => get<{ data: ServiceInviteRow[] }>('/v1/service-invites'),
    enabled,
  });
}

export function useBoard(boardId: string | undefined) {
  const [cached, setCached] = useState<BoardSnapshotResponse | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCached(null);
    setCacheChecked(false);
    if (!boardId) return;
    void readSnapshot<BoardSnapshotResponse>(`board:${boardId}`).then((row) => {
      if (cancelled) return;
      if (row) setCached(row.data);
      setCacheChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const query = useQuery({
    queryKey: ['board', boardId],
    queryFn: async () => {
      const data = await get<BoardSnapshotResponse>(`/v1/boards/${boardId}`);
      await cacheSnapshot(`board:${boardId}`, data);
      return data;
    },
    enabled: Boolean(boardId),
    staleTime: 5_000,
    retry: 1,
  });

  return {
    ...query,
    data: query.data ?? cached ?? undefined,
    fromCache: !query.data && Boolean(cached),
    cacheChecked,
  };
}

export function useMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => get<{ data: Member[] }>(`/v1/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useCard(cardId: string | undefined) {
  return useQuery({
    queryKey: ['card', cardId],
    queryFn: () => get<{ card: CardDetailResponse }>(`/v1/cards/${cardId}`),
    enabled: Boolean(cardId),
    staleTime: 3_000,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ data: NotificationRow[] }>('/v1/notifications?limit=30'),
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => get<{ unread: number }>('/v1/notifications/count'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useArchive(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['archive', workspaceId],
    queryFn: () => get<ArchiveResponse>(`/v1/workspaces/${workspaceId}/archive`),
    enabled: Boolean(workspaceId),
  });
}

export function useAudit(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['audit', workspaceId],
    queryFn: () => get<{ data: AuditRow[] }>(`/v1/workspaces/${workspaceId}/audit?limit=20`),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export function useInvitations(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['invitations', workspaceId],
    queryFn: () => get<{ data: InvitationSummary[] }>(`/v1/workspaces/${workspaceId}/invitations`),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export function useSessions(enabled: boolean) {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => get<{ data: SessionInfo[] }>('/v1/me/sessions'),
    enabled,
  });
}

export function useMyTasks(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['my-tasks', workspaceId],
    queryFn: () =>
      get<{ data: Array<import('./api-types').CardWithContext> }>(
        `/v1/workspaces/${workspaceId}/my-cards`,
      ),
    enabled: Boolean(workspaceId),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => get<ProfileResponse>('/v1/me'),
  });
}

export function useSavedViews(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['views', workspaceId],
    queryFn: () =>
      get<{ data: Array<{ id: string; name: string; filters: string; board_id: string | null }> }>(
        `/v1/workspaces/${workspaceId}/views`,
      ),
    enabled: Boolean(workspaceId),
  });
}

export function useUpdateSettings() {
  return async (settings: Partial<UserSettings> & { reducedMotion?: boolean }) => {
    const body: Record<string, unknown> = {};
    if (settings.theme) body.theme = settings.theme;
    if (settings.density) body.density = settings.density;
    if (settings.reducedMotion !== undefined) body.reducedMotion = settings.reducedMotion;
    const response = await patch<{ settings: UserSettings }>('/v1/me/settings', body);
    useAuthStore.getState().setSettings(response.settings);
    return response.settings;
  };
}
