import type { Role } from '@kanban/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, EmptyState, Icon, Modal, useToast } from '../../components/ui';
import { useWorkspace } from '../../components/workspace-context';
import { del, patch, post } from '../../lib/api';
import type { InvitationSummary } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';
import { useAudit, useInvitations, useMembers, useWorkspaceBans } from '../../lib/queries';
import { cn, formatDate, formatRelative } from '../../lib/utils';

type Tab = 'general' | 'members' | 'invitations' | 'bans' | 'audit' | 'danger';

export function WorkspaceSettingsPage() {
  const { t, i18n } = useTranslation();
  const { wsSlug } = useParams({ strict: false }) as { wsSlug: string };
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { workspace, role } = useWorkspace();
  const user = useAuthStore((state) => state.user);
  const members = useMembers(workspace?.id);
  const invitations = useInvitations(workspace?.id, role === 'owner' || role === 'admin');
  const audit = useAudit(workspace?.id, role === 'owner' || role === 'admin');
  const bans = useWorkspaceBans(workspace?.id, role === 'owner' || role === 'admin');

  const [tab, setTab] = useState<Tab>((search.tab as Tab) || 'general');
  const [name, setName] = useState(workspace?.name ?? '');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [inviteResult, setInviteResult] = useState<InvitationSummary | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [banEmail, setBanEmail] = useState('');
  const [banReason, setBanReason] = useState('');

  useEffect(() => {
    setName(workspace?.name ?? '');
  }, [workspace?.name]);

  if (!workspace) {
    return (
      <div className="page">
        <EmptyState icon="settings" title={t('errors.notFound')} />
      </div>
    );
  }

  const isAdmin = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';

  const tabs: Array<{ id: Tab; label: string; roles?: Role[] }> = [
    { id: 'general', label: t('settings.general') },
    { id: 'members', label: t('settings.members') },
    { id: 'invitations', label: t('settings.invitations'), roles: ['owner', 'admin'] },
    { id: 'bans', label: t('settings.bans'), roles: ['owner', 'admin'] },
    { id: 'audit', label: t('settings.audit'), roles: ['owner', 'admin'] },
    { id: 'danger', label: t('settings.danger') },
  ];

  async function saveName() {
    if (!name.trim()) return;
    try {
      await patch(`/v1/workspaces/${workspace!.id}`, { name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.push(t('common.saved'), { kind: 'success' });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function changeRole(userId: string, nextRole: Role) {
    try {
      await patch(`/v1/workspaces/${workspace!.id}/members/${userId}`, { role: nextRole });
      await queryClient.invalidateQueries({ queryKey: ['members', workspace!.id] });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.forbidden'), { kind: 'danger' });
    }
  }

  async function removeMember(userId: string) {
    try {
      await del(`/v1/workspaces/${workspace!.id}/members/${userId}`);
      await queryClient.invalidateQueries({ queryKey: ['members', workspace!.id] });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.forbidden'), { kind: 'danger' });
    }
  }

  async function createInvite() {
    try {
      const response = await post<{ invitation: InvitationSummary }>(
        `/v1/workspaces/${workspace!.id}/invitations`,
        { email: inviteEmail.trim() || undefined, role: inviteRole },
      );
      setInviteResult(response.invitation);
      setInviteEmail('');
      await queryClient.invalidateQueries({ queryKey: ['invitations', workspace!.id] });
      if (response.invitation.url) {
        void navigator.clipboard.writeText(response.invitation.url);
        toast.push(t('common.copied'), { kind: 'success' });
      }
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    }
  }

  async function revokeInvite(id: string) {
    await del(`/v1/invitations/${id}`);
    await queryClient.invalidateQueries({ queryKey: ['invitations', workspace!.id] });
  }

  async function createBan() {
    if (!banEmail.trim()) return;
    try {
      await post(`/v1/workspaces/${workspace!.id}/bans`, {
        email: banEmail.trim(),
        reason: banReason.trim() || undefined,
      });
      setBanEmail('');
      setBanReason('');
      await queryClient.invalidateQueries({ queryKey: ['bans', workspace!.id] });
      await queryClient.invalidateQueries({ queryKey: ['members', workspace!.id] });
      toast.push(t('common.saved'), { kind: 'success' });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    }
  }

  async function removeBan(id: string) {
    await del(`/v1/workspaces/${workspace!.id}/bans/${id}`);
    await queryClient.invalidateQueries({ queryKey: ['bans', workspace!.id] });
  }

  async function transferOwner() {
    if (!transferTo) return;
    try {
      await post(`/v1/workspaces/${workspace!.id}/transfer-owner`, { userId: transferTo });
      await queryClient.invalidateQueries({ queryKey: ['members', workspace!.id] });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.push(t('common.saved'), { kind: 'success' });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function deleteWorkspace() {
    if (confirmName !== workspace!.name) return;
    try {
      await del(`/v1/workspaces/${workspace!.id}`);
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      await navigate({ to: '/app' });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function leaveWorkspace() {
    if (!user) return;
    try {
      await del(`/v1/workspaces/${workspace!.id}/members/${user.id}`);
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      await navigate({ to: '/app' });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {workspace!.name} · /{workspace!.slug}
          </p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          {tabs
            .filter((item) => !item.roles || item.roles.includes(role as Role))
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn('nav-item', tab === item.id && 'active')}
                onClick={() => {
                  setTab(item.id);
                  void navigate({
                    to: '/app/$wsSlug/settings',
                    params: { wsSlug },
                    search: item.id === 'general' ? {} : { tab: item.id },
                    replace: true,
                  });
                }}
              >
                {item.label}
              </button>
            ))}
        </nav>

        <div className="stack" style={{ gap: 16 }}>
          {tab === 'general' ? (
            <div className="card-panel">
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('settings.general')}</h2>
              <label className="label" htmlFor="ws-settings-name">
                {t('settings.workspaceName')}
              </label>
              <div className="row">
                <input
                  id="ws-settings-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveName();
                  }}
                />
                <Button
                  variant="primary"
                  onClick={() => void saveName()}
                  disabled={!name.trim() || name === workspace!.name}
                >
                  {t('common.save')}
                </Button>
              </div>
              <hr className="divider" />
              <div className="spread small">
                <span className="muted">{t('settings.role')}</span>
                <span className="badge primary">{t(`settings.${role}`)}</span>
              </div>
              <div className="spread small" style={{ marginTop: 8 }}>
                <span className="muted">{t('auth.emailVerified')}</span>
                <span className={cn('badge', user?.email_verified_at ? 'success' : 'warning')}>
                  {user?.email_verified_at
                    ? t('settings.emailVerified')
                    : t('settings.emailNotVerified')}
                </span>
              </div>
            </div>
          ) : null}

          {tab === 'members' ? (
            <div className="card-panel">
              <div className="spread" style={{ marginBottom: 8 }}>
                <h2 style={{ fontSize: 16 }}>{t('settings.members')}</h2>
                {isAdmin ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onClick={() => setInviteOpen(true)}
                  >
                    {t('settings.invite')}
                  </Button>
                ) : null}
              </div>
              {(members.data?.data ?? []).map((member) => (
                <div className="member-row" key={member.user_id}>
                  <Avatar name={member.display_name} src={member.avatar_url} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="strong small truncate">
                      {member.display_name}{' '}
                      {member.user_id === user?.id ? `(${t('common.you')})` : ''}
                    </div>
                    <div className="caption subtle truncate">{member.email}</div>
                  </div>
                  {isAdmin && member.role !== 'owner' && member.user_id !== user?.id ? (
                    <select
                      className="select"
                      style={{ width: 140, minHeight: 32, padding: '4px 26px 4px 8px' }}
                      value={member.role}
                      onChange={(event) =>
                        void changeRole(member.user_id, event.target.value as Role)
                      }
                      disabled={role === 'admin' && member.role === 'admin'}
                    >
                      <option value="admin">{t('settings.admin')}</option>
                      <option value="member">{t('settings.member')}</option>
                      <option value="viewer">{t('settings.viewer')}</option>
                    </select>
                  ) : (
                    <span className="badge">{t(`settings.${member.role}`)}</span>
                  )}
                  {isAdmin && member.role !== 'owner' && member.user_id !== user?.id ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={t('settings.removeMember')}
                      onClick={() => void removeMember(member.user_id)}
                    />
                  ) : null}
                </div>
              ))}

              {isOwner ? (
                <>
                  <hr className="divider" />
                  <span className="label">{t('settings.transferOwner')}</span>
                  <div className="row">
                    <select
                      className="select"
                      value={transferTo}
                      onChange={(event) => setTransferTo(event.target.value)}
                    >
                      <option value="">—</option>
                      {(members.data?.data ?? [])
                        .filter((member) => member.role !== 'owner')
                        .map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.display_name}
                          </option>
                        ))}
                    </select>
                    <Button size="sm" onClick={() => void transferOwner()} disabled={!transferTo}>
                      {t('settings.transferOwner')}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {tab === 'invitations' ? (
            <div className="card-panel">
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('settings.invitations')}</h2>
              {inviteResult?.url ? (
                <div className="alert info" style={{ marginBottom: 12 }}>
                  <div className="spread">
                    <span className="small">{t('settings.inviteLink')}</span>
                    <Button
                      size="sm"
                      icon="copy"
                      onClick={() => void navigator.clipboard.writeText(inviteResult.url!)}
                    >
                      {t('settings.copyLink')}
                    </Button>
                  </div>
                  <div className="mono truncate" style={{ marginTop: 6 }}>
                    {inviteResult.url}
                  </div>
                </div>
              ) : null}
              <Button variant="primary" icon="plus" onClick={() => setInviteOpen(true)}>
                {t('settings.createLink')}
              </Button>
              <hr className="divider" />
              {(invitations.data?.data ?? []).length === 0 ? (
                <p className="small subtle">{t('common.noData')}</p>
              ) : (
                (invitations.data?.data ?? []).map((invitation) => (
                  <div className="member-row" key={invitation.id}>
                    <span className="avatar sm">
                      <Icon name="link" size={13} />
                    </span>
                    <div className="grow">
                      <div className="small strong">
                        {invitation.email ?? t('settings.inviteLink')}
                      </div>
                      <div className="caption subtle">
                        {t(`settings.${invitation.role}`)} ·{' '}
                        {formatDate(invitation.expires_at, i18n.language)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      onClick={() => void revokeInvite(invitation.id)}
                    />
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === 'bans' ? (
            <div className="card-panel">
              <h2 style={{ fontSize: 16, marginBottom: 6 }}>{t('settings.bans')}</h2>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {t('settings.bansHint')}
              </p>
              <div className="row wrap">
                <input
                  className="input"
                  type="email"
                  placeholder={t('common.email')}
                  value={banEmail}
                  onChange={(event) => setBanEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createBan();
                  }}
                />
                <input
                  className="input"
                  placeholder={t('settings.banReason')}
                  value={banReason}
                  onChange={(event) => setBanReason(event.target.value)}
                />
                <Button
                  variant="danger"
                  onClick={() => void createBan()}
                  disabled={!banEmail.trim()}
                >
                  {t('settings.banUser')}
                </Button>
              </div>
              <hr className="divider" />
              {(bans.data?.data ?? []).length === 0 ? (
                <p className="small subtle">{t('settings.noBans')}</p>
              ) : (
                (bans.data?.data ?? []).map((ban) => (
                  <div className="member-row" key={ban.id}>
                    <span className="avatar sm">
                      <Icon name="shield" size={13} />
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small strong truncate">{ban.email}</div>
                      <div className="caption subtle">
                        {ban.reason ?? t('settings.banNoReason')} ·{' '}
                        {formatDate(ban.created_at, i18n.language)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      onClick={() => void removeBan(ban.id)}
                    />
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === 'audit' ? (
            <div className="card-panel">
              <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t('settings.audit')}</h2>
              {(audit.data?.data ?? []).length === 0 ? (
                <p className="small subtle">{t('settings.auditEmpty')}</p>
              ) : (
                (audit.data?.data ?? []).map((event) => (
                  <div className="audit-row" key={event.id}>
                    <span className="grow">
                      <span className="strong small">{event.actor_name}</span>{' '}
                      <span className="muted small">{event.verb}</span>
                      {event.payload_json && event.payload_json !== '{}' ? (
                        <span className="caption subtle" style={{ display: 'block' }}>
                          {event.payload_json}
                        </span>
                      ) : null}
                    </span>
                    <span className="caption subtle">
                      {formatRelative(event.created_at, i18n.language)}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === 'danger' ? (
            <>
              <div className="card-panel">
                <h2 style={{ fontSize: 16 }}>{t('settings.leaveWorkspace')}</h2>
                <p className="small muted" style={{ margin: '6px 0 12px' }}>
                  {t('workspace.members')}
                </p>
                <Button variant="danger" onClick={() => void leaveWorkspace()}>
                  {t('settings.leaveWorkspace')}
                </Button>
              </div>
              <div className="card-panel danger-zone">
                <h2 style={{ fontSize: 16 }}>{t('settings.deleteWorkspace')}</h2>
                <p className="small muted" style={{ margin: '6px 0 12px' }}>
                  {t('settings.deleteWarning')}
                </p>
                <Button variant="danger" disabled={!isOwner} onClick={() => setDeleteOpen(true)}>
                  {t('settings.deleteWorkspace')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('settings.invite')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void createInvite()}
              disabled={!user?.email_verified_at}
            >
              {t('settings.createLink')}
            </Button>
          </>
        }
      >
        {!user?.email_verified_at ? (
          <div className="alert warning">{t('errors.emailUnverified')}</div>
        ) : null}
        <div className="stack" style={{ marginTop: 8 }}>
          <div>
            <label className="label" htmlFor="invite-email">
              {t('settings.inviteEmail')}
            </label>
            <input
              id="invite-email"
              className="input"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="invite-role">
              {t('settings.inviteRole')}
            </label>
            <select
              id="invite-role"
              className="select"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as Role)}
            >
              <option value="admin">{t('settings.admin')}</option>
              <option value="member">{t('settings.member')}</option>
              <option value="viewer">{t('settings.viewer')}</option>
            </select>
          </div>
          <p className="caption subtle">{t('settings.inviteLink')}</p>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('settings.deleteWorkspace')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => void deleteWorkspace()}
              disabled={confirmName !== workspace!.name}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="small muted">{t('settings.deleteWarning')}</p>
        <label className="label" htmlFor="confirm-delete" style={{ marginTop: 10 }}>
          {t('settings.dangerConfirm')}
        </label>
        <input
          id="confirm-delete"
          className="input"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
        />
      </Modal>
    </div>
  );
}
