import type { Card, CardLabel } from '@kanban/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, EmptyState, Icon, Modal, useToast } from '../../components/ui';
import { ApiError, get, post } from '../../lib/api';
import type { PublicBoardRequestState, PublicBoardResponse } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';
import { formatDue } from '../../lib/utils';

function appHref(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function PublicBoardPage() {
  const { t, i18n } = useTranslation();
  const { token = '' } = useParams({ strict: false }) as { token: string };
  const auth = useAuthStore();
  const toast = useToast();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [sending, setSending] = useState(false);

  const boardQuery = useQuery({
    queryKey: ['public-board', token],
    queryFn: () => get<PublicBoardResponse>(`/v1/public/boards/${token}`),
    retry: 1,
  });
  const requestQuery = useQuery({
    queryKey: ['public-board-request', token, auth.user?.id],
    queryFn: () => get<PublicBoardRequestState>(`/v1/public/boards/${token}/requests/me`),
    enabled: Boolean(auth.user && token),
  });

  async function requestAccess() {
    setSending(true);
    try {
      await post(`/v1/public/boards/${token}/requests`, {
        message: requestMessage.trim() || undefined,
      });
      setRequestOpen(false);
      setRequestMessage('');
      await requestQuery.refetch();
      toast.push(t('board.accessRequestSent'), { kind: 'success' });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        { kind: 'danger' },
      );
    } finally {
      setSending(false);
    }
  }

  if (boardQuery.isLoading) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <span className="spinner" />
      </div>
    );
  }
  if (!boardQuery.data) {
    return (
      <div className="page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <EmptyState
          icon="lock"
          title={t('board.publicNotFound')}
          action={
            <a href={appHref('/')} className="btn">
              {t('common.back')}
            </a>
          }
        />
      </div>
    );
  }

  const data = boardQuery.data;
  const labelsById = new Map(data.labels.map((label) => [label.id, label]));
  const labelIdsByCard = new Map<string, string[]>();
  for (const row of data.card_labels) {
    const list = labelIdsByCard.get(row.card_id) ?? [];
    list.push(row.label_id);
    labelIdsByCard.set(row.card_id, list);
  }
  const assigneesByCard = new Map<
    string,
    Array<{ display_name: string; avatar_url: string | null }>
  >();
  for (const row of data.card_assignees) {
    const list = assigneesByCard.get(row.card_id) ?? [];
    list.push({ display_name: row.display_name, avatar_url: row.avatar_url });
    assigneesByCard.set(row.card_id, list);
  }
  const request = requestQuery.data?.request ?? null;
  const hasAccess = requestQuery.data?.hasAccess ?? false;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <header className="topbar" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <div className="topbar-left">
          <span className="logo-mark" aria-hidden="true">
            <Icon name="board" size={18} />
          </span>
          <div>
            <div className="strong">{data.board.name}</div>
            <div className="caption subtle">
              {data.workspace.name} · {t('board.publicReadOnly')}
            </div>
          </div>
        </div>
        <div className="topbar-right">
          {!auth.user ? (
            <a
              className="btn primary"
              href={appHref(`/login?redirect=${encodeURIComponent(`/share/board/${token}`)}`)}
            >
              {t('common.login')}
            </a>
          ) : hasAccess ? (
            <a className="btn primary" href={appHref(`/share/board-accept/${data.board.id}`)}>
              {t('board.openBoard')}
            </a>
          ) : request?.status === 'pending' ? (
            <span className="badge warning">{t('board.accessPending')}</span>
          ) : (
            <Button variant="primary" onClick={() => setRequestOpen(true)}>
              {t('board.requestAccess')}
            </Button>
          )}
        </div>
      </header>

      <div className="banner" role="status">
        <Icon name="eye" size={15} />
        <span className="grow">{t('board.publicBanner')}</span>
      </div>

      <div className="board-canvas" style={{ padding: 16 }}>
        {data.lists.map((list) => {
          const cards = data.cards
            .filter((card) => card.list_id === list.id)
            .sort((a, b) => a.position.localeCompare(b.position));
          return (
            <div className="column" key={list.id} style={{ width: 288, flex: 'none' }}>
              <div className="spread" style={{ padding: '2px 4px 8px' }}>
                <span className="strong small">{list.name}</span>
                <span className="caption subtle">{cards.length}</span>
              </div>
              <div className="card-list">
                {cards.map((card) => (
                  <PublicCard
                    key={card.id}
                    card={card}
                    labels={
                      (labelIdsByCard.get(card.id) ?? [])
                        .map((id) => labelsById.get(id))
                        .filter(Boolean) as CardLabel[]
                    }
                    assignees={assigneesByCard.get(card.id) ?? []}
                    locale={i18n.language}
                  />
                ))}
                {cards.length === 0 ? (
                  <span className="caption subtle" style={{ padding: 8 }}>
                    {t('board.emptyBoard')}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title={t('board.requestAccess')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void requestAccess()} disabled={sending}>
              {t('common.send')}
            </Button>
          </>
        }
      >
        <p className="small muted">{t('board.requestAccessHint')}</p>
        <textarea
          className="textarea"
          style={{ marginTop: 10 }}
          placeholder={t('board.requestMessage')}
          value={requestMessage}
          onChange={(event) => setRequestMessage(event.target.value)}
        />
      </Modal>
    </div>
  );
}

function PublicCard({
  card,
  labels,
  assignees,
  locale,
}: {
  card: Card;
  labels: CardLabel[];
  assignees: Array<{ display_name: string; avatar_url: string | null }>;
  locale: string;
}) {
  return (
    <div
      className="card"
      style={{ borderLeft: `3px solid ${labels[0]?.color ?? 'var(--color-border)'}` }}
    >
      <div className="strong small">{card.title}</div>
      {card.description ? (
        <div className="caption muted clamp-2" style={{ marginTop: 3 }}>
          {card.description}
        </div>
      ) : null}
      {labels.length > 0 ? (
        <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
          {labels.map((label) => (
            <span
              key={label.id}
              className="badge"
              style={{ background: `${label.color}22`, color: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="spread" style={{ marginTop: 8 }}>
        <span className="caption subtle">
          {card.due_date ? formatDue(card.due_date, locale) : ''}
        </span>
        <span className="avatar-stack">
          {assignees.slice(0, 3).map((assignee, index) => (
            <Avatar
              key={`${assignee.display_name}-${index}`}
              name={assignee.display_name}
              src={assignee.avatar_url}
              size="sm"
            />
          ))}
        </span>
      </div>
    </div>
  );
}
