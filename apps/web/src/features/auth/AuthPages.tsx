import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui';
import { ApiError, post } from '../../lib/api';
import type { SessionPayloadResponse } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';
import { API_URL, GOOGLE_CLIENT_ID } from '../../lib/config';

function withBasePath(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function errorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_credentials':
        return t('errors.invalidCredentials');
      case 'account_exists':
        return t('errors.accountExists');
      case 'rate_limited':
        return t('errors.rateLimited');
      case 'invalid_token':
      case 'invalid_code':
        return t('errors.token');
      case 'email_unverified':
        return t('errors.emailUnverified');
      case 'account_banned':
        return t('errors.accountBanned');
      case 'network':
        return t('errors.network');
      default:
        return error.problem.detail ?? t('errors.generic');
    }
  }
  return t('errors.generic');
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="auth-page">
      <div className="auth-art">
        <Link to="/" className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="logo-mark" aria-hidden="true">
            <Icon name="board" size={18} />
          </span>
          <span className="strong">Kanban</span>
        </Link>
        <div className="stack">
          <h2>{t('landing.headline')}</h2>
          <p className="quote">{t('landing.lead')}</p>
          <div className="row" style={{ gap: 16, color: 'var(--color-text-subtle)', fontSize: 12 }}>
            <span>
              <Icon name="check" size={13} /> {t('landing.offlineNote')}
            </span>
            <span>
              <Icon name="check" size={13} /> {t('landing.free')}
            </span>
          </div>
        </div>
        <p className="caption subtle">{t('landing.footer')}</p>
      </div>
      <div className="auth-main">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.3 7.3 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

function OAuthButtons() {
  const { t } = useTranslation();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const redirect = search.redirect;

  if (!GOOGLE_CLIENT_ID) {
    return <div className="alert error">{t('auth.notConfigured')}</div>;
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <a
        className="btn"
        href={`${API_URL}/v1/auth/google/start${
          redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
        }`}
        style={{ width: '100%' }}
      >
        <GoogleIcon />
        {t('auth.google')}
      </a>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    redirect?: string;
    oauth?: string;
    linked?: string;
  };
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    if (search.redirect) {
      window.location.assign(withBasePath(search.redirect));
      return;
    }
    void navigate({ to: '/app' });
  }, [user, navigate, search.redirect]);

  const oauthError = search.oauth
    ? ({
        access_denied: t('auth.oauthAccessDenied'),
        invalid_state: t('auth.oauthInvalidState'),
        email_not_verified: t('auth.oauthEmailNotVerified'),
        provider_error: t('auth.oauthProviderError'),
        account_exists: t('auth.oauthAccountExists'),
        banned: t('auth.oauthBanned'),
      }[search.oauth] ?? t('auth.oauthFailed'))
    : null;

  const linkedProvider = search.linked === 'google' ? 'Google' : null;

  return (
    <AuthShell>
      <div>
        <h1 style={{ fontSize: 26 }}>{t('auth.loginTitle')}</h1>
        <p className="muted small" style={{ marginTop: 5 }}>
          {t('auth.loginSubtitle')}
        </p>
      </div>
      {oauthError ? <div className="alert error">{oauthError}</div> : null}
      {linkedProvider ? (
        <div className="alert success">{t('auth.linked', { provider: linkedProvider })}</div>
      ) : null}
      <OAuthButtons />
      <p className="small muted" style={{ textAlign: 'center' }}>
        {t('auth.terms')}
      </p>
    </AuthShell>
  );
}

export function OAuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { code?: string; redirect?: string };
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.code) {
      setError(t('errors.token'));
      return;
    }
    void post<SessionPayloadResponse>('/v1/auth/oauth/exchange', { code: search.code })
      .then(async (response) => {
        setSession(response);
        if (search.redirect) {
          window.location.assign(withBasePath(search.redirect));
          return;
        }
        await navigate({ to: '/app' });
      })
      .catch((caught) => setError(errorMessage(caught, t)));
  }, [search.code, search.redirect, setSession, navigate, t]);

  return (
    <AuthShell>
      <div className="stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        {error ? null : <span className="spinner" />}
        <h1 style={{ fontSize: 24 }}>{t('auth.oauthCallback')}</h1>
        {error ? <div className="alert error">{error}</div> : null}
        {error ? (
          <Link to="/login" className="btn primary">
            {t('common.login')}
          </Link>
        ) : null}
      </div>
    </AuthShell>
  );
}
