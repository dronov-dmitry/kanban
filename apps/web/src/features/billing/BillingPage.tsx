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
  const [paying, setPaying] = useState<'monthly' | 'yearly' | null>(null);

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
  const plans = data.plans?.length
    ? data.plans
    : [
        {
          code: 'monthly' as const,
          amount: data.plan.amount,
          currency: data.plan.currency,
          period_days: data.plan.period_days,
          savings_percent: 0,
        },
      ];
  const monthly = plans.find((option) => option.code === 'monthly');

  async function pay(period: 'monthly' | 'yearly') {
    setPaying(period);
    try {
      const response = await post<{ payment_url: string }>('/v1/billing/checkout', { period });
      if (response.payment_url) {
        window.location.assign(response.payment_url);
        return;
      }
      toast.push(t('errors.generic'), { kind: 'danger' });
    } catch (error: any) {
      toast.push(error?.problem?.detail ?? t('errors.generic'), { kind: 'danger' });
    } finally {
      setPaying(null);
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
          <h2 style={{ fontSize: 16 }}>{t('billing.choosePeriod')}</h2>
          <p className="small muted" style={{ marginTop: 6 }}>
            {t('billing.proHint')}
          </p>
          <ul className="small muted" style={{ margin: '10px 0 0 18px' }}>
            <li>{t('billing.proFeature1')}</li>
            <li>{t('billing.proFeature2')}</li>
            <li>{t('billing.proFeature3')}</li>
          </ul>

          <div className="price-grid" style={{ marginTop: 16 }}>
            {plans.map((option) => {
              const yearly = option.code === 'yearly';
              const savedAmount =
                yearly && monthly
                  ? Math.max(0, Number(monthly.amount) * 12 - Number(option.amount))
                  : 0;
              return (
                <div className={yearly ? 'price featured' : 'price'} key={option.code}>
                  <div className="spread" style={{ alignItems: 'center', gap: 8 }}>
                    <span className="small strong">
                      {yearly ? t('billing.yearlyPlan') : t('billing.monthlyPlan')}
                    </span>
                    {yearly && option.savings_percent > 0 ? (
                      <span className="badge success">
                        {t('billing.savePercent', { percent: option.savings_percent })}
                      </span>
                    ) : null}
                  </div>
                  <div className="amount">
                    {option.amount} <span className="small muted">{option.currency}</span>
                  </div>
                  <div className="caption subtle">
                    {yearly ? t('billing.perYear') : t('billing.perMonth')}
                  </div>
                  {savedAmount > 0 ? (
                    <div
                      className="caption"
                      style={{ color: 'var(--color-success)', marginTop: 4 }}
                    >
                      {t('billing.saveAmount', {
                        amount: savedAmount.toFixed(2),
                        currency: option.currency,
                      })}
                    </div>
                  ) : null}
                  <Button
                    variant={yearly ? 'primary' : 'default'}
                    icon="credit-card"
                    style={{ marginTop: 12, width: '100%' }}
                    onClick={() => void pay(option.code)}
                    disabled={!data.configured || paying !== null || Boolean(pending)}
                  >
                    {paying === option.code ? t('common.loading') : t('billing.pay')}
                  </Button>
                </div>
              );
            })}
          </div>

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

          <p className="caption subtle" style={{ marginTop: 10 }}>
            {t('billing.extendHint')}
          </p>
          <p className="caption subtle" style={{ marginTop: 6 }}>
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
                    {payment.period_days
                      ? ` · ${t('billing.daysShort', { days: payment.period_days })}`
                      : ''}
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
