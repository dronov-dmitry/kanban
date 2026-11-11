import { z } from 'zod';

export const localeSchema = z.enum(['ru', 'en']);
export const roleSchema = z.enum(['owner', 'manager', 'member', 'viewer']);
export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const templateSchema = z.enum([
  'empty',
  'development',
  'content',
  'personal',
  'hiring',
  'sprint',
]);

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const exchangeSchema = z.object({ code: z.string().min(16).max(500) });

export const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().max(64).optional(),
  locale: localeSchema.optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
});

export const settingsPatchSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  reducedMotion: z.boolean().optional(),
  notify: z.record(z.string(), z.boolean()).optional(),
  shortcuts: z.record(z.string(), z.string()).optional(),
});

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, 'invalid slug')
    .optional(),
  timezone: z.string().trim().max(64).optional(),
  icon: z.string().max(32).nullable().optional(),
});

export const workspacePatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  icon: z.string().max(32).nullable().optional(),
});

export const inviteCreateSchema = z.object({
  email: emailSchema.optional(),
  role: z.enum(['manager', 'member', 'viewer']).default('member'),
});

export const memberRoleSchema = z.object({ role: z.enum(['manager', 'member', 'viewer']) });

export const boardCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  cover: z.string().max(500).nullable().optional(),
  template: templateSchema.default('empty'),
  locale: localeSchema.optional(),
});

export const boardDuplicateSchema = z.object({
  locale: localeSchema.optional(),
  workspaceId: z.string().trim().min(1).max(64).optional(),
});

/** A received board can be linked into any workspace the user belongs to. */
export const boardWorkspaceAcceptSchema = z.object({
  workspaceId: z.string().trim().min(1).max(64),
});

export const boardMoveSchema = z.object({
  workspaceId: z.string().trim().min(1).max(64),
});

export const cardDuplicateSchema = z.object({
  locale: localeSchema.optional(),
});

export const boardVisibilitySchema = z.enum(['private', 'public']);
export const boardMemberRoleSchema = z.enum(['viewer', 'manager', 'worker']);
/** Roles the board owner can pick when resolving a request or editing a member. */
export const boardMemberAssignableRoleSchema = z.enum(['manager', 'worker']);

export const boardPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  cover: z.string().max(500).nullable().optional(),
  visibility: boardVisibilitySchema.optional(),
  isFavorite: z.boolean().optional(),
  prefs: z.record(z.string(), z.unknown()).optional(),
  archived: z.boolean().optional(),
});

export const boardAccessRequestSchema = z.object({
  message: z.string().trim().max(1000).optional(),
});

export const boardAccessDecisionSchema = z.object({
  role: boardMemberRoleSchema.default('worker'),
});

export const boardMemberRoleChangeSchema = z.object({
  role: boardMemberAssignableRoleSchema,
});

export const boardShareSchema = z.object({
  emails: z.array(emailSchema).min(1).max(20),
  role: boardMemberRoleSchema.default('viewer'),
  message: z.string().trim().max(500).optional(),
});

export const boardShareLinkSchema = z.object({
  role: boardMemberRoleSchema.default('viewer'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const banCreateSchema = z.object({
  email: emailSchema,
  reason: z.string().trim().max(500).optional(),
  expiresAt: z.number().int().positive().nullable().optional(),
});

export const adminSubscriptionSchema = z.object({
  plan: z.enum(['free', 'pro']),
  /** Kept for backward compatibility; admin-granted PRO never expires. */
  periodDays: z.number().int().min(1).max(3650).optional(),
});

export const serviceInviteCreateSchema = z.object({
  email: emailSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const listCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
});

export const listPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  isCollapsed: z.boolean().optional(),
  position: z.string().min(1).max(64).optional(),
});

const nullableTimestamp = z.number().int().nonnegative().nullable().optional();

export const cardCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50_000).optional(),
  priority: prioritySchema.optional(),
  dueDate: nullableTimestamp,
  startDate: nullableTimestamp,
  position: z.string().min(1).max(64).optional(),
  labelIds: z.array(z.string()).max(50).optional(),
  assigneeIds: z.array(z.string()).max(50).optional(),
});

export const cardPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(50_000).optional(),
  priority: prioritySchema.optional(),
  dueDate: nullableTimestamp,
  startDate: nullableTimestamp,
  dueDone: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
  coverRef: z.string().max(500).nullable().optional(),
  archived: z.boolean().optional(),
  labelIds: z.array(z.string()).max(50).optional(),
  assigneeIds: z.array(z.string()).max(50).optional(),
  version: z.number().int().nonnegative().optional(),
});

export const cardMoveSchema = z.object({
  listId: z.string().min(1),
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
  position: z.string().min(1).max(64).optional(),
});

export const labelCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const labelPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const commentCreateSchema = z.object({
  bodyMd: z.string().trim().min(1).max(20_000),
});

export const commentPatchSchema = z.object({
  bodyMd: z.string().trim().min(1).max(20_000),
});

export const checklistCreateSchema = z.object({
  title: z.string().trim().max(120).default(''),
});

export const checklistItemCreateSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export const checklistItemPatchSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  isDone: z.boolean().optional(),
  assigneeId: z.string().nullable().optional(),
});

export const attachmentRegisterSchema = z.object({
  key: z.string().min(1).max(500),
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(200),
  size: z.number().int().positive(),
});

export const notificationReadSchema = z.object({
  ids: z.array(z.string()).max(200).optional(),
  all: z.boolean().optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  workspace: z.string().optional(),
  board: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
