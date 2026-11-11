import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmailInput } from '../../components/EmailInput';
import { Button, Modal, useToast } from '../../components/ui';
import { post } from '../../lib/api';
import type { InvitationSummary } from '../../lib/api-types';

export function WorkspaceInviteModal({
  open,
  onClose,
  workspaceId,
  emailVerified,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  emailVerified: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'member' | 'viewer'>('member');
  const [result, setResult] = useState<InvitationSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function createInvite() {
    setBusy(true);
    try {
      const response = await post<{ invitation: InvitationSummary }>(
        `/v1/workspaces/${workspaceId}/invitations`,
        { email: email.trim() || undefined, role },
      );
      setResult(response.invitation);
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: ['invitations', workspaceId] });
      if (response.invitation.url) {
        void navigator.clipboard.writeText(response.invitation.url);
        toast.push(t('common.copied'), { kind: 'success' });
      }
    } catch (error: any) {
      toast.push(
        error?.code === 'invite_limit'
          ? t('errors.inviteLimit')
          : (error?.problem?.detail ?? t('errors.generic')),
        { kind: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setResult(null);
        onClose();
      }}
      title={t('settings.invite')}
      footer={
        <Button
          variant="primary"
          onClick={() => void createInvite()}
          disabled={!emailVerified || busy}
        >
          {busy ? <span className="spinner" /> : t('settings.createLink')}
        </Button>
      }
    >
      {!emailVerified ? <div className="alert warning">{t('errors.emailUnverified')}</div> : null}
      <div className="stack" style={{ marginTop: 8 }}>
        <div>
          <label className="label" htmlFor="workspace-invite-email">
            {t('settings.inviteEmail')}
          </label>
          <EmailInput id="workspace-invite-email" value={email} onChange={setEmail} />
        </div>
        <div>
          <label className="label" htmlFor="workspace-invite-role">
            {t('settings.inviteRole')}
          </label>
          <select
            id="workspace-invite-role"
            className="select"
            value={role}
            onChange={(event) => setRole(event.target.value as 'manager' | 'member' | 'viewer')}
          >
            <option value="manager">{t('settings.manager')}</option>
            <option value="member">{t('settings.member')}</option>
            <option value="viewer">{t('settings.viewer')}</option>
          </select>
        </div>
        <p className="caption subtle">{t('settings.inviteLink')}</p>
        {result?.url ? (
          <div className="alert info">
            <div className="spread">
              <span className="small">{t('settings.inviteLink')}</span>
              <Button
                size="sm"
                icon="copy"
                onClick={() => void navigator.clipboard.writeText(result.url!)}
              >
                {t('settings.copyLink')}
              </Button>
            </div>
            <div className="mono truncate" style={{ marginTop: 6 }}>
              {result.url}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
