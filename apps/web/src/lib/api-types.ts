import type {
  ActivityEvent,
  Board,
  BoardMemberRole,
  Card,
  CardDetail,
  Member,
  Role,
  UserBan,
  UserSettings,
  Workspace,
} from '@kanban/shared';

export interface WorkspaceSummary extends Workspace {
  member_count?: number;
  board_count?: number;
}

export interface BoardSummary extends Board {
  card_count?: number;
  workspace_name?: string;
  workspace_slug?: string;
  /** `linked` means the board was shared into this workspace from another one. */
  library_origin?: 'native' | 'linked';
  origin_workspace_name?: string;
  origin_workspace_slug?: string;
}

export interface BoardAcceptanceResponse {
  board: {
    id: string;
    name: string;
    description: string | null;
    cover: string | null;
    workspace_id: string;
  };
  role: BoardMemberRole;
  creator: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    created_by: string;
    owner_name: string | null;
  } | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: Role;
    added: boolean;
  }>;
  can_manage: boolean;
}

export interface BoardAccessRequestRow {
  id: string;
  board_id: string;
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: number;
  resolved_at: number | null;
}

export interface BoardShareLinkRow {
  id: string;
  role: BoardMemberRole;
  expires_at: number | null;
  created_at: number;
  url: string;
}

export interface BoardShareLinkInfo {
  valid: boolean;
  role: BoardMemberRole;
  expires_at: number | null;
  inviter_name: string | null;
  board: {
    id: string;
    name: string;
    description: string | null;
    cover: string | null;
  };
  workspace: { name: string; slug: string };
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
  board_members: Member[];
  access_requests: BoardAccessRequestRow[];
  can_manage: boolean;
  can_manage_roles: boolean;
  can_leave: boolean;
  workspace: {
    id: string;
    name: string;
    slug: string;
    created_by: string;
    owner_name: string | null;
  };
  board_owner: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  linked_workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: BoardMemberRole;
  }>;
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

export interface UserBanRow extends UserBan {
  banned_by_name?: string;
}

export interface ServiceInviteRow {
  id: string;
  email: string | null;
  note: string | null;
  expires_at: number;
  accepted_at: number | null;
  accepted_by: string | null;
  accepted_by_name: string | null;
  created_at: number;
  url?: string;
}

export interface PublicBoardResponse {
  board: {
    id: string;
    name: string;
    description: string | null;
    cover: string | null;
    visibility: string;
    created_at: number;
    updated_at: number;
  };
  workspace: { name: string; slug: string };
  lists: Array<import('@kanban/shared').BoardList>;
  cards: Card[];
  labels: Array<import('@kanban/shared').CardLabel>;
  card_labels: Array<{ card_id: string; label_id: string }>;
  card_assignees: Array<{
    card_id: string;
    user_id: string;
    display_name: string;
    avatar_url: string | null;
  }>;
  checklists: Array<import('@kanban/shared').Checklist>;
}

export interface PublicBoardRequestState {
  hasAccess: boolean;
  role: string | null;
  request: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    message: string | null;
    created_at: number;
    resolved_at: number | null;
  } | null;
}

export interface PublicServiceInvite {
  valid: boolean;
  expired?: boolean;
  accepted?: boolean;
  inviter_name?: string;
  inviter_avatar_url?: string | null;
  email?: string | null;
  note?: string | null;
  expires_at?: number;
  accepted_at?: number | null;
  reason?: string;
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

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_staff: number;
  plan: 'free' | 'pro';
  plan_status: 'active' | 'expired';
  current_period_end: number | null;
  is_pro: number;
  created_at: number;
  workspace_count: number;
}

export interface AdminSubscriptionRow {
  user_id: string;
  plan: 'free' | 'pro';
  status: 'active' | 'expired';
  current_period_end: number | null;
  created_at: number;
  updated_at: number;
}

export interface AdminBanRow {
  id: string;
  email: string;
  reason: string | null;
  workspace_id: string | null;
  banned_by: string;
  banned_by_name: string | null;
  expires_at: number | null;
  created_at: number;
}

export interface BillingPlan {
  code: 'pro';
  amount: string;
  currency: string;
  period_days: number;
}

export interface BillingSubscription {
  plan: 'free' | 'pro';
  status: 'active' | 'free';
  current_period_end: number | null;
}

export interface BillingPaymentRow {
  id: string;
  plan: string;
  amount: string;
  currency: string;
  period_days: number;
  status: 'pending' | 'paid' | 'cancelled' | 'failed' | 'refunded';
  created_at: number;
  paid_at: number | null;
}

export interface BillingInfo {
  configured: boolean;
  plan: BillingPlan;
  subscription: BillingSubscription;
  payments: BillingPaymentRow[];
}
