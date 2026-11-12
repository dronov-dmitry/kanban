import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Icon } from '../../components/ui';
import { useAuthStore } from '../../lib/auth-store';

const AUTHOR_LINKS = [
  { key: 'authorSite', href: 'https://dronov-dmitry.github.io/', icon: 'globe' as const },
  { key: 'authorGithub', href: 'https://github.com/dronov-dmitry/', icon: 'external' as const },
  { key: 'authorTelegram', href: 'https://t.me/DmitryDronovBIM', icon: 'link' as const },
  {
    key: 'authorYoutube',
    href: 'https://www.youtube.com/@dronovdmitry',
    icon: 'external' as const,
  },
];

const STACK = [
  { key: 'stackWeb', icon: 'board' as const },
  { key: 'stackApi', icon: 'shield' as const },
  { key: 'stackShared', icon: 'link' as const },
  { key: 'stackDeploy', icon: 'globe' as const },
];

const FEATURES = [1, 2, 3, 4, 5, 6];

export function AboutPage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const authenticated = Boolean(user && refreshToken);

  return (
    <div className="landing">
      <div className="landing-nav-bar">
        <nav className="landing-nav">
          <Link to="/" className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="logo-mark" aria-hidden="true">
              <Icon name="board" size={18} />
            </span>
            <span className="strong" style={{ fontSize: 16 }}>
              Kanban
            </span>
          </Link>
          <div className="links">
            <Link to="/" hash="features" className="hide-mobile">
              {t('landing.navFeatures')}
            </Link>
            <Link to="/" hash="pricing" className="hide-mobile">
              {t('landing.navPricing')}
            </Link>
            <Link to="/" hash="faq" className="hide-mobile">
              FAQ
            </Link>
            <Link to="/about" className="hide-mobile">
              {t('landing.navAbout')}
            </Link>
            {authenticated ? (
              <Link to="/app" className="btn primary sm">
                {t('landing.cabinet')}
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn ghost sm">
                  {t('landing.login')}
                </Link>
                <Link to="/login" className="btn primary sm">
                  {t('landing.start')}
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>

      <header className="hero" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <span className="badge primary" style={{ marginBottom: 12 }}>
            <Icon name="board" size={13} /> {t('about.badge')}
          </span>
          <h1>{t('about.title')}</h1>
          <p className="lead">{t('about.lead')}</p>
          <div className="hero-actions">
            <Link to="/login" className="btn primary">
              {t('about.appLink')} <Icon name="arrow-right" size={15} />
            </Link>
            <a href="https://dronov-dmitry.github.io/kanban/" className="btn">
              {t('about.openSite')} <Icon name="external" size={15} />
            </a>
            <a href="https://youtu.be/2A1yRJGfxOA" className="btn" target="_blank" rel="noreferrer">
              {t('about.videoLink')} <Icon name="external" size={15} />
            </a>
          </div>
        </div>
      </header>

      <section className="about-section" id="why">
        <h2>{t('about.whyTitle')}</h2>
        <div className="feature-grid cols-2">
          <div className="feature">
            <div className="feature-icon">
              <Icon name="flag" size={19} />
            </div>
            <h3>{t('about.goalTitle')}</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              {t('about.whyText')}
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Icon name="users" size={19} />
            </div>
            <h3>{t('about.whoTitle')}</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              {t('about.whoText')}
            </p>
          </div>
        </div>
      </section>

      <section className="about-section" id="features">
        <h2>{t('about.featuresTitle')}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {t('about.featuresSubtitle')}
        </p>
        <div className="feature-grid">
          {FEATURES.map((index) => (
            <div className="feature" key={index}>
              <h3 style={{ fontSize: 16 }}>{t(`about.feature${index}Title`)}</h3>
              <p className="muted small" style={{ marginTop: 6 }}>
                {t(`about.feature${index}Text`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="about-section" id="stack">
        <h2>{t('about.stackTitle')}</h2>
        <p className="muted" style={{ marginTop: 6, maxWidth: '72ch' }}>
          {t('about.stackText')}
        </p>
        <div className="about-stack">
          {STACK.map((item) => (
            <div className="about-stack-row" key={item.key}>
              <span className="feature-icon" style={{ width: 32, height: 32, marginBottom: 0 }}>
                <Icon name={item.icon} size={16} />
              </span>
              <span className="small">{t(`about.${item.key}`)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="about-section" id="author">
        <h2>{t('about.authorTitle')}</h2>
        <div className="card-panel author-card">
          <div className="row" style={{ gap: 16, alignItems: 'center' }}>
            <Avatar name="Dmitry Dronov" size="lg" />
            <div>
              <h3 style={{ margin: 0 }}>{t('about.authorName')}</h3>
              <p className="muted small" style={{ marginTop: 4 }}>
                {t('about.authorRole')}
              </p>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 16, maxWidth: '72ch' }}>
            {t('about.authorBio')}
          </p>
          <div className="author-links">
            {AUTHOR_LINKS.map((item) => (
              <a key={item.key} href={item.href} target="_blank" rel="noreferrer">
                <Icon name={item.icon} size={14} />
                {t(`about.${item.key}`)}
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>
          © {new Date().getFullYear()} Kanban. {t('landing.footer')}
        </span>
        <span className="row" style={{ gap: 16 }}>
          <Link to="/">{t('about.navHome')}</Link>
          <Link to="/login">{t('landing.login')}</Link>
          <a href="https://github.com/dronov-dmitry/" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
