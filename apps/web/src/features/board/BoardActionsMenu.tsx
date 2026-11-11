import type { Board, BoardVisibility, CardLabel, Member } from '@kanban/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Menu, MenuItem, Modal, useToast } from '../../components/ui';
import { ApiError, del, downloadWithAuth, patch, post } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { useBoard, useWorkspaces } from '../../lib/queries';
import { LIST_COLORS } from '../../lib/utils';
import { LabelManager } from './LabelManager';

interface BoardActionsMenuProps {
  board: Board;
  canWrite: boolean;
  canManageBoard: boolean;
  canLeave?: boolean;
  onLabelsDeleted?: (labelId: string) => void;
  initialSettingsOpen?: boolean;
}

export function BoardActionsMenu({
  board,
  canWrite,
  canManageBoard,
  canLeave = false,
  onLabelsDeleted,
  initialSettingsOpen,
}: BoardActionsMenuProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { wsSlug } = useParams({ strict: false }) as { wsSlug?: string };
  const isPro = useAuthStore((state) => state.user?.plan === 'pro');
  const workspacesQuery = useWorkspaces();

  const [settingsOpen, setSettingsOpen] = useState(Boolean(initialSettingsOpen));
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [moving, setMoving] = useState(false);

  async function archiveBoard() {
    try {
      await patch(`/v1/boards/${board.id}`, { archived: true });
      await queryClient.refetchQueries({
        queryKey: ['boards', board.workspace_id],
        type: 'all',
      });
      await queryClient.invalidateQueries({ queryKey: ['boards', 'shared'] });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.push(t('common.archive'), { kind: 'success' });
      await navigate({ to: '/app/$wsSlug', params: { wsSlug: wsSlug ?? '' } });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function removeBoard() {
    setDeleteOpen(false);
    try {
      await del(`/v1/boards/${board.id}`);
      await queryClient.refetchQueries({
        queryKey: ['boards', board.workspace_id],
        type: 'all',
      });
      await queryClient.invalidateQueries({ queryKey: ['boards', 'shared'] });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      await navigate({ to: '/app/$wsSlug', params: { wsSlug: wsSlug ?? '' } });
      toast.push(t('toast.boardTrashed'), {
        action: {
          label: t('common.restore'),
          onClick: () => {
            void post(`/v1/boards/${board.id}/restore`).then(() =>
              navigate({
                to: '/app/$wsSlug/boards/$boardId',
                params: { wsSlug: wsSlug ?? '', boardId: board.id },
              }),
            );
          },
        },
      });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function duplicateBoard() {
    try {
      const response = await post<{ board_id: string }>(`/v1/boards/${board.id}/duplicate`, {
        locale: i18n.language === 'en' ? 'en' : 'ru',
        workspaceId: board.workspace_id,
      });
      await queryClient.invalidateQueries({ queryKey: ['boards', board.workspace_id] });
      await navigate({
        to: '/app/$wsSlug/boards/$boardId',
        params: { wsSlug: wsSlug ?? '', boardId: response.board_id },
      });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? error.code === 'board_limit'
            ? t('errors.boardLimit')
            : error.code === 'card_limit'
              ? t('errors.cardLimit')
              : (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    }
  }

  async function leaveBoard() {
    try {
      await del(`/v1/boards/${board.id}/leave`);
      setLeaveOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['boards', board.workspace_id] });
      await queryClient.invalidateQueries({ queryKey: ['boards', 'shared'] });
      toast.push(t('board.leftBoard'), { kind: 'success' });
      await navigate({ to: '/app' });
    } catch (error) {
      toast.push(
        error instanceof ApiError &&
          (error.code === 'board_access_via_workspace' || error.code === 'board_access_via_link')
          ? t('errors.leaveViaWorkspace')
          : error instanceof ApiError
            ? (error.problem.detail ?? t('errors.generic'))
            : t('errors.generic'),
        { kind: 'danger' },
      );
    }
  }

  async function moveBoardToWorkspace() {
    if (!moveTarget || moving) return;
    setMoving(true);
    try {
      const response = await post<{ workspace: { id: string; name: string; slug: string } }>(
        `/v1/boards/${board.id}/move`,
        { workspaceId: moveTarget },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['boards', board.workspace_id] }),
        queryClient.invalidateQueries({ queryKey: ['boards', response.workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['board', board.id] }),
      ]);
      setMoveOpen(false);
      toast.push(t('common.saved'), { kind: 'success' });
      await navigate({
        to: '/app/$wsSlug/boards/$boardId',
        params: { wsSlug: response.workspace.slug, boardId: board.id },
      });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setMoving(false);
    }
  }

  const hasMenuItems = canWrite || canManageBoard || canLeave || isPro;
  if (!hasMenuItems) return null;

  return (
    <>
      <Menu
        trigger={(props) => (
          <Button size="sm" icon="more" aria-label={t('common.actions')} {...props} />
        )}
      >
        {canWrite ? (
          <MenuItem
            icon="edit"
            onClick={() => {
              setSettingsOpen(true);
            }}
          >
            {t('board.boardSettings')}
          </MenuItem>
        ) : null}
        {canWrite ? (
          <MenuItem icon="tag" onClick={() => setLabelsOpen(true)}>
            {t('board.manageLabels')}
          </MenuItem>
        ) : null}
        {canManageBoard ? (
          <MenuItem icon="move" onClick={() => setMoveOpen(true)}>
            {t('board.moveToWorkspace')}
          </MenuItem>
        ) : null}
        {canWrite ? (
          <MenuItem icon="duplicate" onClick={() => void duplicateBoard()}>
            {t('common.duplicate')}
          </MenuItem>
        ) : null}
        {isPro ? (
          <>
            <MenuItem
              icon="download"
              onClick={() =>
                void downloadWithAuth(
                  `/v1/boards/${board.id}/export?format=json&locale=${i18n.language === 'en' ? 'en' : 'ru'}`,
                  `${board.name}.json`,
                )
              }
            >
              {t('board.exportJson')}
            </MenuItem>
            <MenuItem
              icon="download"
              onClick={() =>
                void downloadWithAuth(
                  `/v1/boards/${board.id}/export?format=csv&locale=${i18n.language === 'en' ? 'en' : 'ru'}`,
                  `${board.name}.csv`,
                )
              }
            >
              {t('board.exportCsv')}
            </MenuItem>
            <MenuItem
              icon="download"
              onClick={() =>
                void downloadWithAuth(
                  `/v1/boards/${board.id}/export?format=md&locale=${i18n.language === 'en' ? 'en' : 'ru'}`,
                  `${board.name}.md`,
                )
              }
            >
              {t('board.exportMd')}
            </MenuItem>
          </>
        ) : null}
        {canLeave ? (
          <>
            <div className="menu-separator" />
            <MenuItem icon="logout" onClick={() => setLeaveOpen(true)}>
              {t('board.leaveBoard')}
            </MenuItem>
          </>
        ) : null}
        {canManageBoard ? (
          <>
            <div className="menu-separator" />
            <MenuItem icon="archive" onClick={() => void archiveBoard()}>
              {t('board.archiveBoard')}
            </MenuItem>
            <MenuItem icon="trash" danger onClick={() => setDeleteOpen(true)}>
              {t('board.deleteBoard')}
            </MenuItem>
          </>
        ) : null}
      </Menu>

      {settingsOpen ? (
        <BoardSettingsDialog
          board={board}
          canManageBoard={canManageBoard}
          onClose={() => setSettingsOpen(false)}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ['board', board.id] });
            await queryClient.invalidateQueries({ queryKey: ['boards', board.workspace_id] });
          }}
        />
      ) : null}

      {labelsOpen ? (
        <BoardLabelsDialog
          boardId={board.id}
          onClose={() => setLabelsOpen(false)}
          onLabelDeleted={onLabelsDeleted}
        />
      ) : null}

      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={t('board.moveToWorkspace')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!moveTarget || moving}
              onClick={() => void moveBoardToWorkspace()}
            >
              {t('board.moveToWorkspaceAction')}
            </Button>
          </>
        }
      >
        <p className="small muted">{t('board.moveToWorkspaceHint')}</p>
        <select
          className="select"
          style={{ marginTop: 10 }}
          value={moveTarget}
          onChange={(event) => setMoveTarget(event.target.value)}
        >
          <option value="">—</option>
          {(workspacesQuery.data?.data ?? [])
            .filter((workspace) => workspace.id !== board.workspace_id)
            .map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
        </select>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t('board.leaveBoardTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void leaveBoard()}>
              {t('board.leaveBoard')}
            </Button>
          </>
        }
      >
        <p className="small muted">{t('board.leaveBoardHint', { name: board.name })}</p>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('board.deleteBoard')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void removeBoard()}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="small">{t('board.deleteConfirm')}</p>
      </Modal>
    </>
  );
}

