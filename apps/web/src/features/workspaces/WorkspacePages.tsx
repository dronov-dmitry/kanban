import type { BoardTemplate } from '@kanban/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Button,
  EmptyState,
  Icon,
  Modal,
  SkeletonBoard,
  useToast,
} from '../../components/ui';
import { useWorkspace } from '../../components/workspace-context';
import { patch, post } from '../../lib/api';
import type { BoardSummary, WorkspaceSummary } from '../../lib/api-types';
import { useBoards, useMembers, useMyTasks, useWorkspaces } from '../../lib/queries';
import { formatDue, LABEL_PALETTE, taskCountLabel } from '../../lib/utils';

const TEMPLATES: Array<{ id: BoardTemplate; icon: string }> = [
  { id: 'empty', icon: 'board' },
  { id: 'development', icon: 'keyboard' },
  { id: 'content', icon: 'edit' },
  { id: 'personal', icon: 'user' },
  { id: 'hiring', icon: 'users' },
  { id: 'sprint', icon: 'flag' },
];

export function WorkspaceRedirectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const first = workspaces.data?.data[0];
    if (first) {
      void navigate({ to: '/app/$wsSlug', params: { wsSlug: first.slug }, replace: true });
    }
  }, [workspaces.data, navigate]);

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const response = await post<{ workspace: WorkspaceSummary }>('/v1/workspaces', {
        name: name.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      await navigate({ to: '/app/$wsSlug', params: { wsSlug: response.workspace.slug } });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  if (workspaces.isLoading) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
        <span className="spinner" />
      </div>
    );
  }

  if (workspaces.data?.data.length) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <div className="card-panel">
        <span className="logo-mark" style={{ marginBottom: 16 }}>
          <Icon name="board" size={19} />
        </span>
        <h1 style={{ fontSize: 26 }}>{t('workspace.createFirstWorkspace')}</h1>
        <p className="muted" style={{ margin: '8px 0 20px' }}>
          {t('workspace.emptyText')}
        </p>
        <form onSubmit={createWorkspace} className="stack">
          <div>
            <label className="label" htmlFor="first-ws">
              {t('workspace.workspaceName')}
            </label>
            <input
              id="first-ws"
              className="input"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Studio"
            />
          </div>
          <Button variant="primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? <span className="spinner" /> : t('workspace.createWorkspace')}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function WorkspaceHomePage() {
  const { t } = useTranslation();
  const { workspace, role, boards: contextBoards, loading } = useWorkspace();
  const boards = useBoards(workspace?.id);
  const members = useMembers(workspace?.id);
  const myTasks = useMyTasks(workspace?.id);
  const search = useSearch({ strict: false }) as { new?: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(search.new === '1');

  useEffect(() => {
    if (search.new === '1') setCreateOpen(true);
  }, [search.new]);

  if (loading && !workspace) {
    return <SkeletonBoard />;
  }

  if (!workspace) {
    return (
      <div className="page">
        <EmptyState
          icon="board"
          title={t('errors.notFound')}
          action={
            <Link to="/app" className="btn">
              {t('common.back')}
            </Link>
          }
        />
      </div>
    );
  }

  const list = boards.data?.data ?? contextBoards;
  const myOpen = (myTasks.data?.data ?? []).filter((card) => card.due_date !== null);
  const canCreate = role === 'owner' || role === 'admin' || role === 'member';

  async function toggleFavorite(board: BoardSummary) {
    await patch(`/v1/boards/${board.id}`, { isFavorite: !board.is_favorite });
    await queryClient.invalidateQueries({ queryKey: ['boards', workspace?.id] });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{workspace.name}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {t('workspace.boards')}: {list.length} · {t('workspace.members')}:{' '}
            {members.data?.data.length ?? workspace.member_count ?? '—'}
          </p>
        </div>
        <div className="row">
          <div className="avatar-stack hide-mobile">
            {(members.data?.data ?? []).slice(0, 4).map((member) => (
              <Avatar
                key={member.user_id}
                name={member.display_name}
                src={member.avatar_url}
                size="sm"
                title={member.display_name}
              />
            ))}
          </div>
          {canCreate ? (
            <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
              {t('workspace.newBoard')}
            </Button>
          ) : null}
          {role === 'owner' || role === 'admin' ? (
            <Button
              icon="users"
              onClick={() =>
                void navigate({
                  to: '/app/$wsSlug/settings',
                  params: { wsSlug: workspace.slug },
                  search: { tab: 'members' },
                })
              }
            >
              {t('board.invite')}
            </Button>
          ) : null}
        </div>
      </header>

      {myOpen.length > 0 ? (
        <div className="card-panel" style={{ marginBottom: 20, padding: 16 }}>
          <div className="spread">
            <div className="row">
              <span className="badge warning">{t('nav.myTasks')}</span>
              <span className="small muted">
                {taskCountLabel(myOpen.length, t('common.today') === 'Today' ? 'en' : 'ru')}
              </span>
            </div>
            <Link to="/app/$wsSlug/my" params={{ wsSlug: workspace.slug }} className="small strong">
              {t('common.open')} <Icon name="arrow-right" size={13} />
            </Link>
          </div>
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            {myOpen.slice(0, 4).map((card) => (
              <Link
                key={card.id}
                to="/app/$wsSlug/boards/$boardId"
                params={{ wsSlug: workspace.slug, boardId: card.board_id }}
                search={{ card: card.id }}
                className="chip"
              >
                <Icon name="clock" size={12} />
                {card.title}
                <span className={card.due_date && card.due_date < Date.now() ? 'due-overdue' : ''}>
                  {card.due_date ? formatDue(card.due_date) : ''}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {boards.isLoading ? (
        <div className="board-grid">
          {[0, 1, 2].map((index) => (
            <div className="skeleton" key={index} style={{ height: 140 }} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon="board"
          title={t('workspace.emptyTitle')}
          text={t('workspace.emptyText')}
          action={
            canCreate ? (
              <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
                {t('workspace.newBoard')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="board-grid">
          {list.map((board) => (
            <Link
              key={board.id}
              to="/app/$wsSlug/boards/$boardId"
              params={{ wsSlug: workspace.slug, boardId: board.id }}
              className="board-card"
            >
              <span className="board-cover" style={{ background: board.cover ?? undefined }} />
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <span className="strong">{board.name}</span>
                <button
                  type="button"
                  className="favorite-star"
                  aria-label={
                    board.is_favorite ? t('workspace.unfavorite') : t('workspace.favorite')
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void toggleFavorite(board);
                  }}
                >
                  {board.is_favorite ? '★' : '☆'}
                </button>
              </div>
              {board.description ? (
                <span className="small muted clamp-2">{board.description}</span>
              ) : null}
              <span className="meta">
                <span className="row" style={{ gap: 4 }}>
                  <Icon name="list" size={13} /> {board.card_count ?? 0}
                </span>
                <span className="row" style={{ gap: 4 }}>
                  <Icon name="users" size={13} /> {members.data?.data.length ?? 1}
                </span>
                {board.archived_at ? (
                  <span className="badge warning">{t('common.archive')}</span>
                ) : null}
              </span>
            </Link>
          ))}
          {canCreate ? (
            <button
              type="button"
              className="board-card"
              style={{
                borderStyle: 'dashed',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
              }}
              onClick={() => setCreateOpen(true)}
            >
              <Icon name="plus" size={22} />
              <span>{t('workspace.newBoard')}</span>
            </button>
          ) : null}
        </div>
      )}

      {workspace ? (
        <CreateBoardModal
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            void navigate({
              to: '/app/$wsSlug',
              params: { wsSlug: workspace.slug },
              replace: true,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function CreateBoardModal({
  workspaceId,
  workspaceSlug,
  open,
  onClose,
}: {
  workspaceId: string;
  workspaceSlug: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<BoardTemplate>('empty');
  const [cover, setCover] = useState(LABEL_PALETTE[0]!);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const response = await post<{ board: { id: string } }>(
        `/v1/workspaces/${workspaceId}/boards`,
        {
          name: name.trim(),
          template,
          cover,
          description: description.trim() || null,
        },
      );
      await queryClient.invalidateQueries({ queryKey: ['boards', workspaceId] });
      onClose();
      await navigate({
        to: '/app/$wsSlug/boards/$boardId',
        params: { wsSlug: workspaceSlug, boardId: response.board.id },
      });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('workspace.newBoard')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy || !name.trim()}>
            {busy ? <span className="spinner" /> : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>
          <label className="label" htmlFor="board-name">
            {t('workspace.boardName')}
          </label>
          <input
            id="board-name"
            className="input"
            data-autofocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Product"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create();
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="board-description">
            {t('workspace.description')}
          </label>
          <input
            id="board-description"
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div>
          <span className="label">{t('workspace.template')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${template === item.id ? ' active' : ''}`}
                style={{ justifyContent: 'flex-start', padding: '8px 10px' }}
                onClick={() => setTemplate(item.id)}
              >
                <Icon name={item.icon as any} size={14} />
                {t(`workspace.templates.${item.id}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('workspace.cover')}</span>
          <div className="row wrap">
            {LABEL_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => setCover(color)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: color,
                  border:
                    cover === color
                      ? '3px solid var(--color-text)'
                      : '2px solid var(--color-surface)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-1)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
