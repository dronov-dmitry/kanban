import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';
import { get, patch, post } from '../lib/api';
import type { BoardSnapshotResponse, NotificationRow, WorkspaceSummary } from '../lib/api-types';
import { useAuthStore } from '../lib/auth-store';
import { clearOfflineData, outboxCount } from '../lib/offline';
import {
  useBoards,
  useNotifications,
  useSharedBoards,
  useUnreadCount,
  useUpdateSettings,
  useWorkspaces,
} from '../lib/queries';
import { cn, formatRelative } from '../lib/utils';
import { CommandPalette, ShortcutsModal } from './CommandPalette';
import { Avatar, Button, Icon, Menu, MenuItem, Modal, useToast } from './ui';
import { WorkspaceContext, type WorkspaceContextValue } from './workspace-context';

export function AppShell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { wsSlug?: string; boardId?: string };
  const location = useRouterState({ select: (state) => state.location });
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const toast = useToast();
  const updateSettings = useUpdateSettings();

  const workspaces = useWorkspaces();
  const current =
    workspaces.data?.data.find((workspace) => workspace.slug === params.wsSlug) ?? null;
  const boards = useBoards(current?.id);
  const sharedBoards = useSharedBoards(Boolean(auth.user));
  const notifications = useNotifications(Boolean(auth.user && auth.refreshToken));
  const unread = useUnreadCount(Boolean(auth.user && auth.refreshToken));

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.user || !auth.refreshToken) {
      void navigate({ to: '/login' });
    }
  }, [auth.user, auth.refreshToken, navigate]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(auth.settings?.theme ?? 'system');
    document.documentElement.dataset.density = auth.settings?.density ?? 'comfortable';
    document.documentElement.dataset.reducedMotion = auth.settings?.reduced_motion
      ? 'true'
      : 'false';
  }, [auth.settings]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      if ((auth.settings?.theme ?? 'system') === 'system') {
        document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
      }
    };
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [auth.settings?.theme]);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      void outboxCount().then(setPending);
    };
    const onOutbox = () => void outboxCount().then(setPending);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('kanban:outbox', onOutbox);
    refresh();
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('kanban:outbox', onOutbox);
    };
  }, []);

  useEffect(() => {
    const onInstall = (event: Event) => {
      // We defer the browser prompt to show our own install banner. Chrome
      // prints an informational "Banner not shown" message for this pattern.
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        return;
      }
      if (editable) return;
      if (event.key === '?' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      if (event.key === '/') {
        event.preventDefault();
        if (current) void navigate({ to: '/app/$wsSlug/search', params: { wsSlug: current.slug } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, navigate]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [notificationsOpen]);

  const role = current?.role ?? 'viewer';
  const isManager = role === 'owner' || role === 'manager';
  const sharedBoardList = (sharedBoards.data?.data ?? []).filter(
    (board) => !(boards.data?.data ?? []).some((item) => item.id === board.id),
  );
  const isStaff = auth.user?.is_staff === 1;

  async function createWorkspace() {
    if (!workspaceName.trim()) return;
    try {
      const response = await post<{ workspace: WorkspaceSummary }>('/v1/workspaces', {
        name: workspaceName.trim(),
      });
      setWorkspaceName('');
      setCreateWorkspaceOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      void navigate({
        to: '/app/$wsSlug',
        params: { wsSlug: response.workspace.slug },
      });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function logout() {
    try {
      await post('/v1/auth/logout', { refreshToken: auth.refreshToken }, { queue: false });
    } catch {
      // local logout must work offline
    }
    await clearOfflineData();
    auth.clear();
    void navigate({ to: '/' });
  }

  async function toggleTheme() {
    const order = ['system', 'light', 'dark'] as const;
    const currentTheme = auth.settings?.theme ?? 'system';
    const next = order[(order.indexOf(currentTheme as (typeof order)[number]) + 1) % order.length]!;
    await updateSettings({ theme: next });
  }

  async function markAllRead() {
    await post('/v1/notifications/read', { all: true });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function openNotification(notification: NotificationRow) {
    await post('/v1/notifications/read', { ids: [notification.id] });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setNotificationsOpen(false);
    let payload: { board_id?: string; card_id?: string; token?: string } = {};
    try {
      payload = JSON.parse(notification.payload_json);
    } catch {
      return;
    }
    if (notification.type === 'service.invite' && payload.token) {
      void navigate({ to: '/join/$token', params: { token: payload.token } });
      return;
    }
    if (notification.type === 'board.invite_declined') {
      toast.push(t('notifications.inviteDeclined'), { kind: 'default' });
      return;
    }
    if (notification.type === 'workspace.invite_declined') {
      toast.push(t('notifications.workspaceInviteDeclined'), { kind: 'default' });
      return;
    }
    if (notification.type === 'board.invite_accepted') {
      toast.push(t('notifications.inviteAccepted'), { kind: 'success' });
      return;
    }
    if (notification.type === 'workspace.invite_accepted') {
      toast.push(t('notifications.workspaceInviteAccepted'), { kind: 'success' });
      return;
    }
    if (!payload.board_id) return;
    if (notification.type === 'board.shared' || notification.type === 'board.access_approved') {
      void navigate({
        to: '/share/board-accept/$boardId',
        params: { boardId: payload.board_id },
      });
      return;
    }
    if (notification.type === 'board.access_rejected') {
      toast.push(t('notifications.accessRejected'), { kind: 'danger' });
      return;
    }
    try {
      const snapshot = await get<BoardSnapshotResponse>(`/v1/boards/${payload.board_id}`);
      void navigate({
        to: '/app/$wsSlug/boards/$boardId',
        params: { wsSlug: snapshot.workspace.slug, boardId: payload.board_id },
        search: payload.card_id ? { card: payload.card_id } : {},
      });
    } catch {
      toast.push(t('errors.notFound'), { kind: 'danger' });
    }
  }

  const path = location.pathname;
  const navItems = current
    ? [
        { to: `/app/${current.slug}`, label: t('nav.boards'), icon: 'board' as const },
        { to: `/app/${current.slug}/my`, label: t('nav.myTasks'), icon: 'checklist' as const },
        { to: `/app/${current.slug}/search`, label: t('nav.search'), icon: 'search' as const },
        { to: `/app/${current.slug}/archive`, label: t('nav.archive'), icon: 'archive' as const },
      ]
    : [];

  const workspaceValue: WorkspaceContextValue = {
    workspace: current,
    role,
    boards: boards.data?.data ?? [],
    loading: workspaces.isLoading,
  };

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <div className="app-shell">
        <aside className="sidebar" aria-label={t('nav.dashboard')}>
          <div className="sidebar-header">
            <Link to="/" className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="logo-mark" aria-hidden="true">
                <Icon name="board" size={18} />
              </span>
              <span className="strong" style={{ fontSize: 15 }}>
                Kanban
              </span>
            </Link>
          </div>

          <Menu
            align="left"
            trigger={(props) => (
              <button type="button" className="workspace-switcher" {...props}>
                <span
                  className="logo-mark"
                  style={{ width: 26, height: 26, fontSize: 13, borderRadius: 7 }}
                >
                  {current?.icon ?? current?.name.slice(0, 1).toUpperCase() ?? '?'}
                </span>
                <span className="grow truncate" style={{ fontSize: 13 }}>
                  {current?.name ?? t('workspace.noWorkspaces')}
                </span>
                <Icon name="chevron-down" size={14} />
              </button>
            )}
          >
            <div
              className="menu-item"
              style={{ cursor: 'default', fontSize: 11, color: 'var(--color-text-subtle)' }}
            >
              {t('nav.dashboard')}
            </div>
            {workspaces.data?.data.map((workspace) => (
              <MenuItem
                key={workspace.id}
                icon="board"
                onClick={() =>
                  void navigate({ to: '/app/$wsSlug', params: { wsSlug: workspace.slug } })
                }
              >
                <span className="grow truncate">{workspace.name}</span>
                <span className="caption subtle">{workspace.role}</span>
              </MenuItem>
            ))}
            <div className="menu-separator" />
            <MenuItem icon="plus" onClick={() => setCreateWorkspaceOpen(true)}>
              {t('workspace.newWorkspace')}
            </MenuItem>
          </Menu>

          {current ? (
            <nav className="nav" aria-label={t('common.mainNav')}>
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'nav-item',
                    (path === item.to ||
                      (item.to !== `/app/${current.slug}` && path.startsWith(item.to))) &&
                      'active',
                  )}
                >
                  <span className="icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              ))}
              {isManager ? (
                <Link
                  to="/app/$wsSlug/settings"
                  params={{ wsSlug: current.slug }}
                  className={cn('nav-item', path.includes('/settings') && 'active')}
                >
                  <span className="icon">
                    <Icon name="settings" size={17} />
                  </span>
                  <span>{t('nav.settings')}</span>
                </Link>
              ) : null}
            </nav>
          ) : null}

          {current ? (
            <>
              <div className="nav-label">{t('workspace.boards')}</div>
              <nav className="nav" aria-label={t('nav.boards')}>
                {(boards.data?.data ?? []).slice(0, 8).map((board) => (
                  <Link
                    key={board.id}
                    to="/app/$wsSlug/boards/$boardId"
                    params={{ wsSlug: current.slug, boardId: board.id }}
                    className={cn('nav-item', params.boardId === board.id && 'active')}
                  >
                    <span className="icon" aria-hidden="true">
                      {board.library_origin === 'linked' ? (
                        <Icon name="link" size={14} />
                      ) : (
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 3,
                            background: board.cover ?? 'var(--color-primary)',
                            display: 'block',
                          }}
                        />
                      )}
                    </span>
                    <span className="grow truncate">{board.name}</span>
                    {board.is_favorite ? <Icon name="star" size={12} /> : null}
                  </Link>
                ))}
                <button
                  type="button"
                  className="nav-item"
                  onClick={() =>
                    void navigate({
                      to: '/app/$wsSlug',
                      params: { wsSlug: current.slug },
                      search: { new: '1' },
                    })
                  }
                >
                  <span className="icon">
                    <Icon name="plus" size={16} />
                  </span>
                  <span>{t('workspace.newBoard')}</span>
                </button>
              </nav>
            </>
          ) : null}

          {sharedBoardList.length > 0 ? (
            <>
              <div className="nav-label">{t('workspace.sharedWithMe')}</div>
              <nav className="nav" aria-label={t('workspace.sharedWithMe')}>
                {sharedBoardList.slice(0, 8).map((board) => (
                  <div className="nav-row" key={board.id}>
                    <Link
                      to="/app/$wsSlug/boards/$boardId"
                      params={{ wsSlug: board.workspace_slug ?? '', boardId: board.id }}
                      className={cn('nav-item', params.boardId === board.id && 'active')}
                    >
                      <span className="icon" aria-hidden="true">
                        <Icon name="link" size={14} />
                      </span>
                      <span className="grow truncate">{board.name}</span>
                    </Link>
                    <button
                      type="button"
                      className="nav-action"
                      title={t('board.addToWorkspace')}
                      aria-label={t('board.addToWorkspace')}
                      onClick={() =>
                        void navigate({
                          to: '/share/board-accept/$boardId',
                          params: { boardId: board.id },
                        })
                      }
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                ))}
              </nav>
            </>
          ) : null}

          <nav className="nav" aria-label={t('nav.billing')}>
            <Link to="/app/billing" className={cn('nav-item', path === '/app/billing' && 'active')}>
              <span className="icon">
                <Icon name="credit-card" size={17} />
              </span>
              <span>{t('nav.billing')}</span>
            </Link>
          </nav>

          {isStaff ? (
            <nav className="nav" aria-label={t('nav.admin')}>
              <Link to="/app/admin" className={cn('nav-item', path === '/app/admin' && 'active')}>
                <span className="icon">
                  <Icon name="shield" size={17} />
                </span>
                <span>{t('nav.admin')}</span>
              </Link>
            </nav>
          ) : null}
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="topbar-left">
              <span
                className="logo-mark hide-mobile"
                aria-hidden="true"
                style={{ display: 'none' }}
              >
                <Icon name="board" size={18} />
              </span>
              <div className="breadcrumbs">
                <Link to="/app">{t('nav.dashboard')}</Link>
                {current ? (
                  <>
                    <Icon name="chevron-right" size={13} />
                    <Link to="/app/$wsSlug" params={{ wsSlug: current.slug }} className="current">
                      {current.name}
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
            <div className="topbar-right">
              <Button
                variant="ghost"
                size="sm"
                icon="search"
                aria-label={t('common.search')}
                onClick={() => {
                  if (current)
                    void navigate({ to: '/app/$wsSlug/search', params: { wsSlug: current.slug } });
                  else setPaletteOpen(true);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                icon="palette"
                aria-label={t('common.commandPalette')}
                title="Ctrl+K"
                onClick={() => setPaletteOpen(true)}
              />
              {auth.user ? (
                <div className="relative" ref={notificationsRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNotificationsOpen((value) => !value)}
                    aria-label={t('notifications.title')}
                    aria-expanded={notificationsOpen}
                  >
                    <Icon name="bell" size={18} />
                    {(unread.data?.unread ?? 0) > 0 ? (
                      <span
                        className="badge primary"
                        style={{ marginLeft: 2, padding: '0 5px', minWidth: 18 }}
                      >
                        {unread.data?.unread}
                      </span>
                    ) : null}
                  </Button>
                  {notificationsOpen ? (
                    <div
                      className="dropdown right"
                      style={{ width: 330, maxHeight: 420, overflowY: 'auto' }}
                    >
                      <div className="spread" style={{ padding: '4px 6px 6px' }}>
                        <span className="strong small">{t('notifications.title')}</span>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => void markAllRead()}
                        >
                          {t('notifications.markAll')}
                        </button>
                      </div>
                      {(notifications.data?.data ?? []).length === 0 ? (
                        <p className="small muted" style={{ padding: 10 }}>
                          {t('notifications.empty')}
                        </p>
                      ) : (
                        (notifications.data?.data ?? []).map((notification) => (
                          <NotificationItem
                            key={notification.id}
                            notification={notification}
                            onClick={() => void openNotification(notification)}
                          />
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <Menu
                trigger={(props) => (
                  <button type="button" className="btn ghost sm" {...props} style={{ padding: 2 }}>
                    <Avatar
                      name={auth.user?.display_name ?? '?'}
                      src={auth.user?.avatar_url}
                      size="sm"
                    />
                  </button>
                )}
              >
                <div style={{ padding: '5px 9px' }}>
                  <div className="strong small truncate">{auth.user?.display_name}</div>
                  <div className="caption subtle truncate">{auth.user?.email}</div>
                </div>
                <div className="menu-separator" />
                <MenuItem icon="user" onClick={() => void navigate({ to: '/app/me' })}>
                  {t('nav.profile')}
                </MenuItem>
                <MenuItem icon="credit-card" onClick={() => void navigate({ to: '/app/billing' })}>
                  {t('nav.billing')}
                </MenuItem>
                <MenuItem icon="key" onClick={() => void navigate({ to: '/app/me' })}>
                  {t('settings.changePassword')}
                </MenuItem>
                <MenuItem
                  icon={auth.settings?.theme === 'dark' ? 'sun' : 'moon'}
                  onClick={() => void toggleTheme()}
                >
                  {t('common.theme')}
                </MenuItem>
                <MenuItem
                  icon="globe"
                  onClick={() => {
                    const next = i18n.language === 'ru' ? 'en' : 'ru';
                    setLanguage(next);
                    void patch('/v1/me', { locale: next }).then(() => {
                      auth.updateUser({ locale: next });
                    });
                  }}
                >
                  {i18n.language === 'ru' ? 'English' : 'Русский'}
                </MenuItem>
                {isStaff ? (
                  <MenuItem icon="shield" onClick={() => void navigate({ to: '/app/admin' })}>
                    {t('nav.admin')}
                  </MenuItem>
                ) : null}
                <MenuItem icon="board" onClick={() => void navigate({ to: '/about' })}>
                  {t('nav.about')}
                </MenuItem>
                <div className="menu-separator" />
                <MenuItem icon="logout" onClick={() => void logout()}>
                  {t('common.logout')}
                </MenuItem>
              </Menu>
            </div>
          </header>

          {auth.user && !auth.user.email_verified_at ? (
            <div className="banner" role="status">
              <Icon name="alert" size={15} />
              <span className="grow">{t('auth.verifyBanner')}</span>
              <Link to="/app/me" className="small strong">
                {t('nav.profile')}
              </Link>
            </div>
          ) : null}

          {!online ? (
            <div className="banner" role="status">
              <Icon name="wifi-off" size={15} />
              <span className="grow">
                {t('common.offline')}.{' '}
                {pending > 0 ? t('common.syncPending', { count: pending }) : ''}
              </span>
            </div>
          ) : null}

          {installPrompt ? (
            <div
              className="banner"
              style={{ background: 'var(--color-info-soft)', color: 'var(--color-info)' }}
            >
              <Icon name="download" size={15} />
              <span className="grow">{t('common.installApp')}</span>
              <Button
                size="sm"
                onClick={async () => {
                  installPrompt.prompt?.();
                  setInstallPrompt(null);
                }}
              >
                {t('common.install')}
              </Button>
            </div>
          ) : null}

          <main className="content">
            <Outlet />
          </main>
        </div>

        <nav className="mobile-nav" aria-label={t('common.mobileNav')}>
          <Link to="/app" className={cn(path === '/app' && 'active')}>
            <Icon name="board" size={20} />
            <span>{t('nav.boards')}</span>
          </Link>
          {current ? (
            <>
              <Link
                to="/app/$wsSlug/my"
                params={{ wsSlug: current.slug }}
                className={cn(path.includes('/my') && 'active')}
              >
                <Icon name="checklist" size={20} />
                <span>{t('nav.myTasks')}</span>
              </Link>
              <Link
                to="/app/$wsSlug/search"
                params={{ wsSlug: current.slug }}
                className={cn(path.includes('/search') && 'active')}
              >
                <Icon name="search" size={20} />
                <span>{t('nav.search')}</span>
              </Link>
            </>
          ) : null}
          <Link to="/app/me" className={cn(path === '/app/me' && 'active')}>
            <Icon name="user" size={20} />
            <span>{t('nav.profile')}</span>
          </Link>
        </nav>

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        <Modal
          open={createWorkspaceOpen}
          onClose={() => setCreateWorkspaceOpen(false)}
          title={t('workspace.newWorkspace')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setCreateWorkspaceOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => void createWorkspace()}
                disabled={!workspaceName.trim()}
              >
                {t('workspace.createWorkspace')}
              </Button>
            </>
          }
        >
          <label className="label" htmlFor="ws-name">
            {t('workspace.workspaceName')}
          </label>
          <input
            id="ws-name"
            className="input"
            data-autofocus
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createWorkspace();
            }}
            placeholder="Acme Studio"
          />
        </Modal>
      </div>
    </WorkspaceContext.Provider>
  );
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: NotificationRow;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  let payload: { title?: string; actor?: string; excerpt?: string } = {};
  try {
    payload = JSON.parse(notification.payload_json);
  } catch {
    payload = {};
  }
  const label =
    notification.type === 'assigned'
      ? t('notifications.assigned')
      : notification.type === 'comment'
        ? t('notifications.newComment')
        : notification.type === 'board.access_requested'
          ? t('notifications.accessRequested')
          : notification.type === 'board.access_approved'
            ? t('notifications.accessApproved')
            : notification.type === 'board.access_rejected'
              ? t('notifications.accessRejected')
              : notification.type === 'board.shared'
                ? t('notifications.boardShared')
                : notification.type === 'board.invite_accepted'
                  ? t('notifications.inviteAccepted')
                  : notification.type === 'board.invite_declined'
                    ? t('notifications.inviteDeclined')
                    : notification.type === 'workspace.invite_accepted'
                      ? t('notifications.workspaceInviteAccepted')
                      : notification.type === 'workspace.invite_declined'
                        ? t('notifications.workspaceInviteDeclined')
                        : notification.type === 'service.invite'
                          ? t('notifications.serviceInvite')
                          : notification.type;
  return (
    <button
      type="button"
      className={cn('notification-row', !notification.read_at && 'unread')}
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        background: notification.read_at ? 'transparent' : undefined,
      }}
    >
      <span className="avatar sm" aria-hidden="true">
        <Icon name="bell" size={13} />
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="small strong" style={{ display: 'block' }}>
          {label}
        </span>
        <span className="caption muted clamp-2" style={{ display: 'block' }}>
          {payload.actor ? `${payload.actor}: ` : ''}
          {payload.title ?? ''}
          {payload.excerpt ? ` — ${payload.excerpt}` : ''}
        </span>
        <span className="caption subtle">{formatRelative(notification.created_at)}</span>
      </span>
    </button>
  );
}

export function resolveTheme(theme: string): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
