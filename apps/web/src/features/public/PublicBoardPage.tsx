import type { Card, CardLabel, CardLink, Checklist, Member } from '@kanban/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, EmptyState, Icon, Modal, useToast } from '../../components/ui';
import { ApiError, get, post } from '../../lib/api';
import type { PublicBoardRequestState, PublicBoardResponse } from '../../lib/api-types';
import { useAuthStore } from '../../lib/auth-store';
import { formatDue, renderMarkdown } from '../../lib/utils';
import { CardTile } from '../board/CardTile';

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
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

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
  const request = requestQuery.data?.request ?? null;
  const hasAccess = requestQuery.data?.hasAccess ?? false;
  const members: Member[] = [];
  for (const row of data.card_assignees) {
    if (members.some((member) => member.user_id === row.user_id)) continue;
    members.push({
      user_id: row.user_id,
      display_name: row.display_name,
      email: '',
      avatar_url: row.avatar_url,
      role: 'viewer',
      joined_at: 0,
    });
  }
  const checklistsByCard = new Map<string, Checklist[]>();
  for (const checklist of data.checklists ?? []) {
    const list = checklistsByCard.get(checklist.card_id) ?? [];
    list.push(checklist);
    checklistsByCard.set(checklist.card_id, list);
  }
  const linksByCard = new Map<string, CardLink[]>();
  for (const link of data.links ?? []) {
    const list = linksByCard.get(link.card_id) ?? [];
    list.push(link);
    linksByCard.set(link.card_id, list);
  }
  const assigneeIdsByCard = new Map<string, string[]>();
  for (const row of data.card_assignees) {
    const list = assigneeIdsByCard.get(row.card_id) ?? [];
    list.push(row.user_id);
    assigneeIdsByCard.set(row.card_id, list);
  }

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
            <div
              className="column"
              key={list.id}
              style={{
                width: 288,
                flex: 'none',
                borderTop: list.color ? `3px solid ${list.color}` : undefined,
              }}
            >
              <div className="column-header">
                <span className="column-title truncate">{list.name}</span>
                <span className="column-count">{cards.length}</span>
              </div>
              <div className="column-body">
                <div className="card-list">
                  {cards.map((card) => {
                    const checklists = checklistsByCard.get(card.id) ?? [];
                    const items = checklists.flatMap((checklist) => checklist.items);
                    return (
                      <CardTile
                        key={card.id}
                        card={card}
                        labels={
                          (labelIdsByCard.get(card.id) ?? [])
                            .map((id) => labelsById.get(id))
                            .filter(Boolean) as CardLabel[]
                        }
                        assignees={assigneeIdsByCard.get(card.id) ?? []}
                        members={members}
                        checklist={{
                          done: items.filter((item) => item.is_done === 1).length,
                          total: items.length,
                        }}
                        commentCount={0}
                        attachmentCount={0}
                        canWrite={false}
                        onOpen={() => setSelectedCard(card)}
                      />
                    );
                  })}
                  {cards.length === 0 ? (
                    <span className="caption subtle" style={{ padding: 8 }}>
                      {t('board.emptyBoard')}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(selectedCard)}
        onClose={() => setSelectedCard(null)}
        title={selectedCard?.title ?? ''}
        footer={
          <Button variant="ghost" onClick={() => setSelectedCard(null)}>
            {t('common.close')}
          </Button>
        }
      >
        {selectedCard ? (
          <div className="stack">
            <div className="row wrap" style={{ gap: 6 }}>
              {(labelIdsByCard.get(selectedCard.id) ?? [])
                .map((id) => labelsById.get(id))
                .filter(Boolean)
                .map((label) => (
                  <span
                    key={label!.id}
                    className="badge"
                    style={{ background: `${label!.color}22`, color: label!.color }}
                  >
                    {label!.name}
                  </span>
                ))}
            </div>
            {selectedCard.description ? (
              <div
                className="markdown small"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedCard.description) }}
              />
            ) : (
              <p className="small subtle">{t('card.noDescription')}</p>
            )}
            <div className="row wrap" style={{ gap: 12 }}>
              {selectedCard.due_date ? (
                <span className="caption subtle">
                  <Icon name="clock" size={12} /> {formatDue(selectedCard.due_date, i18n.language)}
                </span>
              ) : null}
              {selectedCard.priority !== 'normal' ? (
                <span className="caption subtle">
                  {t(
                    `card.priority${selectedCard.priority[0]!.toUpperCase()}${selectedCard.priority.slice(1)}`,
                  )}
                </span>
              ) : null}
            </div>
            {members.filter((member) =>
              (assigneeIdsByCard.get(selectedCard.id) ?? []).includes(member.user_id),
            ).length > 0 ? (
              <div>
                <span className="field-label">{t('card.assignees')}</span>
                <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                  {(assigneeIdsByCard.get(selectedCard.id) ?? []).map((id) => {
                    const member = members.find((row) => row.user_id === id);
                    if (!member) return null;
                    return (
                      <span className="row" key={id} style={{ gap: 5 }}>
                        <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
                        <span className="small">{member.display_name}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {(checklistsByCard.get(selectedCard.id) ?? []).map((checklist) => (
              <div key={checklist.id}>
                <span className="field-label">{checklist.title || t('card.checklist')}</span>
                <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                  {checklist.items.map((item) => (
                    <label
                      key={item.id}
                      className={item.is_done === 1 ? 'checkbox small muted' : 'checkbox small'}
                    >
                      <input type="checkbox" checked={item.is_done === 1} disabled readOnly />
                      {item.text}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {(linksByCard.get(selectedCard.id) ?? []).length > 0 ? (
              <div>
                <span className="field-label">{t('card.links')}</span>
                <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                  {(linksByCard.get(selectedCard.id) ?? []).map((link) => (
                    <a
                      key={link.id}
                      className="attachment-row"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <span className="attachment-thumb">
                        <Icon name="link" size={16} />
                      </span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span
                          className="small strong truncate"
                          style={{ display: 'block', color: 'var(--color-primary)' }}
                        >
                          {link.title || link.url}
                        </span>
                        {link.title ? (
                          <span className="caption subtle truncate" style={{ display: 'block' }}>
                            {link.url}
                          </span>
                        ) : null}
                      </span>
                      <Icon name="external" size={14} />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

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