function BoardSettingsDialog({
  board,
  canManageBoard,
  onClose,
  onSaved,
}: {
  board: Board;
  canManageBoard: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const boardQuery = useBoard(board.id);
  const workspacesQuery = useWorkspaces();
  const snapshot = boardQuery.data;
  const isPro = useAuthStore((state) => state.user?.plan === 'pro');
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? '');
  const [cover, setCover] = useState(board.cover ?? LIST_COLORS[0]!);
  const [visibility, setVisibility] = useState<BoardVisibility>(board.visibility ?? 'private');
  const [saving, setSaving] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [moving, setMoving] = useState(false);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<Member | null>(null);
  const [unlinkCandidate, setUnlinkCandidate] = useState<{ id: string; name: string } | null>(null);

  const members = snapshot?.members ?? [];
  const boardMemberRows = snapshot?.board_members ?? [];
  const canManageRoles =
    snapshot?.can_manage_roles ??
    Boolean(currentUser && snapshot?.board.created_by === currentUser.id);

  async function changeMemberRole(userId: string, role: 'viewer' | 'manager' | 'worker') {
    setMemberBusy(userId);
    try {
      await patch(`/v1/boards/${board.id}/members/${userId}`, { role });
      await queryClient.invalidateQueries({ queryKey: ['board', board.id] });
      toast.push(t('board.roleChanged'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setMemberBusy(null);
    }
  }

  async function removeBoardMember(member: Member) {
    setMemberBusy(member.user_id);
    try {
      await del(`/v1/boards/${board.id}/members/${member.user_id}`);
      await queryClient.invalidateQueries({ queryKey: ['board', board.id] });
      setRemoveCandidate(null);
      toast.push(t('board.memberRemoved'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setMemberBusy(null);
    }
  }

  async function unlinkWorkspace() {
    if (!unlinkCandidate) return;
    setMemberBusy(unlinkCandidate.id);
    try {
      await del(`/v1/boards/${board.id}/links/${unlinkCandidate.id}`);
      await queryClient.invalidateQueries({ queryKey: ['board', board.id] });
      setUnlinkCandidate(null);
      toast.push(t('board.workspaceUnlinked'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setMemberBusy(null);
    }
  }

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        cover,
      };
      if (canManageBoard) payload.visibility = visibility;
      await patch(`/v1/boards/${board.id}`, payload);
      await onSaved();
      toast.push(t('common.saved'), { kind: 'success' });
      onClose();
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? error.code === 'pro_required'
            ? t('errors.coverPro')
            : (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setSaving(false);
    }
  }

  async function moveBoard() {
    if (!moveTarget || moving) return;
    setMoving(true);
    try {
      const response = await post<{ workspace: { id: string; name: string; slug: string } }>(
        `/v1/boards/${board.id}/move`,
        { workspaceId: moveTarget },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['boards', board.workspace_id] }),
        queryClient.invalidateQueries({ queryKey: ['boards', response.workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['board', board.id] }),
      ]);
      toast.push(t('common.saved'), { kind: 'success' });
      onClose();
      await navigate({
        to: '/app/$wsSlug/boards/$boardId',
        params: { wsSlug: response.workspace.slug, boardId: board.id },
      });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t('board.boardSettings')}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={!name.trim() || saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div>
            <label className="label" htmlFor="board-settings-name">
              {t('workspace.boardName')}
            </label>
            <input
              id="board-settings-name"
              className="input"
              data-autofocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="board-settings-description">
              {t('workspace.description')}
            </label>
            <textarea
              id="board-settings-description"
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="board-settings-visibility">
              {t('board.visibility')}
            </label>
            <select
              id="board-settings-visibility"
              className="select"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as BoardVisibility)}
              disabled={!canManageBoard}
            >
              <option value="private">{t('board.private')}</option>
              <option value="public">{t('board.public')}</option>
            </select>
            <p className="caption subtle" style={{ marginTop: 4 }}>
              {visibility === 'public' ? t('board.publicHint') : t('board.privateHint')}
            </p>
          </div>
          {canManageBoard ? (
            <div>
              <label className="label" htmlFor="board-settings-workspace">
                {t('board.workspaceLabel')}
              </label>
              <div className="row">
                <select
                  id="board-settings-workspace"
                  className="select"
                  value={moveTarget}
                  onChange={(event) => setMoveTarget(event.target.value)}
                >
                  <option value="">—</option>
                  {(workspacesQuery.data?.data ?? [])
                    .filter((workspace) => workspace.id !== board.workspace_id)
                    .map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                </select>
                <Button
                  size="sm"
                  variant="soft"
                  disabled={!moveTarget || moving}
                  onClick={() => void moveBoard()}
                >
                  {t('board.moveBoard')}
                </Button>
              </div>
              <p className="caption subtle" style={{ marginTop: 4 }}>
                {t('board.moveBoardHint')}
              </p>
            </div>
          ) : null}
          <div>
            <span className="label">{t('workspace.cover')}</span>
            <div className="row wrap">
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setCover(color)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: color,
                    border:
                      cover === color
                        ? '3px solid var(--color-text)'
                        : '2px solid var(--color-surface)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            {isPro ? (
              <label className="row" style={{ gap: 8, marginTop: 8 }}>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(cover) ? cover : LIST_COLORS[0]!}
                  onChange={(event) => setCover(event.target.value.toUpperCase())}
                  style={{
                    width: 36,
                    height: 28,
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                  }}
                />
                <span className="caption subtle">{t('board.customCover')}</span>
              </label>
            ) : null}
          </div>
          <div>
            <div className="spread" style={{ marginBottom: 6 }}>
              <span className="label">{t('board.members')}</span>
              <span className="badge">{members.length}</span>
            </div>
            <p className="caption subtle">{t('board.membersHint')}</p>
            {members.map((member) => {
              const boardRow = boardMemberRows.find((row) => row.user_id === member.user_id);
              const isOwner = board.created_by === member.user_id;
              const accessVia = member.access_via ?? (boardRow ? 'direct' : 'workspace');
              const direct = accessVia === 'direct' && Boolean(boardRow);
              const sourceWorkspace = member.source_workspace_slug
                ? (workspacesQuery.data?.data ?? []).find(
                    (workspace) => workspace.slug === member.source_workspace_slug,
                  )
                : null;
              return (
                <div className="member-row" key={member.user_id}>
                  <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <span className="strong small truncate">{member.display_name}</span>
                      {isOwner ? (
                        <span className="badge primary">{t('board.ownerBadge')}</span>
                      ) : null}
                    </div>
                    <div className="caption subtle truncate">{member.email}</div>
                    {member.source_workspace_name ? (
                      <div className="caption subtle truncate">
                        {t(
                          accessVia === 'linked'
                            ? 'board.accessViaLinked'
                            : 'board.accessViaWorkspace',
                          { workspace: member.source_workspace_name },
                        )}
                      </div>
                    ) : null}
                  </div>
                  {canManageRoles && !isOwner ? (
                    <select
                      className="select"
                      style={{ width: 140, minHeight: 30 }}
                      value={boardRoleValue(member.role)}
                      disabled={memberBusy === member.user_id}
                      onChange={(event) =>
                        void changeMemberRole(
                          member.user_id,
                          event.target.value as 'viewer' | 'manager' | 'worker',
                        )
                      }
                      aria-label={t('settings.role')}
                    >
                      <option value="manager">{t('board.roleManager')}</option>
                      <option value="worker">{t('board.roleWorker')}</option>
                      <option value="viewer">{t('settings.viewer')}</option>
                    </select>
                  ) : (
                    <span className="badge">{t(boardRoleKey(member.role))}</span>
                  )}
                  {canManageRoles && direct && !isOwner ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={t('board.removeMember')}
                      disabled={memberBusy === member.user_id}
                      onClick={() => setRemoveCandidate(member)}
                    />
                  ) : null}
                  {!direct &&
                  accessVia === 'linked' &&
                  canManageRoles &&
                  member.source_workspace_id ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={t('board.unlinkWorkspace')}
                      title={t('board.unlinkWorkspace')}
                      disabled={memberBusy === member.source_workspace_id}
                      onClick={() =>
                        setUnlinkCandidate({
                          id: member.source_workspace_id!,
                          name: member.source_workspace_name ?? '',
                        })
                      }
                    />
                  ) : !direct && sourceWorkspace ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="users"
                      aria-label={t('board.manageWorkspaceAccess')}
                      title={t('board.manageWorkspaceAccess')}
                      onClick={() =>
                        void navigate({
                          to: '/app/$wsSlug/settings',
                          params: { wsSlug: sourceWorkspace.slug },
                          search: { tab: 'members' },
                        })
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="card-panel" style={{ padding: 12, background: 'var(--color-surface-2)' }}>
            <div className="small">
              <span className="muted">{t('board.boardOwner')}: </span>
              <span className="strong">{snapshot?.board_owner?.display_name ?? '—'}</span>
            </div>
            <div className="small" style={{ marginTop: 4 }}>
              <span className="muted">{t('board.workspaceOwner')}: </span>
              <span className="strong">
                {snapshot?.workspace.name ?? '—'} · {snapshot?.workspace.owner_name ?? '—'}
              </span>
            </div>
            {snapshot?.linked_workspaces.length ? (
              <div className="small" style={{ marginTop: 4 }}>
                <span className="muted">{t('board.linkedWorkspaces')}: </span>
                <span className="strong">
                  {snapshot.linked_workspaces.map((item) => item.name).join(', ')}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(removeCandidate)}
        onClose={() => setRemoveCandidate(null)}
        title={t('board.removeMemberTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveCandidate(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={memberBusy === removeCandidate?.user_id}
              onClick={() => {
                if (removeCandidate) void removeBoardMember(removeCandidate);
              }}
            >
              {t('board.removeMember')}
            </Button>
          </>
        }
      >
        <p className="small muted">
          {t('board.removeMemberHint', { name: removeCandidate?.display_name ?? '' })}
        </p>
      </Modal>

      <Modal
        open={Boolean(unlinkCandidate)}
        onClose={() => setUnlinkCandidate(null)}
        title={t('board.unlinkWorkspaceTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnlinkCandidate(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={memberBusy === unlinkCandidate?.id}
              onClick={() => void unlinkWorkspace()}
            >
              {t('board.unlinkWorkspace')}
            </Button>
          </>
        }
      >
        <p className="small muted">
          {t('board.unlinkWorkspaceHint', {
            workspace: unlinkCandidate?.name ?? '',
          })}
        </p>
      </Modal>
    </>
  );
}

const BOARD_ROLE_LABEL_KEYS: Record<string, string> = {
  owner: 'settings.owner',
  member: 'settings.member',
  viewer: 'settings.viewer',
  manager: 'board.roleManager',
  worker: 'board.roleWorker',
};

function boardRoleKey(role: string): string {
  return BOARD_ROLE_LABEL_KEYS[role] ?? 'settings.member';
}

function boardRoleValue(role: string): 'viewer' | 'manager' | 'worker' {
  if (role === 'viewer') return 'viewer';
  if (role === 'worker') return 'worker';
  return 'manager';
}

function BoardLabelsDialog({
  boardId,
  onClose,
  onLabelDeleted,
}: {
  boardId: string;
  onClose: () => void;
  onLabelDeleted?: (labelId: string) => void;
}) {
  const { t } = useTranslation();
  const boardQuery = useBoard(boardId);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('board.manageLabels')}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <LabelManager
        boardId={boardId}
        labels={boardQuery.data?.labels ?? []}
        onLabelDeleted={onLabelDeleted}
      />
    </Modal>
  );
}
