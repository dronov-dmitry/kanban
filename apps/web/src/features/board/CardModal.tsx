import type { Attachment, Checklist, Comment, Member } from '@kanban/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Button,
  Icon,
  Menu,
  MenuItem,
  Modal,
  Progress,
  Spinner,
  useToast,
} from '../../components/ui';
import {
  ApiError,
  del,
  downloadWithAuth,
  OfflineQueuedError,
  patch,
  post,
  uploadAttachment,
} from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { API_URL } from '../../lib/config';
import { useBoard, useCard } from '../../lib/queries';
import {
  cn,
  dateInputToTimestamp,
  formatBytes,
  formatDateTime,
  formatRelative,
  PRIORITY_COLORS,
  renderMarkdown,
  timestampToDateInput,
} from '../../lib/utils';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export function CardModal({
  cardId,
  onClose,
  readOnly: readOnlyProp = false,
}: {
  cardId: string;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const cardQuery = useCard(cardId);
  const card = cardQuery.data?.card;
  const boardQuery = useBoard(card?.board_id);
  const auth = useAuthStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [commentText, setCommentText] = useState('');
  const [commentPreview, setCommentPreview] = useState(false);
  const [checklistInputs, setChecklistInputs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const initialized = useRef<string | null>(null);
  const titleRef = useRef(title);
  const descriptionRef = useRef(description);

  useEffect(() => {
    if (!card) return;
    if (initialized.current !== card.id) {
      initialized.current = card.id;
      setTitle(card.title);
      setDescription(card.description);
      titleRef.current = card.title;
      descriptionRef.current = card.description;
    }
  }, [card]);

  function markSave(state: 'saving' | 'saved' | 'offline') {
    setSaveState(state);
    if (state === 'saved') window.setTimeout(() => setSaveState('idle'), 1500);
  }

  async function save(patchBody: Record<string, unknown>) {
    markSave('saving');
    try {
      await patch(`/v1/cards/${cardId}`, patchBody);
      markSave('saved');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
        queryClient.invalidateQueries({ queryKey: ['board', card?.board_id], exact: false }),
      ]);
    } catch (error) {
      if (error instanceof OfflineQueuedError) {
        markSave('offline');
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        toast.push(t('errors.versionConflict'), { kind: 'danger' });
        await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        return;
      }
      toast.push(
        error instanceof ApiError
          ? (error.problem.detail ?? t('errors.generic'))
          : t('errors.generic'),
        {
          kind: 'danger',
        },
      );
      setSaveState('idle');
    }
  }

  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(() => {
      const updates: Record<string, unknown> = {};
      if (titleRef.current.trim() && titleRef.current !== card.title)
        updates.title = titleRef.current.trim();
      if (descriptionRef.current !== card.description) updates.description = descriptionRef.current;
      if (Object.keys(updates).length > 0) void save(updates);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [title, description, card?.id]);

  const board = boardQuery.data;
  const readOnly = readOnlyProp || board?.role === 'viewer';
  const lists = board?.lists ?? [];
  const allLabels = board?.labels ?? [];
  const members: Member[] = board?.members ?? [];
  const canAssignOthers = Boolean(board && board.role !== 'worker' && board.role !== 'viewer');

  async function toggleLabel(labelId: string) {
    if (!card) return;
    const current = card.labels.map((label) => label.id);
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId];
    await save({ labelIds: next });
  }

  async function toggleAssignee(userId: string) {
    if (!card) return;
    const current = card.assignees.map((assignee) => assignee.user_id);
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    await save({ assigneeIds: next });
  }

  async function moveToList(listId: string) {
    if (!card || !board) return;
    const targetCards = board.cards
      .filter((item) => item.list_id === listId && item.id !== card.id)
      .sort((a, b) => a.position.localeCompare(b.position));
    const last = targetCards[targetCards.length - 1]?.position ?? null;
    const { keyBetween } = await import('@kanban/shared');
    try {
      await post(`/v1/cards/${card.id}/move`, { listId, position: keyBetween(last, null) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
        queryClient.invalidateQueries({ queryKey: ['board', card.board_id] }),
      ]);
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function addComment() {
    if (!card || !commentText.trim()) return;
    try {
      await post(`/v1/cards/${card.id}/comments`, { bodyMd: commentText.trim() });
      setCommentText('');
      setCommentPreview(false);
      await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    } catch (error) {
      if (error instanceof OfflineQueuedError) {
        toast.push(t('errors.offlineQueued'));
        setCommentText('');
        return;
      }
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  async function editComment(comment: Comment) {
    const next = window.prompt(t('card.edit'), comment.body_md);
    if (next === null) return;
    if (!next.trim()) return;
    await patch(`/v1/comments/${comment.id}`, { bodyMd: next.trim() });
    await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
  }

  async function deleteComment(comment: Comment) {
    await del(`/v1/comments/${comment.id}`);
    await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
  }

  async function toggleChecklistItem(itemId: string, done: boolean) {
    await patch(`/v1/checklist-items/${itemId}`, { isDone: done });
    await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    await queryClient.invalidateQueries({ queryKey: ['board', card?.board_id] });
  }

  async function addChecklistItem(checklistId: string) {
    const text = checklistInputs[checklistId]?.trim();
    if (!text) return;
    await post(`/v1/checklists/${checklistId}/items`, { text });
    setChecklistInputs({ ...checklistInputs, [checklistId]: '' });
    await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    await queryClient.invalidateQueries({ queryKey: ['board', card?.board_id] });
  }

  async function addChecklist() {
    if (!card) return;
    await post(`/v1/cards/${card.id}/checklists`, { title: t('card.checklist') });
    await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!card) return;
    setUploading(true);
    const maxUploadMb = auth.user?.plan === 'pro' ? 50 : 10;
    try {
      for (const file of Array.from(files)) {
        if (file.size > maxUploadMb * 1024 * 1024) {
          toast.push(t('errors.fileTooLarge', { size: maxUploadMb }), { kind: 'danger' });
          continue;
        }
        await uploadAttachment(card.id, file);
      }
      await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      await queryClient.invalidateQueries({ queryKey: ['board', card.board_id] });
    } catch (error) {
      toast.push(
        error instanceof ApiError
          ? error.code === 'storage_limit'
            ? t('errors.storageLimit')
            : error.code === 'pro_required'
              ? t('errors.proRequired')
              : (error.problem.detail ?? t('errors.upload'))
          : t('errors.upload'),
        {
          kind: 'danger',
        },
      );
    } finally {
      setUploading(false);
      setDragOver(false);
    }
  }

  async function removeAttachment(attachment: Attachment) {
    await del(`/v1/attachments/${attachment.id}`);
    await queryClient.invalidateQueries({ queryKey: ['card', cardId] });
  }

  async function archiveCard() {
    if (!card) return;
    await save({ archived: true });
    onClose();
    toast.push(t('toast.cardArchived'), {
      action: {
        label: t('common.restore'),
        onClick: () => {
          void patch(`/v1/cards/${card.id}`, { archived: false }).then(() =>
            queryClient.invalidateQueries({ queryKey: ['board', card.board_id] }),
          );
        },
      },
    });
  }

  async function deleteCard() {
    if (!card) return;
    await del(`/v1/cards/${card.id}`);
    await queryClient.invalidateQueries({ queryKey: ['board', card.board_id] });
    setDeleteOpen(false);
    onClose();
    toast.push(t('toast.cardTrashed'), {
      action: {
        label: t('common.restore'),
        onClick: () => {
          void post(`/v1/cards/${card.id}/restore`).then(() =>
            queryClient.invalidateQueries({ queryKey: ['board', card.board_id] }),
          );
        },
      },
    });
  }

  async function duplicateCard() {
    if (!card) return;
    try {
      await post(`/v1/cards/${card.id}/duplicate`, {
        locale: i18n.language === 'en' ? 'en' : 'ru',
      });
      await queryClient.invalidateQueries({ queryKey: ['board', card.board_id] });
      toast.push(t('card.duplicate'), { kind: 'success' });
      onClose();
    } catch {
      toast.push(t('errors.generic'), { kind: 'danger' });
    }
  }

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('card', cardId);
    void navigator.clipboard.writeText(url.toString());
    toast.push(t('board.copiedLink'), { kind: 'success' });
  }

  const totalItems =
    card?.checklists.reduce((sum, checklist) => sum + checklist.items.length, 0) ?? 0;
  const doneItems =
    card?.checklists.reduce(
      (sum, checklist) => sum + checklist.items.filter((item) => item.is_done === 1).length,
      0,
    ) ?? 0;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        <span className="row" style={{ gap: 8 }}>
          <span className="caption subtle">#{cardId.slice(-6).toUpperCase()}</span>
          <span>{card?.title ?? t('common.loading')}</span>
          <SaveState state={saveState} />
        </span>
      }
      headerExtra={
        readOnly ? null : (
          <Menu
            trigger={(props) => (
              <Button
                variant="ghost"
                size="sm"
                icon="more"
                aria-label={t('common.actions')}
                {...props}
              />
            )}
          >
            <MenuItem icon="copy" onClick={copyLink}>
              {t('card.link')}
            </MenuItem>
            <MenuItem icon="duplicate" onClick={() => void duplicateCard()}>
              {t('card.duplicate')}
            </MenuItem>
            <MenuItem icon="archive" onClick={() => void archiveCard()}>
              {t('card.archive')}
            </MenuItem>
            <div className="menu-separator" />
            <MenuItem icon="trash" danger onClick={() => setDeleteOpen(true)}>
              {t('card.delete')}
            </MenuItem>
          </Menu>
        )
      }
      footer={
        <>
          <span className="caption subtle grow">
            {card ? `${t('card.created')}: ${formatDateTime(card.created_at, i18n.language)}` : ''}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      {cardQuery.isLoading && !card ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
          <Spinner />
        </div>
      ) : !card ? (
        <p className="muted">{t('errors.notFound')}</p>
      ) : (
        <div className="modal-grid">
          <div>
            {readOnly ? (
              <div className="card-modal-title" role="heading" aria-level={2}>
                {card.title}
              </div>
            ) : (
              <textarea
                className="card-modal-title"
                value={title}
                rows={2}
                onChange={(event) => {
                  setTitle(event.target.value);
                  titleRef.current = event.target.value;
                }}
                onBlur={() => {
                  if (title.trim() && title !== card.title) void save({ title: title.trim() });
                }}
                aria-label={t('card.title')}
              />
            )}

            <div className="field-group" style={{ marginTop: 8 }}>
              <div className="spread">
                <span className="field-label">{t('card.description')}</span>
                {readOnly ? null : (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setPreview((value) => !value)}
                  >
                    <Icon name={preview ? 'edit' : 'eye'} size={14} />
                    {preview ? t('card.edit') : t('card.preview')}
                  </button>
                )}
              </div>
              {preview || readOnly ? (
                <div
                  className="markdown"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(description || t('card.noDescription')),
                  }}
                />
              ) : (
                <div className="description-editor">
                  <div className="editor-toolbar">
                    {[
                      ['B', '**', '**'],
                      ['I', '*', '*'],
                      ['H', '## ', ''],
                      ['•', '- ', ''],
                      ['`', '`', '`'],
                      ['🔗', '[', '](https://)'],
                    ].map(([label, before, after]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById(
                            'card-description',
                          ) as HTMLTextAreaElement | null;
                          if (!textarea) return;
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const selected = description.slice(start, end);
                          const next = `${description.slice(0, start)}${before}${selected}${after}${description.slice(end)}`;
                          setDescription(next);
                          descriptionRef.current = next;
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="card-description"
                    value={description}
                    placeholder={t('card.noDescription')}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      descriptionRef.current = event.target.value;
                    }}
                  />
                </div>
              )}
            </div>

            {totalItems > 0 ? (
              <div className="field-group">
                <div className="spread">
                  <span className="field-label">{t('card.checklist')}</span>
                  <span className="caption subtle">
                    {t('card.checklistProgress', { done: doneItems, total: totalItems })}
                  </span>
                </div>
                <Progress done={doneItems} total={totalItems} />
              </div>
            ) : null}

            {card.checklists.map((checklist) => (
              <ChecklistBlock
                key={checklist.id}
                checklist={checklist}
                input={checklistInputs[checklist.id] ?? ''}
                onInput={(value) =>
                  setChecklistInputs({ ...checklistInputs, [checklist.id]: value })
                }
                onToggle={(itemId, done) => void toggleChecklistItem(itemId, done)}
                onAdd={() => void addChecklistItem(checklist.id)}
                readOnly={readOnly}
              />
            ))}
            {readOnly ? null : (
              <Button size="sm" icon="plus" onClick={() => void addChecklist()}>
                {t('card.addChecklist')}
              </Button>
            )}

            <section style={{ marginTop: 20 }}>
              <h3 className="field-label" style={{ marginBottom: 6 }}>
                {t('card.attachments')} ({card.attachments.length})
              </h3>
              {readOnly ? null : (
                <div
                  className={cn('dropzone', dragOver && 'active')}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    void uploadFiles(event.dataTransfer.files);
                  }}
                  onClick={() => document.getElementById('attachment-input')?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') document.getElementById('attachment-input')?.click();
                  }}
                >
                  {uploading ? (
                    <Spinner label={t('common.upload')} />
                  ) : (
                    <>
                      <Icon name="upload" size={16} /> {t('card.dropFiles')}
                    </>
                  )}
                  <input
                    id="attachment-input"
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                      if (event.target.files) void uploadFiles(event.target.files);
                    }}
                  />
                </div>
              )}
              {card.attachments.map((attachment) => (
                <AttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  readOnly={readOnly}
                  onDownload={() =>
                    void downloadWithAuth(
                      `/v1/attachments/${attachment.id}/download`,
                      attachment.filename,
                    )
                  }
                  onDelete={() => void removeAttachment(attachment)}
                />
              ))}
            </section>

            <section style={{ marginTop: 20 }}>
              <h3 className="field-label" style={{ marginBottom: 6 }}>
                {t('card.comments')} ({card.comments.length})
              </h3>
              {card.comments.length === 0 ? (
                <p className="small subtle">{t('card.noComments')}</p>
              ) : null}
              {card.comments.map((comment) => (
                <div className="comment" key={comment.id}>
                  <Avatar name={comment.author_name ?? '?'} src={comment.author_avatar} size="sm" />
                  <div className="comment-body">
                    <div className="comment-head">
                      <span className="strong small">{comment.author_name}</span>
                      <span className="caption subtle">
                        {formatRelative(comment.created_at, i18n.language)}
                      </span>
                      {comment.edited_at ? (
                        <span className="caption subtle">· {t('card.edited')}</span>
                      ) : null}
                      {!readOnly && comment.author_id === auth.user?.id ? (
                        <span className="row" style={{ marginLeft: 'auto', gap: 2 }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="edit"
                            aria-label={t('common.edit')}
                            onClick={() => void editComment(comment)}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="trash"
                            aria-label={t('common.delete')}
                            onClick={() => void deleteComment(comment)}
                          />
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="markdown small"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body_md) }}
                    />
                  </div>
                </div>
              ))}
              {readOnly ? null : (
                <div className="comment-composer">
                  <Avatar
                    name={auth.user?.display_name ?? '?'}
                    src={auth.user?.avatar_url}
                    size="sm"
                  />
                  <div className="grow stack tight">
                    {commentPreview ? (
                      <div
                        className="markdown small"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(commentText || '…') }}
                      />
                    ) : (
                      <textarea
                        className="textarea"
                        style={{ minHeight: 72 }}
                        placeholder={t('card.addComment')}
                        value={commentText}
                        onChange={(event) => setCommentText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            void addComment();
                          }
                        }}
                      />
                    )}
                    <div className="row">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void addComment()}
                        disabled={!commentText.trim()}
                      >
                        {t('common.send')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCommentPreview((value) => !value)}
                      >
                        <Icon name={commentPreview ? 'edit' : 'eye'} size={14} />{' '}
                        {commentPreview ? t('card.edit') : t('card.preview')}
                      </Button>
                      <span className="caption subtle">{t('card.commentHint')}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setActivityOpen((value) => !value)}
              >
                <Icon name="clock" size={14} /> {t('card.activity')} ({card.activity.length})
                <Icon name={activityOpen ? 'chevron-down' : 'chevron-right'} size={13} />
              </button>
              {activityOpen ? (
                <div style={{ marginTop: 6 }}>
                  {card.activity.length === 0 ? (
                    <p className="small subtle">{t('card.activityEmpty')}</p>
                  ) : null}
                  {card.activity.map((event) => (
                    <div className="audit-row" key={event.id}>
                      <span className="grow">
                        <span className="strong small">{event.actor_name}</span>{' '}
                        <span className="muted small">
                          {activityLabel(event.verb, event.payload_json, t)}
                        </span>
                      </span>
                      <span className="caption subtle">
                        {formatRelative(event.created_at, i18n.language)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="modal-sidebar">
            <div className="field-group">
              <span className="field-label">{t('card.assignees')}</span>
              <div className="avatar-picker">
                {members.map((member) => {
                  const active = card.assignees.some(
                    (assignee) => assignee.user_id === member.user_id,
                  );
                  const assignable =
                    !readOnly && (canAssignOthers || member.user_id === auth.user?.id);
                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      className={cn('avatar-option', active && 'active')}
                      onClick={() => void toggleAssignee(member.user_id)}
                      disabled={!assignable}
                      title={assignable ? undefined : t('card.assigneesRestricted')}
                    >
                      <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
                      {member.display_name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">{t('card.labels')}</span>
              <div className="row wrap" style={{ gap: 5 }}>
                {allLabels.map((label) => {
                  const active = card.labels.some((item) => item.id === label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={cn('chip', active && 'active')}
                      style={active ? { borderColor: label.color } : undefined}
                      onClick={() => void toggleLabel(label.id)}
                      disabled={readOnly}
                    >
                      <span className="dot" style={{ background: label.color }} />
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">{t('card.dueDate')}</span>
              <div className="row">
                <input
                  type="date"
                  className="input"
                  style={{ minHeight: 32, padding: '4px 8px' }}
                  value={timestampToDateInput(card.due_date)}
                  disabled={readOnly}
                  onChange={(event) =>
                    void save({ dueDate: dateInputToTimestamp(event.target.value) })
                  }
                />
                {card.due_date && !readOnly ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="close"
                    aria-label={t('common.delete')}
                    onClick={() => void save({ dueDate: null })}
                  />
                ) : null}
              </div>
              {card.due_date ? (
                <label className="checkbox small">
                  <input
                    type="checkbox"
                    checked={card.due_done === 1}
                    disabled={readOnly}
                    onChange={(event) => void save({ dueDone: event.target.checked })}
                  />
                  {t('card.dueDone')}
                </label>
              ) : null}
            </div>

            <div className="field-group">
              <span className="field-label">{t('card.priority')}</span>
              <select
                className="select"
                value={card.priority}
                disabled={readOnly}
                onChange={(event) => void save({ priority: event.target.value })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`card.priority${priority[0]!.toUpperCase()}${priority.slice(1)}`)}
                  </option>
                ))}
              </select>
              <span className="caption" style={{ color: PRIORITY_COLORS[card.priority] }}>
                ● {t(`card.priority${card.priority[0]!.toUpperCase()}${card.priority.slice(1)}`)}
              </span>
            </div>

            <div className="field-group">
              <span className="field-label">{t('card.list')}</span>
              <select
                className="select"
                value={card.list_id}
                disabled={readOnly}
                onChange={(event) => void moveToList(event.target.value)}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <span className="field-label">{t('card.created')}</span>
              <span className="small muted">
                {board?.members.find((member) => member.user_id === card.created_by)
                  ?.display_name ?? '—'}
                {' · '}
                {formatDateTime(card.created_at, i18n.language)}
              </span>
            </div>

            <Button size="sm" icon="link" onClick={copyLink}>
              {t('card.link')}
            </Button>
          </aside>
        </div>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('card.delete')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void deleteCard()}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="small">{t('card.deleteConfirm')}</p>
      </Modal>
    </Modal>
  );
}

function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' | 'offline' }) {
  const { t } = useTranslation();
  if (state === 'idle') return null;
  const label =
    state === 'saving'
      ? t('card.saving')
      : state === 'saved'
        ? t('card.saved')
        : t('card.offlineSaved');
  return (
    <span className="save-state" aria-live="polite">
      {state === 'saving' ? <span className="spinner" style={{ width: 10, height: 10 }} /> : null}{' '}
      {label}
    </span>
  );
}

function ChecklistBlock({
  checklist,
  input,
  onInput,
  onToggle,
  onAdd,
  readOnly,
}: {
  checklist: Checklist;
  input: string;
  onInput: (value: string) => void;
  onToggle: (itemId: string, done: boolean) => void;
  onAdd: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="checklist">
      <div className="spread" style={{ marginBottom: 6 }}>
        <span className="strong small">{checklist.title || t('card.checklist')}</span>
        <span className="caption subtle">
          {checklist.items.filter((item) => item.is_done === 1).length}/{checklist.items.length}
        </span>
      </div>
      {checklist.items.map((item) => (
        <label key={item.id} className={cn('checklist-item', item.is_done === 1 && 'done')}>
          <input
            type="checkbox"
            checked={item.is_done === 1}
            disabled={readOnly}
            onChange={(event) => onToggle(item.id, event.target.checked)}
          />
          <span className="checklist-text">{item.text}</span>
        </label>
      ))}
      {readOnly ? null : (
        <input
          className="input"
          style={{ minHeight: 30, marginTop: 6 }}
          placeholder={t('card.addItem')}
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onAdd();
          }}
        />
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  readOnly,
  onDownload,
  onDelete,
}: {
  attachment: Attachment;
  readOnly?: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = attachment.mime.startsWith('image/') && attachment.mime !== 'image/svg+xml';

  useEffect(() => {
    if (!isImage) return;
    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const token = useAuthStore.getState().accessToken;
        const response = await fetch(`${API_URL}/v1/attachments/${attachment.id}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return;
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        if (!cancelled) setPreviewUrl(url);
      } catch {
        // preview is optional
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id, isImage]);

  return (
    <div className="attachment-row">
      {previewUrl ? (
        <img className="attachment-thumb" src={previewUrl} alt={attachment.filename} />
      ) : (
        <span className="attachment-thumb">
          <Icon name="paperclip" size={16} />
        </span>
      )}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="truncate" style={{ display: 'block' }}>
          {attachment.filename}
        </span>
        <span className="caption subtle">{formatBytes(attachment.size_bytes)}</span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        icon="download"
        aria-label={t('common.download')}
        onClick={onDownload}
      />
      {readOnly ? null : (
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          aria-label={t('common.delete')}
          onClick={onDelete}
        />
      )}
    </div>
  );
}

function activityLabel(verb: string, payloadJson: string, t: TFunction): string {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    payload = {};
  }
  switch (verb) {
    case 'card.created':
      return t('activity.created');
    case 'card.updated': {
      const changed = Array.isArray(payload.changed)
        ? `: ${(payload.changed as string[]).join(', ')}`
        : '';
      return `${t('activity.updated')}${changed}`;
    }
    case 'card.moved':
      return t('activity.moved');
    case 'card.deleted':
      return t('activity.trashed');
    case 'card.restored':
      return t('activity.restored');
    case 'card.archived':
      return t('activity.archived');
    case 'comment.created':
      return t('activity.commented');
    case 'attachment.added':
      return t('activity.attached');
    case 'card.duplicated':
      return t('activity.duplicated');
    default:
      return verb;
  }
}
