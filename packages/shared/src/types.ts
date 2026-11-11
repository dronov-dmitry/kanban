import type { Priority } from './filters';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type BoardTemplate = 'empty' | 'development' | 'content' | 'personal' | 'hiring' | 'sprint';
export type ThemePreference = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  locale: 'ru' | 'en';
  timezone: string;
  email_verified_at: number | null;
  is_staff: number;
  created_at: number;
}

export interface UserSettings {
  theme: ThemePreference;
  density: Density;
  reduced_motion: number;
  notify_json: string;
  shortcuts_json: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  role: Role;
  member_count?: number;
  board_count?: number;
}

export interface Member {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  joined_at: number;
}

export interface Invitation {
  id: string;
  workspace_id: string;
  email: string | null;
  role: Role;
  expires_at: number;
  accepted_at: number | null;
  created_at: number;
  token?: string;
}

export interface Board {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  cover: string | null;
  position: string;
  is_favorite: number;
  prefs_json: string;
  created_by: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  deleted_at?: number | null;
  card_count?: number;
}

export interface BoardList {
  id: string;
  board_id: string;
  name: string;
  position: string;
  wip_limit: number | null;
  color: string | null;
  is_collapsed: number;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

export interface Card {
  id: string;
  board_id: string;
  list_id: string;
  title: string;
  description: string;
  position: string;
  priority: Priority;
  start_date: number | null;
  due_date: number | null;
  due_done: number;
  is_blocked: number;
  cover_ref: string | null;
  version: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  deleted_at: number | null;
}

export interface CardLabel {
  id: string;
  board_id: string;
  name: string;
  color: string;
  created_at: number;
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  text: string;
  is_done: number;
  position: string;
  assignee_id: string | null;
}

export interface Checklist {
  id: string;
  card_id: string;
  title: string;
  position: string;
  items: ChecklistItem[];
}

export interface Comment {
  id: string;
  card_id: string;
  author_id: string;
  author_name?: string;
  author_avatar?: string | null;
  body_md: string;
  edited_at: number | null;
  created_at: number;
  deleted_at: number | null;
}

export interface Attachment {
  id: string;
  card_id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  created_at: number;
}

export interface ActivityEvent {
  id: string;
  workspace_id: string;
  board_id: string | null;
  card_id: string | null;
  actor_id: string;
  actor_name?: string;
  verb: string;
  payload_json: string;
  created_at: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload_json: string;
  read_at: number | null;
  created_at: number;
}

/** Snapshot returned by GET /v1/boards/:id. */
export interface BoardSnapshot {
  board: Board;
  lists: BoardList[];
  cards: Card[];
  labels: CardLabel[];
  card_labels: Array<{ card_id: string; label_id: string }>;
  card_assignees: Array<{ card_id: string; user_id: string }>;
  checklists: Checklist[];
  attachment_counts: Array<{ card_id: string; count: number }>;
  comment_counts: Array<{ card_id: string; count: number }>;
  members: Member[];
}

export interface CardDetail extends Card {
  labels: CardLabel[];
  assignees: Array<{ user_id: string; display_name: string; avatar_url: string | null }>;
  checklists: Checklist[];
  comments: Comment[];
  attachments: Attachment[];
  activity: ActivityEvent[];
}

export type RealtimeEventType =
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.deleted'
  | 'card.restored'
  | 'list.created'
  | 'list.updated'
  | 'list.deleted'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'attachment.added'
  | 'board.updated'
  | 'member.joined'
  | 'notification.created';

export interface RealtimeEvent {
  v: 1;
  type: RealtimeEventType;
  seq: number;
  ts: number;
  board_id: string;
  actor: { id: string; name: string };
  client_mutation_id?: string;
  data: Record<string, unknown>;
}

export interface PresenceUser {
  id: string;
  name: string;
  avatar_url?: string | null;
  last_seen: number;
}

export interface WsServerMessage {
  v: 1;
  type: 'hello.ok' | 'presence.state' | 'ping' | 'error' | RealtimeEventType;
  seq?: number;
  ts?: number;
  board_id?: string;
  actor?: { id: string; name: string };
  client_mutation_id?: string;
  data?: Record<string, unknown>;
  code?: string;
  message?: string;
  server_time?: number;
  board_version?: number;
  latest_seq?: number;
  resync_required?: boolean;
  users?: PresenceUser[];
}
