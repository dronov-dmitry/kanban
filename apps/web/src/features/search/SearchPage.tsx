import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Icon } from '../../components/ui';
import { useWorkspace } from '../../components/workspace-context';
import { get } from '../../lib/api';
import type { SearchResult } from '../../lib/api-types';
import { sanitizeSnippet } from '../../lib/utils';

export function SearchPage() {
  const { t } = useTranslation();
  const { wsSlug } = useParams({ strict: false }) as { wsSlug: string };
  const search = useSearch({ strict: false }) as { q?: string; board?: string };
  const navigate = useNavigate();
  const { workspace, boards } = useWorkspace();
  const [text, setText] = useState(search.q ?? '');
  const [query, setQuery] = useState(search.q ?? '');
  const [boardId, setBoardId] = useState(search.board ?? '');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const results = useQuery({
    queryKey: ['search', workspace?.id, query, boardId],
    queryFn: () =>
      get<{ data: SearchResult[] }>(
        `/v1/search?q=${encodeURIComponent(query)}${workspace ? `&workspace=${workspace.id}` : ''}${boardId ? `&board=${boardId}` : ''}`,
      ),
    enabled: Boolean(workspace && query.length > 0),
  });

  function open(result: SearchResult) {
    if (result.source === 'workspace') {
      void navigate({
        to: '/app/$wsSlug',
        params: { wsSlug: result.workspace_slug ?? wsSlug },
        search: {},
      });
      return;
    }
    void navigate({
      to: '/app/$wsSlug/boards/$boardId',
      params: { wsSlug, boardId: result.board_id! },
      search: result.source === 'board' || !result.card_id ? {} : { card: result.card_id },
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('common.search')}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {t('common.searchPlaceholder')}
          </p>
        </div>
      </header>

      <div className="card-panel" style={{ padding: 14, marginBottom: 16 }}>
        <div className="row wrap">
          <div className="grow" style={{ minWidth: 240 }}>
            <div className="row" style={{ gap: 6 }}>
              <Icon name="search" size={18} />
              <input
                className="input"
                autoFocus
                value={text}
                placeholder={t('common.searchPlaceholder')}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setQuery(text.trim());
                }}
                aria-label={t('common.search')}
              />
            </div>
          </div>
          <select
            className="select"
            style={{ width: 200 }}
            value={boardId}
            onChange={(event) => setBoardId(event.target.value)}
            aria-label={t('common.board')}
          >
            <option value="">
              {t('common.all')} — {t('workspace.boards')}
            </option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {query.length === 0 ? (
        <EmptyState icon="search" title={t('common.search')} text={t('common.searchPlaceholder')} />
      ) : results.isLoading ? (
        <div className="stack">
          {[0, 1, 2].map((index) => (
            <div className="skeleton" key={index} style={{ height: 64 }} />
          ))}
        </div>
      ) : (results.data?.data ?? []).length === 0 ? (
        <EmptyState icon="search" title={t('board.emptyFilter')} />
      ) : (
        <div className="card-panel" style={{ padding: 8 }}>
          {(results.data?.data ?? []).map((result) => (
            <button
              key={`${result.source}-${result.board_id}-${result.card_id ?? ''}-${result.comment_id ?? ''}`}
              type="button"
              className="notification-row"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => open(result)}
            >
              <span className="avatar sm" aria-hidden="true">
                <Icon
                  name={
                    result.source === 'workspace'
                      ? 'board'
                      : result.source === 'board'
                        ? 'board'
                        : result.source === 'comment'
                          ? 'comment'
                          : 'edit'
                  }
                  size={13}
                />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="spread">
                  <span className="strong small truncate">{result.title}</span>
                  <span className="badge">
                    {result.source === 'workspace'
                      ? t('workspace.workspace')
                      : result.source === 'board'
                        ? t('workspace.boards')
                        : result.source === 'comment'
                          ? t('card.comments')
                          : t('card.resultCard')}
                  </span>
                </span>
                <span
                  className="small muted"
                  style={{ display: 'block', marginTop: 2 }}
                  dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                />
                <span className="caption subtle">
                  {result.source === 'workspace'
                    ? result.workspace_slug
                    : result.source === 'board'
                      ? result.board_name
                      : `${result.board_name} · ${result.list_name}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {boards.length > 0 ? (
        <p className="caption subtle" style={{ marginTop: 12 }}>
          {t('workspace.boards')}:{' '}
          {boards.map((board, index) => (
            <span key={board.id}>
              {index > 0 ? ', ' : ''}
              <Link to="/app/$wsSlug/boards/$boardId" params={{ wsSlug, boardId: board.id }}>
                {board.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
