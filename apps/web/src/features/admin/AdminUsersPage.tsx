import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, EmptyState, Icon, Modal, useToast } from '../../components/ui';
import { del, get, patch, post } from '../../lib/api';
import type { AdminBanRow, AdminSubscriptionRow, AdminUserRow } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';
import { formatDateTime } from '../../lib/utils';

/** Site-wide administration: user directory and e-mail bans. */
export function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuthStore();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const isStaff = auth.user?.is_staff === 1;

  const users = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => get<{ data: AdminUserRow[] }>(`/v1/admin/users?q=${encodeURIComponent(search)}`),
    enabled: isStaff,
  });
  const bans = useQuery({
    queryKey: ['admin-bans'],
    queryFn: () => get<{ data: AdminBanRow[] }>('/v1/admin/bans'),
    enabled: isStaff,
  });

  if (!isStaff) {
    return (
      <div className="page">
        <EmptyState icon="lock" title={t('admin.noAccess')} />
      </div>
    );
  }

  const activeBans = (bans.data?.data ?? []).filter((ban) => !ban.workspace_id);
  const banByEmail = new Map(activeBans.map((ban) => [ban.email.toLowerCase(), ban]));

  async function submitBan() {
    if (!target || busy) return;
    setBusy(true);
    try {
      const trimmed = reason.trim();
      await post('/v1/admin/bans', {
        email: target.email,
        ...(trimmed ? { reason: trimmed } : {}),
      });
      toast.push(t('admin.banSuccess'), { kind: 'success' });
      setTarget(null);
      setReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-bans'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      ]);
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function setPro(userRow: AdminUserRow, plan: 'free' | 'pro') {
    if (busy) return;
    setBusy(true);
    try {
      const response = await patch<{ subscription: AdminSubscriptionRow | null }>(
        `/v1/admin/users/${userRow.id}/subscription`,
        { plan },
      );
      toast.push(t(plan === 'pro' ? 'admin.proGranted' : 'admin.proRevoked'), {
        kind: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      if (userRow.id === auth.user?.id) {
        auth.updateUser({
          plan,
          pro_until: response.subscription?.current_period_end ?? null,
        });
      }
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function unban(ban: AdminBanRow) {
    if (busy) return;
    setBusy(true);
    try {
      await del(`/v1/admin/bans/${ban.id}`);
      toast.push(t('admin.unbanSuccess'), { kind: 'success' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-bans'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      ]);
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  function applySearch() {
    setSearch(term.trim());
  }

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <header className="page-header">
        <div>
          <h1 style={{ fontSize: 24 }}>{t('admin.title')}</h1>
          <p className="muted small" style={{ marginTop: 2 }}>
            {t('admin.subtitle')}
          </p>
        </div>
        <span className="badge primary">
          <Icon name="shield" size={12} /> {t('admin.staff')}
        </span>
      </header>

      <div className="stack" style={{ gap: 16 }}>
        <section className="card-panel">
          <div className="row" style={{ marginBottom: 12 }}>
            <input
              className="input grow"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch();
              }}
              placeholder={t('admin.searchPlaceholder')}
              aria-label={t('admin.searchPlaceholder')}
            />
            <Button icon="search" onClick={applySearch}>
              {t('common.search')}
            </Button>
          </div>

          {users.isLoading ? (
            <p className="small muted">{t('common.loading')}</p>
          ) : (users.data?.data ?? []).length === 0 ? (
            <EmptyState icon="users" title={t('admin.empty')} />
          ) : (
            (users.data?.data ?? []).map((userRow) => {
              const ban = banByEmail.get(userRow.email.toLowerCase());
              const isSelf = userRow.id === auth.user?.id;
              return (
                <div className="member-row" key={userRow.id}>
                  <Avatar name={userRow.display_name} src={userRow.avatar_url} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="small strong truncate">{userRow.display_name}</span>
                      {userRow.is_staff ? (
                        <span className="badge info">{t('admin.staff')}</span>
                      ) : null}
                      {userRow.is_pro ? (
                        <span className="badge primary">
                          <Icon name="star" size={12} /> {t('admin.pro')}
                        </span>
                      ) : null}
                      {ban ? <span className="badge danger">{t('admin.banned')}</span> : null}
                    </div>
                    <div className="caption subtle truncate">{userRow.email}</div>
                    <div className="caption subtle">
                      {t('admin.joined')}: {formatDateTime(userRow.created_at, i18n.language)} ·{' '}
                      {t('admin.workspaces')}: {userRow.workspace_count}
                    </div>
                    {userRow.is_pro && userRow.current_period_end ? (
                      <div className="caption subtle">
                        {t('admin.proUntil')}:{' '}
                        {formatDateTime(userRow.current_period_end, i18n.language)}
                      </div>
                    ) : null}
                    {ban?.reason ? (
                      <div className="caption muted">
                        {t('admin.reason')}: {ban.reason}
                      </div>
                    ) : null}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Button
                      size="sm"
                      variant={userRow.is_pro ? 'ghost' : 'soft'}
                      icon="star"
                      disabled={busy}
                      onClick={() => void setPro(userRow, userRow.is_pro ? 'free' : 'pro')}
                    >
                      {userRow.is_pro ? t('admin.revokePro') : t('admin.grantPro')}
                    </Button>
                    {ban ? (
                      <Button
                        size="sm"
                        icon="check"
                        disabled={busy}
                        onClick={() => void unban(ban)}
                      >
                        {t('admin.unban')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        icon="lock"
                        disabled={busy || isSelf || userRow.is_staff === 1}
                        title={
                          isSelf
                            ? t('admin.selfBan')
                            : userRow.is_staff === 1
                              ? t('admin.staffBan')
                              : undefined
                        }
                        onClick={() => {
                          setReason('');
                          setTarget(userRow);
                        }}
                      >
                        {t('admin.ban')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('admin.bannedList')}</h2>
          {activeBans.length === 0 ? (
            <p className="small muted">{t('admin.bansEmpty')}</p>
          ) : (
            activeBans.map((ban) => (
              <div className="member-row" key={ban.id}>
                <span className="avatar sm" aria-hidden="true">
                  <Icon name="lock" size={13} />
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small strong truncate">{ban.email}</div>
                  <div className="caption subtle">
                    {ban.expires_at
                      ? `${t('admin.until')}: ${formatDateTime(ban.expires_at, i18n.language)}`
                      : t('admin.permanent')}
                    {ban.banned_by_name ? ` · ${t('admin.blockedBy')}: ${ban.banned_by_name}` : ''}
                  </div>
                  {ban.reason ? (
                    <div className="caption muted">
                      {t('admin.reason')}: {ban.reason}
                    </div>
                  ) : null}
                </div>
                <Button size="sm" icon="check" disabled={busy} onClick={() => void unban(ban)}>
                  {t('admin.unban')}
                </Button>
              </div>
            ))
          )}
        </section>
      </div>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={t('admin.banTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void submitBan()}>
              {t('admin.banConfirm')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small muted">{target?.email}</p>
          <div>
            <label className="label" htmlFor="ban-reason">
              {t('admin.banReason')}
            </label>
            <textarea
              id="ban-reason"
              className="textarea"
              data-autofocus
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('admin.banReasonPlaceholder')}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
