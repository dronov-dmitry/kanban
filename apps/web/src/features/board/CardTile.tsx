import type { Card, CardLabel, Member } from '@kanban/shared';
import { dueUrgency } from '@kanban/shared';
import { useTranslation } from 'react-i18next';
import { Avatar, Icon, Menu, MenuItem, Progress } from '../../components/ui';
import { COLUMN_COLORS, cn, formatDue, PRIORITY_COLORS } from '../../lib/utils';

export function CardTile({
  card,
  labels,
  assignees,
  members,
  checklist,
  commentCount,
  attachmentCount,
  selected,
  dragging,
  canWrite,
  onOpen,
  onArchive,
  onColor,
}: {
  card: Card;
  labels: CardLabel[];
  assignees: string[];
  members: Member[];
  checklist: { done: number; total: number };
  commentCount: number;
  attachmentCount: number;
  selected?: boolean;
  dragging?: boolean;
  canWrite?: boolean;
  onOpen?: () => void;
  onArchive?: () => void;
  onColor?: (color: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const urgency = dueUrgency(card.due_date, card.due_done === 1);
  const assigneeMembers = assignees
    .map((id) => members.find((member) => member.user_id === id))
    .filter(Boolean) as Member[];
  const coverColor =
    card.cover_ref && /^#[0-9a-f]{3,8}$/i.test(card.cover_ref) ? card.cover_ref : null;

  return (
    <div
      className={cn('card-tile', selected && 'selected', dragging && 'dragging')}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen?.();
      }}
      role="button"
      tabIndex={0}
      aria-label={card.title}
      data-card-id={card.id}
    >
      {coverColor ? (
        <span className="card-color-bar" style={{ background: coverColor }} aria-hidden="true" />
      ) : null}
      {canWrite && (onArchive || onColor) ? (
        <div
          className="card-tile-menu"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Menu
            trigger={(props) => (
              <button
                type="button"
                className="card-tile-menu-btn"
                aria-label={t('common.actions')}
                {...props}
              >
                <Icon name="more" size={14} />
              </button>
            )}
          >
            {onArchive ? (
              <MenuItem icon="archive" onClick={onArchive}>
                {t('card.archive')}
              </MenuItem>
            ) : null}
            {onColor ? (
              <>
                <div className="menu-separator" />
                <span className="caption subtle card-color-label">{t('card.color')}</span>
                <div className="card-color-grid">
                  {COLUMN_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="card-color-swatch"
                      style={{ background: color }}
                      aria-label={color}
                      onClick={() => onColor(color)}
                    />
                  ))}
                </div>
                <MenuItem icon="close" onClick={() => onColor(null)}>
                  {t('card.removeColor')}
                </MenuItem>
              </>
            ) : null}
          </Menu>
        </div>
      ) : null}
      {card.cover_ref && card.cover_ref.startsWith('http') ? (
        <div className="card-cover">
          <img src={card.cover_ref} alt="" />
        </div>
      ) : null}
      {labels.length > 0 ? (
        <div className="card-labels">
          {labels.map((label) => (
            <span key={label.id} className="label-pill" style={{ background: label.color }}>
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="row" style={{ alignItems: 'flex-start', gap: 6 }}>
        {card.priority !== 'normal' ? (
          <span
            title={t(`card.priority${card.priority[0]!.toUpperCase()}${card.priority.slice(1)}`)}
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: PRIORITY_COLORS[card.priority],
              marginTop: 6,
              flex: 'none',
            }}
          />
        ) : null}
        <span className="card-title clamp-2 grow">{card.title}</span>
      </div>

      <div className="card-footer">
        {checklist.total > 0 ? (
          <Progress done={checklist.done} total={checklist.total} />
        ) : (
          <span />
        )}
        {assigneeMembers.length > 0 ? (
          <span className="avatar-stack">
            {assigneeMembers.slice(0, 3).map((member) => (
              <Avatar
                key={member.user_id}
                name={member.display_name}
                src={member.avatar_url}
                size="sm"
              />
            ))}
            {assigneeMembers.length > 3 ? (
              <span className="avatar sm" style={{ color: 'var(--color-text-muted)' }}>
                +{assigneeMembers.length - 3}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {(card.due_date || commentCount > 0 || attachmentCount > 0 || card.is_blocked === 1) && (
        <div className="card-meta">
          {card.is_blocked === 1 ? (
            <span className="meta" title={t('card.blocked')}>
              <Icon name="lock" size={12} /> {t('card.blocked')}
            </span>
          ) : null}
          {card.due_date ? (
            <span
              className={cn(
                'meta',
                urgency === 'overdue' && 'due-overdue',
                urgency === 'today' && 'due-today',
                urgency === 'soon' && 'due-soon',
              )}
            >
              <Icon name="clock" size={12} />
              {formatDue(card.due_date, i18n.language)}
            </span>
          ) : null}
          {commentCount > 0 ? (
            <span className="meta">
              <Icon name="comment" size={12} /> {commentCount}
            </span>
          ) : null}
          {attachmentCount > 0 ? (
            <span className="meta">
              <Icon name="paperclip" size={12} /> {attachmentCount}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
