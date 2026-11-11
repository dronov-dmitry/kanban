import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui';

interface DemoCard {
  id: string;
  titleKey: string;
  color: string;
}

const INITIAL: Record<string, DemoCard[]> = {
  todo: [
    { id: 'd1', titleKey: 'landing.demoCard1', color: '#0EA5E9' },
    { id: 'd2', titleKey: 'landing.demoCard2', color: '#7C3AED' },
  ],
  doing: [{ id: 'd3', titleKey: 'landing.demoCard3', color: '#B45309' }],
  done: [{ id: 'd4', titleKey: 'landing.demoCard4', color: '#15803D' }],
};

function DemoCardView({
  card,
  drag,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: DemoCard;
  drag: DragState | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, card: DemoCard) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const { t } = useTranslation();
  const dragging = drag?.id === card.id;
  return (
    <div
      className="demo-card"
      style={{
        borderLeft: `3px solid ${card.color}`,
        position: 'relative',
        zIndex: dragging ? 20 : 1,
        transform: dragging
          ? `translate3d(${drag.x - drag.startX}px, ${drag.y - drag.startY}px, 0)`
          : undefined,
        opacity: dragging ? 0.9 : 1,
        boxShadow: dragging ? 'var(--shadow-3)' : undefined,
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerDown={(event) => onPointerDown(event, card)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {t(card.titleKey)}
    </div>
  );
}

function DemoColumn({
  id,
  title,
  cards,
  drag,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  id: string;
  title: string;
  cards: DemoCard[];
  drag: DragState | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, card: DemoCard) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="demo-column" data-demo-column={id}>
      <div className="demo-column-title">{title}</div>
      {cards.map((card) => (
        <DemoCardView
          key={card.id}
          card={card}
          drag={drag}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ))}
      {cards.length === 0 ? (
        <div className="caption subtle" style={{ padding: 6 }}>
          {t('landing.demoEmpty')}
        </div>
      ) : null}
    </div>
  );
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

export function LandingPage() {
  const { t } = useTranslation();
  const [columns, setColumns] = useState(INITIAL);
  const [drag, setDrag] = useState<DragState | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>, card: DemoCard) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: card.id,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    setDrag((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const targetColumn = element?.closest<HTMLElement>('[data-demo-column]')?.dataset.demoColumn;
    setDrag(null);
    if (!targetColumn || !(targetColumn in columns)) return;
    setColumns((current) => {
      const next: Record<string, DemoCard[]> = {};
      let moving: DemoCard | undefined;
      for (const [key, cards] of Object.entries(current)) {
        const found = cards.find((card) => card.id === drag.id);
        if (found) moving = found;
        next[key] = cards.filter((card) => card.id !== drag.id);
      }
      if (moving) next[targetColumn] = [...(next[targetColumn] ?? []), moving];
      return next;
    });
  }

  return (
    <div className="landing">
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
          <a href="#features" className="hide-mobile">
            {t('landing.navFeatures')}
          </a>
          <a href="#pricing" className="hide-mobile">
            {t('landing.navPricing')}
          </a>
          <a href="#faq" className="hide-mobile">
            FAQ
          </a>
          <Link to="/login" className="btn ghost sm">
            {t('landing.login')}
          </Link>
          <Link to="/login" className="btn primary sm">
            {t('landing.start')}
          </Link>
        </div>
      </nav>

      <header className="hero">
        <div>
          <span className="badge primary" style={{ marginBottom: 12 }}>
            <Icon name="check" size={13} /> {t('landing.free')}
          </span>
          <h1>{t('landing.headline')}</h1>
          <p className="lead">{t('landing.lead')}</p>
          <div className="hero-actions">
            <Link to="/login" className="btn primary">
              {t('landing.start')} <Icon name="arrow-right" size={15} />
            </Link>
            <a href="#demo" className="btn">
              {t('landing.demo')}
            </a>
          </div>
          <div className="hero-note">
            <span>
              <Icon name="check" size={13} /> {t('landing.noCard')}
            </span>
            <span>
              <Icon name="check" size={13} /> {t('landing.offlineNote')}
            </span>
            <span>
              <Icon name="check" size={13} /> PWA
            </span>
          </div>
        </div>

        <div id="demo">
          <div className="demo-board" role="region" aria-label={t('landing.demoAria')}>
            {[
              ['todo', 'landing.demoColumnTodo'],
              ['doing', 'landing.demoColumnDoing'],
              ['done', 'landing.demoColumnDone'],
            ].map(([id, titleKey]) => (
              <DemoColumn
                key={id}
                id={id!}
                title={t(titleKey!)}
                cards={columns[id!] ?? []}
                drag={drag}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            ))}
          </div>
          <p className="caption subtle" style={{ marginTop: 8, textAlign: 'center' }}>
            {t('landing.demoHint')}
          </p>
        </div>
      </header>

      <section className="features" id="features">
        <h2>{t('landing.featuresTitle')}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {t('landing.featuresSubtitle')}
        </p>
        <div className="feature-grid">
          <div className="feature">
            <div className="feature-icon">
              <Icon name="keyboard" size={19} />
            </div>
            <h3>{t('landing.feature1Title')}</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              {t('landing.feature1Text')}
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Icon name="wifi-off" size={19} />
            </div>
            <h3>{t('landing.feature2Title')}</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              {t('landing.feature2Text')}
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Icon name="users" size={19} />
            </div>
            <h3>{t('landing.feature3Title')}</h3>
            <p className="muted small" style={{ marginTop: 6 }}>
              {t('landing.feature3Text')}
            </p>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <h2>{t('landing.pricingTitle')}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {t('landing.pricingSubtitle')}
        </p>
        <div className="price-grid">
          <div className="price">
            <div className="strong">Free</div>
            <div className="amount">
              {t('landing.freePrice')}{' '}
              <span className="small muted">{t('landing.freePeriod')}</span>
            </div>
            <ul>
              <li>{t('landing.freeFeature1')}</li>
              <li>{t('landing.freeFeature2')}</li>
              <li>{t('landing.freeFeature3')}</li>
              <li>{t('landing.freeFeature4')}</li>
            </ul>
            <Link to="/login" className="btn primary" style={{ marginTop: 16, width: '100%' }}>
              {t('landing.startFree')}
            </Link>
          </div>
          <div className="price featured">
            <div className="strong">Pro</div>
            <div className="amount">
              {t('landing.proPrice')} <span className="small muted">{t('landing.proPeriod')}</span>
            </div>
            <ul>
              <li>{t('landing.proFeature1')}</li>
              <li>{t('landing.proFeature2')}</li>
              <li>{t('landing.proFeature3')}</li>
              <li>{t('landing.proFeature4')}</li>
            </ul>
            <Link to="/login" className="btn primary" style={{ marginTop: 16, width: '100%' }}>
              {t('landing.choosePro')}
            </Link>
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <h2>{t('landing.faqTitle')}</h2>
        <div className="faq-list">
          {[1, 2, 3, 4].map((index) => (
            <details key={index}>
              <summary>{t(`landing.faq${index}Q`)}</summary>
              <p>{t(`landing.faq${index}A`)}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>
          © {new Date().getFullYear()} Kanban. {t('landing.footer')}
        </span>
        <span className="row" style={{ gap: 16 }}>
          <Link to="/login">{t('landing.login')}</Link>
          <Link to="/login">{t('landing.start')}</Link>
          <a href="mailto:support@example.com">support@example.com</a>
        </span>
      </footer>
    </div>
  );
}
