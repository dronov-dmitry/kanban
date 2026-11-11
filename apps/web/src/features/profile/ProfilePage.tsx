import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, EmptyState, Icon, Modal, useToast } from '../../components/ui';
import { setLanguage } from '../../i18n';
import { del, downloadWithAuth, get, patch, post } from '../../lib/api';
import type { IdentityInfo, ServiceInviteRow, SessionInfo } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';
import { GOOGLE_CLIENT_ID } from '../../lib/config';
import { clearOfflineData } from '../../lib/offline';
import { useUpdateSettings } from '../../lib/queries';
import { formatDateTime } from '../../lib/utils';

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [
      'Europe/Moscow',
      'Europe/London',
      'Europe/Berlin',
      'America/New_York',
      'Asia/Tokyo',
      'UTC',
    ];
  }
})();

const SIGN_IN_PROVIDERS: Array<{ id: 'google'; label: string; configured: boolean }> = [
  { id: 'google', label: 'Google', configured: Boolean(GOOGLE_CLIENT_ID) },
];

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const auth = useAuthStore();
  const updateSettings = useUpdateSettings();
  const [name, setName] = useState(auth.user?.display_name ?? '');
  const [timezone, setTimezone] = useState(auth.user?.timezone ?? 'Europe/Moscow');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [createdInviteUrl, setCreatedInviteUrl] = useState('');

  const identities = useQuery({
    queryKey: ['identities'],
    queryFn: () => get<{ data: IdentityInfo[] }>('/v1/me/identities'),
  });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => get<{ data: SessionInfo[] }>('/v1/me/sessions'),
  });
  const serviceInvites = useQuery({
    queryKey: ['service-invites'],
    queryFn: () => get<{ data: ServiceInviteRow[] }>('/v1/service-invites'),
  });

  useEffect(() => {
    setName(auth.user?.display_name ?? '');
    setTimezone(auth.user?.timezone ?? 'Europe/Moscow');
  }, [auth.user?.timezone, auth.user?.display_name]);

  if (!auth.user)
    return (
      <div className="page">
        <EmptyState icon="user" title={t('errors.notFound')} />
      </div>
    );

  async function saveProfile() {
    try {
      const response = await patch<{ user: typeof auth.user }>('/v1/me', {
        displayName: name.trim(),
        timezone,
      });
      if (response.user) auth.updateUser(response.user);
      toast.push(t('common.saved'), { kind: 'success' });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function changeLanguage(locale: 'ru' | 'en') {
    setLanguage(locale);
    try {
      await patch('/v1/me', { locale });
      auth.updateUser({ locale });
    } catch {
      // language is mostly a client preference
    }
  }

  async function linkProvider(provider: 'google') {
    try {
      const response = await post<{ url: string }>('/v1/me/identities/link', { provider });
      if (response.url) window.location.href = response.url;
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function unlinkProvider(provider: 'google') {
    try {
      await del(`/v1/me/identities/${provider}`);
      await queryClient.invalidateQueries({ queryKey: ['identities'] });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    }
  }

  async function revokeSession(id: string) {
    await del(`/v1/me/sessions/${id}`);
    await queryClient.invalidateQueries({ queryKey: ['sessions'] });
  }

  async function revokeAll() {
    await post('/v1/auth/logout-all');
    toast.push(t('common.logout'), { kind: 'success' });
    await queryClient.invalidateQueries({ queryKey: ['sessions'] });
  }

  async function exportData() {
    await downloadWithAuth('/v1/me/export', 'kanban-export.json');
  }

  async function createServiceInvite() {
    try {
      const response = await post<{ invite: ServiceInviteRow & { url: string } }>(
        '/v1/service-invites',
        {
          email: inviteEmail.trim() || undefined,
          note: inviteNote.trim() || undefined,
        },
      );
      setCreatedInviteUrl(response.invite.url);
      setInviteEmail('');
      setInviteNote('');
      void navigator.clipboard.writeText(response.invite.url);
      await queryClient.invalidateQueries({ queryKey: ['service-invites'] });
      toast.push(t('common.copied'), { kind: 'success' });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    }
  }

  async function revokeServiceInvite(id: string) {
    await del(`/v1/service-invites/${id}`);
    await queryClient.invalidateQueries({ queryKey: ['service-invites'] });
  }

  async function deleteAccount() {
    try {
      await del('/v1/me');
      await clearOfflineData();
      auth.clear();
      await navigate({ to: '/' });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header className="page-header">
        <div className="row">
          <Avatar name={auth.user.display_name} src={auth.user.avatar_url} size="lg" />
          <div>
            <h1 style={{ fontSize: 24 }}>{auth.user.display_name}</h1>
            <p className="muted small" style={{ marginTop: 2 }}>
              {auth.user.email}
            </p>
          </div>
        </div>
        <span className={auth.user.email_verified_at ? 'badge success' : 'badge warning'}>
          {auth.user.email_verified_at
            ? t('settings.emailVerified')
            : t('settings.emailNotVerified')}
        </span>
      </header>

      <div className="stack" style={{ gap: 16 }}>
        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('common.profile')}</h2>
          <div className="stack">
            <div>
              <label className="label" htmlFor="profile-name">
                {t('common.name')}
              </label>
              <input
                id="profile-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-tz">
                {t('common.timezone')}
              </label>
              <select
                id="profile-tz"
                className="select"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">{t('common.language')}</span>
              <div className="row">
                <button
                  type="button"
                  className={`chip${i18n.language === 'ru' ? ' active' : ''}`}
                  onClick={() => void changeLanguage('ru')}
                >
                  Русский
                </button>
                <button
                  type="button"
                  className={`chip${i18n.language === 'en' ? ' active' : ''}`}
                  onClick={() => void changeLanguage('en')}
                >
                  English
                </button>
              </div>
            </div>
            <div className="row">
              <Button variant="primary" onClick={() => void saveProfile()} disabled={!name.trim()}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </section>

        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('common.theme')}</h2>
          <div className="row wrap" style={{ gap: 16 }}>
            <div>
              <span className="label">{t('common.theme')}</span>
              <div className="row">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`chip${(auth.settings?.theme ?? 'system') === theme ? ' active' : ''}`}
                    onClick={() => void updateSettings({ theme })}
                  >
                    {t(`settings.theme${theme[0]!.toUpperCase()}${theme.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">{t('common.density')}</span>
              <div className="row">
                {(['comfortable', 'compact'] as const).map((density) => (
                  <button
                    key={density}
                    type="button"
                    className={`chip${(auth.settings?.density ?? 'comfortable') === density ? ' active' : ''}`}
                    onClick={() => void updateSettings({ density })}
                  >
                    {t(`settings.density${density[0]!.toUpperCase()}${density.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>
            <label className="checkbox" style={{ alignSelf: 'flex-end' }}>
              <input
                type="checkbox"
                checked={Boolean(auth.settings?.reduced_motion)}
                onChange={(event) => void updateSettings({ reducedMotion: event.target.checked })}
              />
              {t('settings.reducedMotion')}
            </label>
          </div>
        </section>

        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('settings.sessions')}</h2>
          {(sessions.data?.data ?? []).map((session) => (
            <div className="member-row" key={session.id}>
              <span className="avatar sm">
                <Icon name="key" size={13} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small truncate">{session.user_agent ?? 'Unknown device'}</div>
                <div className="caption subtle">
                  {formatDateTime(session.created_at, i18n.language)} ·{' '}
                  {formatDateTime(session.expires_at, i18n.language)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                onClick={() => void revokeSession(session.id)}
              >
                {t('settings.revoke')}
              </Button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 10 }}>
            <Button size="sm" onClick={() => void revokeAll()}>
              {t('settings.revoke')} — {t('common.all').toLowerCase()}
            </Button>
          </div>
        </section>

        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('settings.identities')}</h2>
          {SIGN_IN_PROVIDERS.map((provider) => {
            const identity = identities.data?.data.find((item) => item.provider === provider.id);
            return (
              <div className="member-row" key={provider.id} style={{ padding: 0, border: 'none' }}>
                <span className="avatar sm">
                  <Icon name="globe" size={13} />
                </span>
                <div className="grow">
                  <div className="small strong">{provider.label}</div>
                  <div className="caption subtle">
                    {identity
                      ? `${identity.email ?? provider.label} · ${formatDateTime(identity.linked_at, i18n.language)}`
                      : t('settings.notLinked')}
                  </div>
                </div>
                {identity ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void unlinkProvider(provider.id)}
                  >
                    {t('common.remove')}
                  </Button>
                ) : provider.configured ? (
                  <Button size="sm" icon="link" onClick={() => void linkProvider(provider.id)}>
                    {provider.label}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>{t('settings.inviteToService')}</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>
            {t('settings.inviteToServiceHint')}
          </p>
          <div className="stack">
            <input
              className="input"
              type="email"
              placeholder={t('settings.inviteEmail')}
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
            <input
              className="input"
              placeholder={t('settings.inviteNote')}
              value={inviteNote}
              onChange={(event) => setInviteNote(event.target.value)}
            />
            <Button variant="primary" onClick={() => void createServiceInvite()}>
              {t('settings.createInviteLink')}
            </Button>
          </div>
          {createdInviteUrl ? (
            <div className="alert info" style={{ marginTop: 12 }}>
              <div className="spread">
                <span className="small">{t('settings.inviteLinkLabel')}</span>
                <Button
                  size="sm"
                  icon="copy"
                  onClick={() => void navigator.clipboard.writeText(createdInviteUrl)}
                >
                  {t('common.copy')}
                </Button>
              </div>
              <div className="mono truncate" style={{ marginTop: 6 }}>
                {createdInviteUrl}
              </div>
            </div>
          ) : null}
          <hr className="divider" />
          {(serviceInvites.data?.data ?? []).length === 0 ? (
            <p className="small subtle">{t('common.noData')}</p>
          ) : (
            (serviceInvites.data?.data ?? []).map((invite) => (
              <div className="member-row" key={invite.id}>
                <span className="avatar sm">
                  <Icon name="link" size={13} />
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small strong truncate">
                    {invite.email ?? t('settings.inviteLinkLabel')}
                  </div>
                  <div className="caption subtle">
                    {invite.accepted_at
                      ? `${t('settings.inviteAccepted')} · ${invite.accepted_by_name ?? ''}`
                      : `${t('settings.inviteActive')} · ${formatDateTime(invite.expires_at, i18n.language)}`}
                  </div>
                </div>
                {!invite.accepted_at ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="trash"
                    onClick={() => void revokeServiceInvite(invite.id)}
                  />
                ) : null}
              </div>
            ))
          )}
        </section>

        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('settings.exportData')}</h2>
          <div className="row wrap">
            <Button icon="download" onClick={() => void exportData()}>
              {t('settings.exportData')}
            </Button>
          </div>
        </section>

        <section className="card-panel danger-zone">
          <h2 style={{ fontSize: 16 }}>{t('settings.deleteAccount')}</h2>
          <p className="small muted" style={{ margin: '6px 0 12px' }}>
            {t('settings.deleteAccountWarning')}
          </p>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t('settings.deleteAccount')}
          </Button>
        </section>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('settings.deleteAccount')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void deleteAccount()}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="small">{t('settings.deleteAccountWarning')}</p>
      </Modal>
    </div>
  );
}
