import type {
  ActivityEvent,
  Board,
  Card,
  CardDetail,
  Member,
  Role,
  UserSettings,
  Workspace,
} from '@kanban/shared';

export interface WorkspaceSummary extends Workspace {
  member_count?: number;
  board_count?: number;
}

export interface BoardSummary extends Board {
  card_count?: number;
}

export interface BoardSnapshotResponse {
  board: Board;
  lists: Array<import('@kanban/shared').BoardList>;
  cards: Card[];
  labels: Array<import('@kanban/shared').CardLabel>;
  card_labels: Array<{ card_id: string; label_id: string }>;
  card_assignees: Array<{ card_id: string; user_id: string }>;
  checklists: Array<import('@kanban/shared').Checklist>;
  attachment_counts: Array<{ card_id: string; count: number }>;
  comment_counts: Array<{ card_id: string; count: number }>;
  members: Member[];
  workspace: { id: string; name: string; slug: string };
  role: Role;
}

export interface CardWithContext extends Card {
  board_name?: string;
  list_name?: string;
}

export type CardDetailResponse = CardDetail;

export interface SessionInfo {
  id: string;
  device_id: string | null;
  user_agent: string | null;
  created_at: number;
  expires_at: number;
}

export interface IdentityInfo {
  provider: string;
  email: string | null;
  linked_at: number;
}

export interface InvitationSummary {
  id: string;
  workspace_id: string;
  email: string | null;
  role: Role;
  expires_at: number;
  accepted_at: number | null;
  created_at: number;
  token?: string;
  url?: string;
}

export interface SearchResult {
  card_id: string;
  snippet: string;
  title: string;
  board_id: string;
  board_name: string;
  list_id: string;
  list_name: string;
  workspace_id: string;
  source: 'card' | 'comment';
  comment_id?: string;
}

export interface AuditRow extends ActivityEvent {
  actor_name: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  payload_json: string;
  read_at: number | null;
  created_at: number;
}

export interface ArchiveResponse {
  boards: Board[];
  trashedBoards: Board[];
  cards: CardWithContext[];
  trashedCards: CardWithContext[];
}

export interface ProfileResponse {
  user: import('@kanban/shared').User;
  settings: UserSettings;
}

export interface SessionPayloadResponse extends ProfileResponse {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  expiresAt: number;
}
