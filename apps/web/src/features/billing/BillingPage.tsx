import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Icon, Spinner, useToast } from '../../components/ui';
import { get, post } from '../../lib/api';
import type { BillingInfo, BillingPaymentRow } from '../../lib/api-types';
import { formatDateTime } from '../../lib/utils';

const STATUS_BADGE: Record<BillingPaymentRow['status'], string> = {
  pending: 'badge warning',
  paid: 'badge success',
  cancelled: 'badge info',
  failed: 'badge danger',
  refunded: 'badge info',
};

const PENDING_WINDOW_MS = 30 * 60 * 1000;

function hasRecentPending(payments: BillingPaymentRow[]): boolean {
  const timestamp = Date.now();
  return payments.some(
    (payment) => payment.status === 'pending' && timestamp - payment.created_at < PENDING_WINDOW_MS,
  );
}

export function BillingPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [paying, setPaying] = useState(false);

  const billing = useQuery<BillingInfo>({
    queryKey: ['billing'],
    queryFn: () => get<BillingInfo>('/v1/billing'),
    refetchInterval: (query) => (hasRecentPending(query.state.data?.payments ?? []) ? 6000 : false),
  });

  if (billing.isLoading) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  const data = billing.data;
  if (!data) {
    return (
      <div className="page">
        <EmptyState
          icon="alert"
          title={t('errors.generic')}
          action={<Button onClick={() => void billing.refetch()}>{t('common.retry')}</Button>}
        />
      </div>
    );
  }

  const isPro = data.subscription.plan === 'pro';
  const periodEnd = data.subscription.current_period_end;
  const expired = Boolean(periodEnd && periodEnd <= Date.now());
  const pending = hasRecentPending(data.payments);

  async function pay() {
    setPaying(true);
    try {
      const response = await post<{ payment_url: string }>('/v1/billing/checkout', {});
      if (response.payment_url) {
        window.location.assign(response.payment_url);
        return;
      }
      toast.push(t('errors.generic'), { kind: 'danger' });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header className="page-header">
        <div>
          <h1 style={{ fontSize: 24 }}>{t('billing.title')}</h1>
          <p className="muted small" style={{ marginTop: 2 }}>
            {t('billing.subtitle')}
          </p>
        </div>
        <span className={isPro ? 'badge success' : 'badge'}>{isPro ? 'Pro' : 'Free'}</span>
      </header>

      <div className="stack" style={{ gap: 16 }}>
        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('billing.currentPlan')}</h2>
          <div className="row" style={{ gap: 10 }}>
            <span className="avatar sm">
              <Icon name={isPro ? 'star' : 'credit-card'} size={13} />
            </span>
            <div className="grow">
              <div className="small strong">
                {isPro ? t('billing.planPro') : t('billing.planFree')}
              </div>
              <div className="caption subtle">
                {isPro
                  ? periodEnd
                    ? t('billing.validUntil', {
                        date: formatDateTime(periodEnd, i18n.language),
                      })
                    : t('billing.proForever')
                  : expired && periodEnd
                    ? t('billing.expired', {
                        date: formatDateTime(periodEnd, i18n.language),
                      })
                    : t('billing.freeHint')}
              </div>
            </div>
          </div>
        </section>

        <section className="card-panel">
          <div className="spread" style={{ alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ fontSize: 16 }}>
              {t('billing.proTitle', { days: data.plan.period_days })}
            </h2>
            <div className="strong" style={{ fontSize: 20 }}>
              {data.plan.amount} {data.plan.currency}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            {t('billing.proHint')}
          </p>
          <ul className="small muted" style={{ margin: '10px 0 0 18px' }}>
            <li>{t('billing.proFeature1')}</li>
            <li>{t('billing.proFeature2')}</li>
            <li>{t('billing.proFeature3')}</li>
          </ul>

          {pending ? (
            <div className="alert info" style={{ marginTop: 12 }}>
              {t('billing.pendingHint')}
            </div>
          ) : null}
          {!data.configured ? (
            <div className="alert warning" style={{ marginTop: 12 }}>
              {t('billing.notConfigured')}
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 14 }}>
            <Button
              variant="primary"
              icon="credit-card"
              onClick={() => void pay()}
              disabled={!data.configured || paying || Boolean(pending)}
            >
              {paying ? t('common.loading') : t('billing.pay')}
            </Button>
          </div>
          <p className="caption subtle" style={{ marginTop: 8 }}>
            {t('billing.payHint')}
          </p>
        </section>

        <section className="card-panel">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('billing.history')}</h2>
          {data.payments.length === 0 ? (
            <p className="small subtle">{t('billing.noPayments')}</p>
          ) : (
            data.payments.map((payment) => (
              <div className="member-row" key={payment.id}>
                <span className="avatar sm">
                  <Icon name="credit-card" size={13} />
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small strong">
                    {payment.amount} {payment.currency}
                  </div>
                  <div className="caption subtle">
                    {formatDateTime(payment.created_at, i18n.language)}
                    {payment.paid_at
                      ? ` · ${t('billing.paidAt')} ${formatDateTime(payment.paid_at, i18n.language)}`
                      : ''}
                  </div>
                </div>
                <span className={STATUS_BADGE[payment.status]}>
                  {t(`billing.status.${payment.status}`)}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
