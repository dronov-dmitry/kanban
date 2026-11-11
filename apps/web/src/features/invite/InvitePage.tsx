import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui';
import { post } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';

export function InvitePage() {
  const { t } = useTranslation();
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  const auth = useAuthStore();
  const [state, setState] = useState<'pending' | 'success' | 'error'>('pending');
  const [workspace, setWorkspace] = useState<{ name: string; slug: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth.user) {
      void navigate({ to: '/login', search: { redirect: `/invite/${token}` } as any });
      return;
    }
    void post<{ workspace: { name: string; slug: string } }>(`/v1/invitations/${token}/accept`)
      .then((response) => {
        setWorkspace(response.workspace);
        setState('success');
      })
      .catch((caught: any) => {
        setError(caught?.problem?.detail ?? t('errors.token'));
        setState('error');
      });
  }, [auth.user, token, navigate, t]);

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
          {state === 'pending' ? <span className="spinner" /> : null}
          <h1 style={{ fontSize: 24 }}>
            {state === 'pending'
              ? t('common.loading')
              : state === 'success'
                ? workspace?.name
                : t('errors.token')}
          </h1>
          {state === 'success' ? (
            <>
              <p className="muted small">{t('workspace.members')}</p>
              <Link to="/app/$wsSlug" params={{ wsSlug: workspace!.slug }} className="btn primary">
                {t('nav.boards')}
              </Link>
            </>
          ) : null}
          {state === 'error' ? (
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
