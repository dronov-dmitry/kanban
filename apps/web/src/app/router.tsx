import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/ui';

const AppShell = lazyRouteComponent(() => import('../components/AppShell'), 'AppShell');

const LandingPage = lazyRouteComponent(
  () => import('../features/landing/LandingPage'),
  'LandingPage',
);
const LoginPage = lazyRouteComponent(() => import('../features/auth/AuthPages'), 'LoginPage');
const OAuthCallbackPage = lazyRouteComponent(
  () => import('../features/auth/AuthPages'),
  'OAuthCallbackPage',
);
const WorkspaceHomePage = lazyRouteComponent(
  () => import('../features/workspaces/WorkspacePages'),
  'WorkspaceHomePage',
);
const WorkspaceRedirectPage = lazyRouteComponent(
  () => import('../features/workspaces/WorkspacePages'),
  'WorkspaceRedirectPage',
);
const BoardPage = lazyRouteComponent(() => import('../features/board/BoardPage'), 'BoardPage');
const SearchPage = lazyRouteComponent(() => import('../features/search/SearchPage'), 'SearchPage');
const MyTasksPage = lazyRouteComponent(
  () => import('../features/my-tasks/MyTasksPage'),
  'MyTasksPage',
);
const ArchivePage = lazyRouteComponent(
  () => import('../features/archive/ArchivePage'),
  'ArchivePage',
);
const WorkspaceSettingsPage = lazyRouteComponent(
  () => import('../features/settings/WorkspaceSettingsPage'),
  'WorkspaceSettingsPage',
);
const ProfilePage = lazyRouteComponent(
  () => import('../features/profile/ProfilePage'),
  'ProfilePage',
);
const AdminUsersPage = lazyRouteComponent(
  () => import('../features/admin/AdminUsersPage'),
  'AdminUsersPage',
);
const InvitePage = lazyRouteComponent(() => import('../features/invite/InvitePage'), 'InvitePage');
const PublicBoardPage = lazyRouteComponent(
  () => import('../features/public/PublicBoardPage'),
  'PublicBoardPage',
);
const JoinPage = lazyRouteComponent(() => import('../features/public/JoinPage'), 'JoinPage');

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
});

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <EmptyState
        icon="alert"
        title={t('errors.notFound')}
        action={
          <a href="/" className="btn">
            {t('common.back')}
          </a>
        }
      />
    </div>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});
const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: () => {
    throw redirect({ to: '/login', replace: true });
  },
  component: () => null,
});
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset',
  beforeLoad: () => {
    throw redirect({ to: '/login', replace: true });
  },
  component: () => null,
});
const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify',
  beforeLoad: () => {
    throw redirect({ to: '/login', replace: true });
  },
  component: () => null,
});
const oauthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: OAuthCallbackPage,
});
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: InvitePage,
});
const publicBoardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/board/$token',
  component: PublicBoardPage,
});
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/join/$token',
  component: JoinPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppShell,
});

const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: WorkspaceRedirectPage,
});

const workspaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$wsSlug',
  component: WorkspaceHomePage,
});

const workspaceMyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$wsSlug/my',
  component: MyTasksPage,
});

const workspaceSearchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$wsSlug/search',
  component: SearchPage,
});

const workspaceArchiveRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$wsSlug/archive',
  component: ArchivePage,
});

const workspaceSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$wsSlug/settings',
  component: WorkspaceSettingsPage,
});

const boardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$wsSlug/boards/$boardId',
  component: BoardPage,
  validateSearch: (search: Record<string, unknown>) => {
    const result: {
      card?: string;
      f?: string;
      view?: 'list';
      new?: '1';
      settings?: '1';
    } = {};
    if (typeof search.card === 'string') result.card = search.card;
    if (typeof search.f === 'string') result.f = search.f;
    if (search.view === 'list') result.view = 'list';
    if (search.new === '1') result.new = '1';
    if (search.settings === '1') result.settings = '1';
    return result;
  },
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'me',
  component: ProfilePage,
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'admin',
  component: AdminUsersPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  resetRoute,
  verifyRoute,
  oauthRoute,
  inviteRoute,
  publicBoardRoute,
  joinRoute,
  appRoute.addChildren([
    appIndexRoute,
    profileRoute,
    adminRoute,
    workspaceRoute,
    workspaceMyRoute,
    workspaceSearchRoute,
    workspaceArchiveRoute,
    workspaceSettingsRoute,
    boardRoute,
  ]),
]);

const basepath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createRouter({
  routeTree,
  basepath,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultPendingMs: 150,
  defaultPendingMinMs: 200,
  defaultPendingComponent: () => (
    <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <span className="spinner" />
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
