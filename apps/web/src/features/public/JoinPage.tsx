import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Icon, useToast } from '../../components/ui';
import { ApiError, get, post } from '../../lib/api';
import type { PublicServiceInvite } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';

function appHref(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function JoinPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams({ strict: false }) as { token: string };
  const auth = useAuthStore();
  const toast = useToast();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inviteQuery = useQuery({
    queryKey: ['service-invite', token],
    queryFn: () => get<PublicServiceInvite>(`/v1/public/service-invites/${token}`),
    retry: 1,
  });

  async function accept() {
    setBusy(true);
    setError('');
    try {
      await post(`/v1/service-invites/${token}/accept`);
      setAccepted(true);
      toast.push(t('join.accepted'), { kind: 'success' });
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

  const invite = inviteQuery.data;
  const valid = Boolean(invite?.valid) && !accepted;
  const alreadyAccepted = Boolean(invite?.accepted) || accepted;

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
          <h1 style={{ fontSize: 24 }}>{t('join.title')}</h1>
          {inviteQuery.isLoading ? <span className="spinner" /> : null}
          {invite && !invite.valid && !alreadyAccepted ? (
            <div className="alert error">{t('join.invalid')}</div>
          ) : null}
          {invite?.valid ? (
            <>
              <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                <Avatar name={invite.inviter_name ?? 'Kanban'} src={invite.inviter_avatar_url} />
                <span className="small">
                  {t('join.invitedBy', { name: invite.inviter_name ?? 'Kanban' })}
                </span>
              </div>
              {invite.note ? <p className="small muted">{invite.note}</p> : null}
              {invite.email ? (
                <p className="caption subtle">{t('join.forEmail', { email: invite.email })}</p>
              ) : null}
            </>
          ) : null}
          {error ? <div className="alert error">{error}</div> : null}
          {alreadyAccepted ? (
            <>
              <div className="alert success">{t('join.accepted')}</div>
              <a href={appHref('/app')} className="btn primary">
                {t('nav.boards')}
              </a>
            </>
          ) : valid ? (
            auth.user ? (
              <Button variant="primary" onClick={() => void accept()} disabled={busy}>
                {t('join.accept')}
              </Button>
            ) : (
              <a
                className="btn primary"
                href={appHref(`/login?redirect=${encodeURIComponent(`/join/${token}`)}`)}
              >
                {t('join.signInToAccept')}
              </a>
            )
          ) : null}
          <a href={appHref('/')} className="btn ghost sm" style={{ marginTop: 8 }}>
            {t('common.back')}
          </a>
        </div>
      </div>
    </div>
  );
}
