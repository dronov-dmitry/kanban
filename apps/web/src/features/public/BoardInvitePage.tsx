import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Icon } from '../../components/ui';
import { ApiError, get, post } from '../../lib/api';
import type { BoardShareLinkInfo } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';

function appHref(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function BoardInvitePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams({ strict: false }) as { token: string };
  const auth = useAuthStore();
  const [error, setError] = useState('');
  const started = useRef(false);

  const infoQuery = useQuery({
    queryKey: ['board-invite', token],
    queryFn: () => get<BoardShareLinkInfo>(`/v1/public/board-links/${token}`),
    retry: 1,
  });

  useEffect(() => {
    if (!auth.user || !infoQuery.data || started.current) return;
    started.current = true;
    void post<{ board_id: string; workspace_slug: string }>(
      `/v1/public/board-links/${token}/accept`,
    )
      .then((response) => {
        window.location.assign(appHref(`/share/board-accept/${response.board_id}`));
      })
      .catch((caught) => {
        setError(
          caught instanceof ApiError
            ? (caught.problem.detail ?? t('errors.generic'))
            : t('errors.generic'),
        );
      });
  }, [auth.user, infoQuery.data, token, t]);

  const info = infoQuery.data;

  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <div className="auth-main">
        <div
          className="auth-card card-panel"
          style={{ padding: 28, alignItems: 'center', textAlign: 'center' }}
        >
          <span className="logo-mark" style={{ marginBottom: 8 }}>
            <Icon name="board" size={18} />
          </span>
          <h1 style={{ fontSize: 24 }}>{t('boardInvite.title')}</h1>
          {infoQuery.isLoading ? <span className="spinner" /> : null}
          {!infoQuery.isLoading && !info ? (
            <div className="alert error">{t('boardInvite.invalid')}</div>
          ) : null}
          {info ? (
            <>
              <p className="muted small">
                {t('boardInvite.subtitle', {
                  board: info.board.name,
                  workspace: info.workspace.name,
                })}
              </p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                <Avatar name={info.inviter_name ?? 'Kanban'} />
                <span className="small">
                  {t('join.invitedBy', { name: info.inviter_name ?? 'Kanban' })}
                </span>
              </div>
              <span className="badge info" style={{ marginTop: 8 }}>
                {info.role === 'viewer' ? t('board.canView') : t('board.canEdit')}
              </span>
            </>
          ) : null}
          {error ? <div className="alert error">{error}</div> : null}
          {info && !auth.user ? (
            <a
              className="btn primary"
              href={appHref(`/login?redirect=${encodeURIComponent(`/share/board-link/${token}`)}`)}
            >
              {t('boardInvite.signIn')}
            </a>
          ) : null}
          {info && auth.user && !error ? (
            <div className="row" style={{ justifyContent: 'center' }}>
              <span className="spinner" />
              <span className="small muted">{t('boardInvite.joining')}</span>
            </div>
          ) : null}
          {!infoQuery.isLoading ? (
            <Button
              variant="ghost"
              size="sm"
              style={{ marginTop: 8 }}
              onClick={() => window.location.assign(appHref('/'))}
            >
              {t('common.back')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
