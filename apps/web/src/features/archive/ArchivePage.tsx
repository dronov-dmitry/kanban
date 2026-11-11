import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Icon, Modal, useToast } from '../../components/ui';
import { useWorkspace } from '../../components/workspace-context';
import { del, patch, post } from '../../lib/api';
import { useArchive } from '../../lib/queries';
import { formatDate } from '../../lib/utils';

export function ArchivePage() {
  const { t, i18n } = useTranslation();
  const { wsSlug } = useParams({ strict: false }) as { wsSlug: string };
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { workspace } = useWorkspace();
  const archive = useArchive(workspace?.id);
  const [tab, setTab] = useState<'archive' | 'trash'>(search.tab === 'trash' ? 'trash' : 'archive');
  const [purge, setPurge] = useState<{ type: 'board' | 'card'; id: string; name: string } | null>(
    null,
  );

  useEffect(() => {
    setTab(search.tab === 'trash' ? 'trash' : 'archive');
  }, [search.tab]);

  function setTabAndUrl(next: 'archive' | 'trash') {
    setTab(next);
    void navigate({
      to: '/app/$wsSlug/archive',
      params: { wsSlug },
      search: next === 'trash' ? { tab: 'trash' } : {},
      replace: true,
    });
  }

  async function restoreCard(cardId: string) {
    await post(`/v1/cards/${cardId}/restore`);
    toast.push(t('common.restore'), { kind: 'success' });
    await queryClient.invalidateQueries({ queryKey: ['archive', workspace?.id] });
  }

  async function unarchiveCard(cardId: string) {
    await patch(`/v1/cards/${cardId}`, { archived: false });
    await queryClient.invalidateQueries({ queryKey: ['archive', workspace?.id] });
  }

  async function restoreBoard(boardId: string) {
    await post(`/v1/boards/${boardId}/restore`);
    toast.push(t('common.restore'), { kind: 'success' });
    await queryClient.invalidateQueries({ queryKey: ['archive', workspace?.id] });
    await queryClient.invalidateQueries({ queryKey: ['boards', workspace?.id] });
  }

  async function purgeItem() {
    if (!purge) return;
    try {
      if (purge.type === 'board') await del(`/v1/boards/${purge.id}/permanent`);
      else await del(`/v1/cards/${purge.id}/permanent`);
      toast.push(t('common.delete'), { kind: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['archive', workspace?.id] });
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    } finally {
      setPurge(null);
    }
  }

  const data = archive.data;
  const boards = tab === 'archive' ? (data?.boards ?? []) : (data?.trashedBoards ?? []);
  const cards = tab === 'archive' ? (data?.cards ?? []) : (data?.trashedCards ?? []);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('nav.archive')}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {t('archive.subtitle')}
          </p>
        </div>
        <div className="row">
          <Button
            variant={tab === 'archive' ? 'soft' : 'default'}
            onClick={() => setTabAndUrl('archive')}
          >
            <Icon name="archive" size={15} /> {t('common.archive')}
          </Button>
          <Button
            variant={tab === 'trash' ? 'soft' : 'default'}
            onClick={() => setTabAndUrl('trash')}
          >
            <Icon name="trash" size={15} /> {t('card.delete')}
          </Button>
        </div>
      </header>

      {archive.isLoading ? (
        <div className="stack">
          {[0, 1, 2].map((index) => (
            <div className="skeleton" key={index} style={{ height: 56 }} />
          ))}
        </div>
      ) : boards.length === 0 && cards.length === 0 ? (
        <EmptyState icon={tab === 'archive' ? 'archive' : 'trash'} title={t('common.noData')} />
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          {boards.length > 0 ? (
            <section>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>{t('workspace.boards')}</h2>
              <div className="card-panel" style={{ padding: 6 }}>
                {boards.map((board) => (
                  <div key={board.id} className="notification-row">
                    <span className="avatar sm">
                      <Icon name="board" size={13} />
                    </span>
                    <span className="grow">
                      <span className="strong small" style={{ display: 'block' }}>
                        {board.name}
                      </span>
                      <span className="caption subtle">
                        {board.archived_at ? t('common.archive') : t('card.delete')} ·{' '}
                        {formatDate(
                          board.archived_at ?? board.deleted_at ?? board.updated_at,
                          i18n.language,
                        )}
                      </span>
                    </span>
                    <div className="row">
                      <Button size="sm" icon="restore" onClick={() => void restoreBoard(board.id)}>
                        {t('common.restore')}
                      </Button>
                      {tab === 'trash' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          onClick={() =>
                            setPurge({ type: 'board', id: board.id, name: board.name })
                          }
                        >
                          {t('common.delete')}
                        </Button>
                      ) : null}
                      {tab === 'archive' ? (
                        <Link
                          to="/app/$wsSlug/boards/$boardId"
                          params={{ wsSlug, boardId: board.id }}
                          className="btn sm"
                        >
                          {t('common.open')}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {cards.length > 0 ? (
            <section>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>{t('card.title')}</h2>
              <div className="card-panel" style={{ padding: 6 }}>
                {cards.map((card) => (
                  <div key={card.id} className="notification-row">
                    <span className="avatar sm">
                      <Icon name="checklist" size={13} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="strong small" style={{ display: 'block' }}>
                        {card.title}
                      </span>
                      <span className="caption subtle">
                        {card.board_name} · {card.list_name}
                        {card.due_date ? ` · ${formatDate(card.due_date, i18n.language)}` : ''}
                      </span>
                    </span>
                    <div className="row">
                      <Button
                        size="sm"
                        icon="restore"
                        onClick={() =>
                          void (tab === 'archive' ? unarchiveCard(card.id) : restoreCard(card.id))
                        }
                      >
                        {t('common.restore')}
                      </Button>
                      {tab === 'trash' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          onClick={() => setPurge({ type: 'card', id: card.id, name: card.title })}
                        >
                          {t('common.delete')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={Boolean(purge)}
        onClose={() => setPurge(null)}
        title={t('common.delete')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPurge(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void purgeItem()}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="small">{purge?.name}</p>
        <p className="small muted">{t('settings.deleteWarning')}</p>
      </Modal>
    </div>
  );
}
