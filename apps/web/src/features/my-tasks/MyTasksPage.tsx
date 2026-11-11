import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Icon } from '../../components/ui';
import { useWorkspace } from '../../components/workspace-context';
import type { CardWithContext } from '../../lib/api-types';
import { useMyTasks } from '../../lib/queries';
import { cn, formatDue, PRIORITY_COLORS, taskCountLabel } from '../../lib/utils';

export function MyTasksPage() {
  const { t, i18n } = useTranslation();
  const { workspace } = useWorkspace();
  const tasks = useMyTasks(workspace?.id);

  const cards = tasks.data?.data ?? [];
  const now = Date.now();
  const groups: Array<{ id: string; title: string; cards: CardWithContext[] }> = [
    { id: 'overdue', title: t('filters.overdue'), cards: [] },
    { id: 'today', title: t('filters.today'), cards: [] },
    { id: 'week', title: t('filters.week'), cards: [] },
    { id: 'later', title: `${t('card.dueDate')} — ${t('common.tomorrow')}+`, cards: [] },
    { id: 'none', title: t('filters.noDue'), cards: [] },
  ];

  for (const card of cards) {
    if (!card.due_date) {
      groups[4]!.cards.push(card);
    } else if (card.due_date < now - 24 * 3600 * 1000) {
      groups[0]!.cards.push(card);
    } else if (new Date(card.due_date).toDateString() === new Date(now).toDateString()) {
      groups[1]!.cards.push(card);
    } else if (card.due_date <= now + 7 * 86_400_000) {
      groups[2]!.cards.push(card);
    } else {
      groups[3]!.cards.push(card);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('nav.myTasks')}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {workspace?.name} · {taskCountLabel(cards.length, i18n.language)}
          </p>
        </div>
        {workspace ? (
          <Link to="/app/$wsSlug" params={{ wsSlug: workspace.slug }} className="btn">
            <Icon name="board" size={15} /> {t('workspace.boards')}
          </Link>
        ) : null}
      </header>

      {tasks.isLoading ? (
        <div className="stack">
          {[0, 1, 2].map((index) => (
            <div className="skeleton" key={index} style={{ height: 56 }} />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon="checklist"
          title={t('common.noData')}
          text={t('card.assignees')}
          action={
            workspace ? (
              <Link to="/app/$wsSlug" params={{ wsSlug: workspace.slug }} className="btn primary">
                {t('workspace.boards')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="stack" style={{ gap: 20 }}>
          {groups
            .filter((group) => group.cards.length > 0)
            .map((group) => (
              <section key={group.id}>
                <div className="spread" style={{ marginBottom: 8 }}>
                  <h2 style={{ fontSize: 15 }}>{group.title}</h2>
                  <span className="badge">{group.cards.length}</span>
                </div>
                <div className="card-panel" style={{ padding: 6 }}>
                  {group.cards.map((card) => (
                    <Link
                      key={card.id}
                      to="/app/$wsSlug/boards/$boardId"
                      params={{ wsSlug: workspace!.slug, boardId: card.board_id }}
                      search={{ card: card.id }}
                      className="notification-row"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <span
                        className="dot"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: PRIORITY_COLORS[card.priority],
                          marginTop: 6,
                          flex: 'none',
                        }}
                      />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="strong small" style={{ display: 'block' }}>
                          {card.title}
                        </span>
                        <span className="caption subtle">
                          {card.board_name} · {card.list_name}
                        </span>
                      </span>
                      {card.due_date ? (
                        <span
                          className={cn(
                            'caption',
                            card.due_date < now && 'due-overdue',
                            group.id === 'today' && 'due-today',
                          )}
                        >
                          <Icon name="clock" size={12} /> {formatDue(card.due_date, i18n.language)}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
