import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/auth-store';
import { useUpdateSettings, useWorkspaces } from '../lib/queries';
import { Icon, Modal } from './ui';
import { useWorkspace } from './workspace-context';

interface Action {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspace, boards } = useWorkspace();
  const workspaces = useWorkspaces();
  const updateSettings = useUpdateSettings();
  const settings = useAuthStore((state) => state.settings);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    if (workspace) {
      list.push({
        id: 'new-card',
        group: t('common.create'),
        label: t('board.addCard'),
        hint: 'N',
        run: () =>
          void navigate({
            to: '/app/$wsSlug/boards/$boardId',
            params: { wsSlug: workspace.slug, boardId: boards[0]?.id ?? '' },
            search: { new: '1' },
          }),
      });
      list.push({
        id: 'new-board',
        group: t('common.create'),
        label: t('workspace.newBoard'),
        run: () =>
          void navigate({
            to: '/app/$wsSlug',
            params: { wsSlug: workspace.slug },
            search: { new: '1' },
          }),
      });
      for (const board of boards) {
        list.push({
          id: `board-${board.id}`,
          group: t('workspace.boards'),
          label: board.name,
          run: () =>
            void navigate({
              to: '/app/$wsSlug/boards/$boardId',
              params: { wsSlug: workspace.slug, boardId: board.id },
            }),
        });
      }
      list.push(
        {
          id: 'my-tasks',
          group: t('nav.dashboard'),
          label: t('nav.myTasks'),
          run: () => void navigate({ to: '/app/$wsSlug/my', params: { wsSlug: workspace.slug } }),
        },
        {
          id: 'search',
          group: t('nav.dashboard'),
          label: t('nav.search'),
          hint: '/',
          run: () =>
            void navigate({ to: '/app/$wsSlug/search', params: { wsSlug: workspace.slug } }),
        },
        {
          id: 'archive',
          group: t('nav.dashboard'),
          label: t('nav.archive'),
          run: () =>
            void navigate({ to: '/app/$wsSlug/archive', params: { wsSlug: workspace.slug } }),
        },
      );
    }
    for (const item of workspaces.data?.data ?? []) {
      if (item.id === workspace?.id) continue;
      list.push({
        id: `ws-${item.id}`,
        group: t('nav.dashboard'),
        label: item.name,
        run: () => void navigate({ to: '/app/$wsSlug', params: { wsSlug: item.slug } }),
      });
    }
    list.push(
      {
        id: 'profile',
        group: t('common.settings'),
        label: t('nav.profile'),
        run: () => void navigate({ to: '/app/me' }),
      },
      {
        id: 'theme',
        group: t('common.settings'),
        label: t('common.theme'),
        run: () => {
          const next = settings?.theme === 'dark' ? 'light' : 'dark';
          void updateSettings({ theme: next });
        },
      },
    );
    return list;
  }, [workspace, boards, workspaces.data, settings?.theme, t, navigate, updateSettings]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return actions.slice(0, 24);
    return actions
      .filter(
        (action) =>
          action.label.toLowerCase().includes(normalized) ||
          action.group.toLowerCase().includes(normalized),
      )
      .slice(0, 24);
  }, [actions, query]);

  useEffect(() => {
    setIndex((value) => Math.min(value, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  function run(action: Action | undefined) {
    if (!action) return;
    onClose();
    action.run();
  }

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('common.commandPalette')}
      >
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder={`${t('common.search')}…`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex((value) => Math.min(value + 1, filtered.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex((value) => Math.max(0, value - 1));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              run(filtered[index]);
            }
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 ? (
            <p className="small muted" style={{ padding: 12 }}>
              {t('common.noData')}
            </p>
          ) : (
            filtered.map((action, position) => {
              const showGroup = position === 0 || filtered[position - 1]?.group !== action.group;
              return (
                <div key={action.id}>
                  {showGroup ? <div className="palette-section">{action.group}</div> : null}
                  <button
                    type="button"
                    className={`palette-item${position === index ? ' active' : ''}`}
                    onMouseEnter={() => setIndex(position)}
                    onClick={() => run(action)}
                  >
                    <Icon name="arrow-right" size={14} />
                    <span className="grow truncate">{action.label}</span>
                    {action.hint ? <span className="kbd">{action.hint}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div
          className="spread small subtle"
          style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)' }}
        >
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> {t('common.move')}
          </span>
          <span>
            <span className="kbd">Enter</span> {t('common.open')}
          </span>
          <span>
            <span className="kbd">Esc</span> {t('common.close')}
          </span>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['N', 'shortcuts.newCard'],
  ['Enter', 'shortcuts.openCard'],
  ['Esc', 'shortcuts.closeCancel'],
  ['Ctrl / Cmd + K', 'shortcuts.palette'],
  ['/', 'shortcuts.search'],
  ['F', 'shortcuts.filters'],
  ['J / K', 'shortcuts.cardNav'],
  ['Space', 'shortcuts.grab'],
  ['↑ / ↓ / ← / →', 'shortcuts.move'],
  ['E', 'shortcuts.editCard'],
  ['A', 'shortcuts.assignSelf'],
  ['D', 'shortcuts.dueDate'],
  ['L', 'shortcuts.labels'],
  ['Ctrl / Cmd + Z', 'shortcuts.undo'],
  ['?', 'shortcuts.help'],
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('common.settings')}>
      <table className="table" style={{ minWidth: 0 }}>
        <tbody>
          {SHORTCUTS.map(([key, labelKey]) => (
            <tr key={key}>
              <td style={{ width: 160 }}>
                <span className="kbd">{key}</span>
              </td>
              <td>{t(labelKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
