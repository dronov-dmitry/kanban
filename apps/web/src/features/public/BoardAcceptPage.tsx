import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Icon, useToast } from '../../components/ui';
import { ApiError, get, post } from '../../lib/api';
import type { BoardAcceptanceResponse } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';

function appHref(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function BoardAcceptPage() {
  const { t } = useTranslation();
  const { boardId = '' } = useParams({ strict: false }) as { boardId: string };
  const auth = useAuthStore();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');

  const infoQuery = useQuery({
    queryKey: ['board-acceptance', boardId],
    queryFn: () => get<BoardAcceptanceResponse>(`/v1/boards/${boardId}/acceptance`),
    enabled: Boolean(auth.user && boardId),
    retry: 1,
  });
  const info = infoQuery.data;

  useEffect(() => {
    if (!info || selected) return;
    const next = info.workspaces.find((workspace) => !workspace.added) ?? info.workspaces[0];
    if (next) setSelected(next.id);
  }, [info, selected]);

  async function accept() {
    const workspace = info?.workspaces.find((row) => row.id === selected);
    if (!workspace) return;
    setBusy(true);
    setError('');
    try {
      const response = await post<{
        ok: boolean;
        board_id: string;
        workspace: { id: string; name: string; slug: string };
      }>(`/v1/boards/${boardId}/accept`, { workspaceId: workspace.id });
      await queryClient.invalidateQueries({ queryKey: ['boards', workspace.id] });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.push(t('boardAccept.added'), { kind: 'success' });
      window.location.assign(
        appHref(`/app/${response.workspace.slug}/boards/${response.board_id}`),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setDeclining(true);
    setError('');
    try {
      await post(`/v1/boards/${boardId}/decline`);
      toast.push(t('boardAccept.declined'), { kind: 'success' });
      window.location.assign(appHref('/app'));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
      );
      setDeclining(false);
    }
  }

  const openHref = info?.workspace
    ? appHref(`/app/${info.workspace.slug}/boards/${boardId}`)
    : appHref('/app');
  const selectedWorkspace = info?.workspaces.find((row) => row.id === selected);

  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <div className="auth-main">
        <div
          className="auth-card card-panel"
          style={{ padding: 28, alignItems: 'stretch', textAlign: 'left', maxWidth: 560 }}
        >
          <div style={{ textAlign: 'center' }}>
            <span className="logo-mark" style={{ marginBottom: 8 }}>
              <Icon name="board" size={18} />
            </span>
            <h1 style={{ fontSize: 24 }}>{t('boardAccept.title')}</h1>
            {info ? (
              <p className="muted small">{t('boardAccept.subtitle', { board: info.board.name })}</p>
            ) : null}
          </div>

          {infoQuery.isLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
              <span className="spinner" />
            </div>
          ) : null}

          {!infoQuery.isLoading && !info && auth.user ? (
            <div className="alert error">{t('errors.notFound')}</div>
          ) : null}

          {info ? (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar
                  name={info.creator.display_name ?? 'Kanban'}
                  src={info.creator.avatar_url}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="small strong">
                    {t('boardAccept.boardOwner', {
                      name: info.creator.display_name ?? 'Kanban',
                    })}
                  </div>
                  <div className="caption muted">
                    {info.workspace
                      ? t('boardAccept.origin', {
                          workspace: info.workspace.name,
                          owner: info.workspace.owner_name ?? '—',
                        })
                      : null}
                  </div>
                </div>
              </div>

              {info.workspaces.length > 0 ? (
                <div>
                  <span className="label">{t('boardAccept.choose')}</span>
                  <div className="stack" style={{ gap: 6 }}>
                    {info.workspaces.map((workspace) => (
                      <label
                        key={workspace.id}
                        className="member-row"
                        style={{ cursor: workspace.added ? 'default' : 'pointer' }}
                      >
                        <input
                          type="radio"
                          name="accept-workspace"
                          value={workspace.id}
                          checked={selected === workspace.id}
                          disabled={workspace.added}
                          onChange={() => setSelected(workspace.id)}
                        />
                        <span className="grow truncate">
                          <span className="small strong">{workspace.name}</span>
                          <span className="caption subtle" style={{ display: 'block' }}>
                            {t(`boardAccept.role_${info.role}`)}
                          </span>
                        </span>
                        {workspace.added ? (
                          <span className="badge">{t('boardAccept.added')}</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="small muted">{t('boardAccept.noWorkspaces')}</p>
              )}

              {selectedWorkspace?.added ? (
                <div className="alert success">{t('boardAccept.added')}</div>
              ) : null}
              {error ? <div className="alert error">{error}</div> : null}

              {info.workspaces.length > 0 && selectedWorkspace && !selectedWorkspace.added ? (
                <Button variant="primary" onClick={() => void accept()} disabled={busy}>
                  {busy ? <span className="spinner" /> : t('boardAccept.add')}
                </Button>
              ) : null}

              {info.invite ? (
                <Button variant="ghost" onClick={() => void decline()} disabled={declining}>
                  {t('boardAccept.decline')}
                </Button>
              ) : null}

              {!info.invite ? (
                <a className="btn" href={openHref}>
                  {t('boardAccept.open')}
                </a>
              ) : null}
            </div>
          ) : null}

          {!auth.user ? (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <a
                className="btn primary"
                href={appHref(
                  `/login?redirect=${encodeURIComponent(`/share/board-accept/${boardId}`)}`,
                )}
              >
                {t('boardAccept.signIn')}
              </a>
            </div>
          ) : null}

          <a
            className="btn ghost sm"
            style={{ marginTop: 8, alignSelf: 'center' }}
            href={appHref('/')}
          >
            {t('common.back')}
          </a>
        </div>
      </div>
    </div>
  );
}
