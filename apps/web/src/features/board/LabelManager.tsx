import type { CardLabel } from '@kanban/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, useToast } from '../../components/ui';
import { ApiError, del, patch, post } from '../../lib/api';
import { LABEL_PALETTE } from '../../lib/utils';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.problem.detail ?? fallback) : fallback;
}

function ColorPicker({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="row wrap" role="group" aria-label={label} style={{ gap: 4 }}>
      {LABEL_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: color,
            border:
              value === color ? '2px solid var(--color-text)' : '2px solid var(--color-surface)',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

function LabelRow({
  label,
  onSave,
  onDelete,
}: {
  label: CardLabel;
  onSave: (body: { name: string; color: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== label.name || color !== label.color;

  async function save() {
    if (!dirty || !trimmed || busy) return;
    setBusy(true);
    try {
      await onSave({ name: trimmed, color });
      setName(trimmed);
    } catch {
      // the error toast is shown by the parent handler
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete();
    } catch {
      // the error toast is shown by the parent handler
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="dot" style={{ background: color }} />
        <input
          className="input"
          style={{ flex: 1, minWidth: 140 }}
          value={name}
          maxLength={60}
          aria-label={t('board.labelName')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
            if (event.key === 'Escape') {
              setName(label.name);
              setColor(label.color);
            }
          }}
        />
        <Button size="sm" disabled={!dirty || !trimmed || busy} onClick={() => void save()}>
          {t('common.save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          aria-label={t('common.delete')}
          disabled={busy}
          onClick={() => setConfirming(true)}
        />
      </div>
      <ColorPicker value={color} label={t('board.labelColor')} onChange={setColor} />
      {confirming ? (
        <div className="row wrap small" style={{ gap: 6 }}>
          <span className="muted">{t('board.labelDeleteConfirm', { name: label.name })}</span>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove()}>
            {t('common.delete')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function LabelManager({
  boardId,
  labels,
  onLabelDeleted,
}: {
  boardId: string;
  labels: CardLabel[];
  onLabelDeleted?: (labelId: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_PALETTE[0]!);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
  }

  function notifyError(error: unknown) {
    toast.push(errorMessage(error, t('errors.generic')), { kind: 'danger' });
  }

  async function createLabel() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await post(`/v1/boards/${boardId}/labels`, { name, color: newColor });
      setNewName('');
      await refresh();
      toast.push(t('common.saved'), { kind: 'success' });
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  }

  async function updateLabel(labelId: string, body: { name: string; color: string }) {
    try {
      await patch(`/v1/labels/${labelId}`, body);
      await refresh();
      toast.push(t('common.saved'), { kind: 'success' });
    } catch (error) {
      notifyError(error);
      throw error;
    }
  }

  async function deleteLabel(label: CardLabel) {
    try {
      await del(`/v1/labels/${label.id}`);
      onLabelDeleted?.(label.id);
      await refresh();
      toast.push(t('common.saved'), { kind: 'success' });
    } catch (error) {
      notifyError(error);
      throw error;
    }
  }

  return (
    <div className="stack">
      <p className="caption subtle">{t('board.labelsHint')}</p>
      {labels.length === 0 ? <p className="small subtle">{t('board.noLabels')}</p> : null}
      {labels.map((label) => (
        <LabelRow
          key={label.id}
          label={label}
          onSave={(body) => updateLabel(label.id, body)}
          onDelete={() => deleteLabel(label)}
        />
      ))}
      <div
        className="stack"
        style={{ gap: 6, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}
      >
        <span className="label">{t('board.addLabel')}</span>
        <div className="row wrap" style={{ gap: 6 }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 160 }}
            value={newName}
            maxLength={60}
            placeholder={t('board.labelName')}
            aria-label={t('board.labelName')}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createLabel();
            }}
          />
          <Button
            variant="primary"
            icon="plus"
            disabled={!newName.trim() || busy}
            onClick={() => void createLabel()}
          >
            {t('common.add')}
          </Button>
        </div>
        <ColorPicker value={newColor} label={t('board.labelColor')} onChange={setNewColor} />
      </div>
    </div>
  );
}
