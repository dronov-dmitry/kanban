import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, useToast } from '../../components/ui';
import { ApiError, get, post } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';

interface InvitationPreview {
  role: string;
  email: string | null;
  inviter_name: string;
  expires_at: number;
  workspace: { id: string; name: string; slug: string };
}

export function InvitePage() {
  const { t } = useTranslation();
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  const auth = useAuthStore();
  const toast = useToast();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepted' | 'declined' | 'error'>(
    'loading',
  );
  const [workspace, setWorkspace] = useState<{ name: string; slug: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth.user) {
      void navigate({ to: '/login', search: { redirect: `/invite/${token}` } as any });
      return;
    }
    let active = true;
    void get<{ invitation: InvitationPreview }>(`/v1/invitations/${token}`)
      .then((response) => {
        if (!active) return;
        setPreview(response.invitation);
        setStatus('ready');
      })
      .catch((caught: any) => {
        if (!active) return;
        setError(caught?.problem?.detail ?? t('errors.token'));
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [auth.user, token, navigate, t]);

  async function accept() {
    setBusy(true);
    setError('');
    try {
      const response = await post<{ workspace: { name: string; slug: string } }>(
        `/v1/invitations/${token}/accept`,
      );
      setWorkspace(response.workspace);
      setStatus('accepted');
    } catch (caught: any) {
      setError(
        caught?.code === 'workspace_join_limit'
          ? t('errors.workspaceJoinLimit')
          : (caught?.problem?.detail ?? t('errors.token')),
      );
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError('');
    try {
      await post(`/v1/invitations/${token}/decline`);
      toast.push(t('invite.declined'), { kind: 'success' });
      setStatus('declined');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
      );
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

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
          {status === 'loading' ? <span className="spinner" /> : null}
          <h1 style={{ fontSize: 24 }}>
            {status === 'loading'
              ? t('common.loading')
              : status === 'accepted'
                ? workspace?.name
                : status === 'declined'
                  ? t('invite.declinedTitle')
                  : preview
                    ? preview.workspace.name
                    : t('errors.token')}
          </h1>

          {status === 'ready' && preview ? (
            <>
              <p className="muted small">
                {t('invite.preview', {
                  workspace: preview.workspace.name,
                  name: preview.inviter_name,
                })}
              </p>
              <p className="caption subtle">{t(`settings.${preview.role}`)}</p>
              <div className="row" style={{ marginTop: 12 }}>
                <Button variant="primary" onClick={() => void accept()} disabled={busy}>
                  {busy ? <span className="spinner" /> : t('invite.accept')}
                </Button>
                <Button variant="ghost" onClick={() => void decline()} disabled={busy}>
                  {t('invite.decline')}
                </Button>
              </div>
            </>
          ) : null}

          {status === 'accepted' ? (
            <>
              <p className="muted small">{t('workspace.members')}</p>
              <Link to="/app/$wsSlug" params={{ wsSlug: workspace!.slug }} className="btn primary">
                {t('nav.boards')}
              </Link>
            </>
          ) : null}

          {status === 'declined' ? <p className="muted small">{t('invite.declinedHint')}</p> : null}

          {status === 'error' ? (
            <>
              <div className="alert error">{error}</div>
              <Link to="/app" className="btn">
                {t('common.back')}
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
