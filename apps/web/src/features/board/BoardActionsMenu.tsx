import type { Board, BoardVisibility, CardLabel } from '@kanban/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Menu, MenuItem, Modal, useToast } from '../../components/ui';
import { ApiError, del, downloadWithAuth, patch, post } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { useBoard } from '../../lib/queries';
import { LIST_COLORS } from '../../lib/utils';
import { LabelManager } from './LabelManager';

interface BoardActionsMenuProps {
  board: Board;
  canWrite: boolean;
  canManageBoard: boolean;
  onLabelsDeleted?: (labelId: string) => void;
  initialSettingsOpen?: boolean;
}

export function BoardActionsMenu({
  board,
  canWrite,
  canManageBoard,
  onLabelsDeleted,
  initialSettingsOpen,
}: BoardActionsMenuProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { wsSlug } = useParams({ strict: false }) as { wsSlug?: string };
  const isPro = useAuthStore((state) => state.user?.plan === 'pro');

  const [settingsOpen, setSettingsOpen] = useState(Boolean(initialSettingsOpen));
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function archiveBoard() {
    try {
      await patch(`/v1/boards/${board.id}`, { archived: true });
      await queryClient.invalidateQueries({ queryKey: ['boards', board.workspace_id] });
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
      await queryClient.invalidateQueries({ queryKey: ['boards', board.workspace_id] });
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

  return (
    <>
      <Menu
        trigger={(props) => (
          <Button size="sm" icon="more" aria-label={t('common.actions')} {...props} />
        )}
      >
        <MenuItem
          icon="edit"
          onClick={() => {
            setSettingsOpen(true);
          }}
        >
          {t('board.boardSettings')}
        </MenuItem>
        {canWrite ? (
          <MenuItem icon="tag" onClick={() => setLabelsOpen(true)}>
            {t('board.manageLabels')}
          </MenuItem>
        ) : null}
        <MenuItem
          icon="plus"
          onClick={() =>
            void navigate({
              to: '/share/board-accept/$boardId',
              params: { boardId: board.id },
            })
          }
        >
          {t('board.addToWorkspace')}
        </MenuItem>
        <MenuItem icon="duplicate" onClick={() => void duplicateBoard()}>
          {t('common.duplicate')}
        </MenuItem>
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
  const boardQuery = useBoard(board.id);
  const snapshot = boardQuery.data;
  const isPro = useAuthStore((state) => state.user?.plan === 'pro');
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? '');
  const [cover, setCover] = useState(board.cover ?? LIST_COLORS[0]!);
  const [visibility, setVisibility] = useState<BoardVisibility>(board.visibility ?? 'private');
  const [saving, setSaving] = useState(false);

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

  return (
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
  );
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
