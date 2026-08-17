import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBillingStats, formatMoney } from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import type { BillingStats } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/icons';
import PageHeader from '../../components/ui/PageHeader';
import StatGrid from '../../components/analytics/StatGrid';
import StackedBar, { type BarSegment } from '../../components/charts/StackedBar';

/** Quiet inline link out of a panel, matching the other section dashboards. */
function PanelLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="-mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
    >
      {children}
      <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
    </Link>
  );
}

export default function BillingDashboardPage() {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const data = await getBillingStats();
      setStats(data);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load billing statistics.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Billing desk"
        subtitle="Today's takings, what is still owed, and the invoices behind both figures."
        meta={
          updatedAt && (
            <p className="text-xs text-slate-500">
              Updated{' '}
              <span className="font-medium tabular-nums text-slate-700">
                {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          )
        }
        actions={
          <>
            <Button variant="secondary" onClick={load} loading={refreshing}>
              Refresh
            </Button>
            <Link to="/billing/invoices/new">
              <Button>
                <Icon name="plus" className="h-4 w-4" />
                New invoice
              </Button>
            </Link>
          </>
        }
      />

      {error && (
        <Alert tone="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={load} loading={refreshing}>
              Try again
            </Button>
          </div>
        </Alert>
      )}

      {/* Money first, counts second — four tiles rather than the seven this
          board used to carry. The three invoice counts that were tiles are one
          measure split by payment state, so they live in the mix panel below
          instead of forcing the reader to add up across a row.

          Hidden entirely if the fetch failed with nothing cached: a row of
          zeroes beside a red alert reads as "the hospital took nothing today"
          rather than as "these numbers are unknown". */}
      {(stats || !error) && (
        <StatGrid
          loading={!stats}
          stats={[
            {
              label: "Today's revenue",
              value: stats?.todaysRevenue ?? 0,
              money: true,
              icon: 'cash',
              tone: 'teal',
              hint: 'Payments less refunds since midnight',
            },
            {
              label: 'Outstanding',
              value: stats?.outstandingAmount ?? 0,
              money: true,
              alert: true,
              icon: 'alert',
              tone: 'rose',
              hint: 'Due across issued invoices',
              to: '/billing/invoices',
            },
            {
              label: 'Payments today',
              value: stats?.todaysPayments ?? 0,
              icon: 'check',
              tone: 'brand',
              hint: 'Records taken since midnight',
              to: '/billing/payments',
            },
            {
              label: 'Invoices',
              value: stats?.totalInvoices ?? 0,
              icon: 'clipboard',
              tone: 'slate',
              hint: 'All time',
              to: '/billing/invoices',
            },
          ]}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <Card
          title="Invoice mix"
          subtitle="Every invoice by how much of it has been settled"
          icon="cash"
          actions={<PanelLink to="/billing/invoices">All invoices</PanelLink>}
        >
          <InvoiceMix stats={stats} failed={Boolean(error)} />
        </Card>

        <Card title="Collection" subtitle="What is still to come in" icon="alert">
          <Collection stats={stats} failed={Boolean(error)} />
        </Card>
      </div>
    </div>
  );
}

/**
 * The three payment states as one track. Draft and cancelled invoices are
 * neither paid nor owed, so they are shown as their own segment rather than
 * left as an unexplained gap between the counts and the total.
 */
function InvoiceMix({ stats, failed }: { stats: BillingStats | null; failed: boolean }) {
  if (failed && !stats) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        The invoice mix could not be loaded.
      </p>
    );
  }

  if (!stats) {
    return <div className="h-32 w-full rounded-xl skeleton" aria-label="Loading invoice mix" />;
  }

  if (stats.totalInvoices === 0) {
    return (
      <EmptyState
        title="No invoices yet"
        description="Bill a consultation, a lab order, or a dispensing, and this board starts filling in."
        action={
          <Link to="/billing/invoices/new">
            <Button size="sm">New invoice</Button>
          </Link>
        }
      />
    );
  }

  const { totalInvoices, paidInvoices, partiallyPaidInvoices, unpaidInvoices } = stats;
  const other = Math.max(0, totalInvoices - paidInvoices - partiallyPaidInvoices - unpaidInvoices);

  const segments: BarSegment[] = [
    { label: 'Paid', count: paidInvoices, tone: 'teal' },
    { label: 'Partially paid', count: partiallyPaidInvoices, tone: 'brand' },
    { label: 'Unpaid', count: unpaidInvoices, tone: 'amber' },
    ...(other > 0
      ? [{ label: 'Draft or cancelled', count: other, tone: 'slate' } satisfies BarSegment]
      : []),
  ];

  return (
    <>
      <StackedBar segments={segments} ariaLabel="Invoices by payment status" />
      <p className="mt-4 border-t border-line pt-3.5 text-xs leading-relaxed text-slate-500">
        {totalInvoices.toLocaleString()} invoice{totalInvoices === 1 ? '' : 's'} all time
        {other > 0 && `, of which ${other.toLocaleString()} are draft or cancelled`}.
      </p>
    </>
  );
}

/** Outstanding money, and how much of the billed work has actually settled. */
function Collection({ stats, failed }: { stats: BillingStats | null; failed: boolean }) {
  if (failed && !stats) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        The collection figures could not be loaded.
      </p>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-3" aria-label="Loading collection figures">
        <div className="h-9 w-32 rounded-md skeleton" />
        <div className="h-4 w-full rounded-md skeleton" />
        <div className="h-4 w-2/3 rounded-md skeleton" />
      </div>
    );
  }

  const owing = stats.unpaidInvoices + stats.partiallyPaidInvoices;
  const live = stats.paidInvoices + owing;
  const settled = live === 0 ? null : (stats.paidInvoices / live) * 100;

  return (
    <div className="space-y-5">
      <div>
        <p
          className={`text-[1.75rem] font-semibold leading-none tabular-nums ${
            stats.outstandingAmount > 0 ? 'text-rose-600' : 'text-slate-900'
          }`}
        >
          {formatMoney(stats.outstandingAmount)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {owing === 0
            ? 'Nothing is owed — every issued invoice is settled.'
            : `Across ${owing.toLocaleString()} invoice${owing === 1 ? '' : 's'} with a balance.`}
        </p>
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Settled invoices
        </h3>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-[1.75rem] font-semibold leading-none tabular-nums text-slate-900">
            {settled === null ? '—' : `${settled.toFixed(0)}%`}
          </span>
          <span className="text-xs text-slate-500">
            {settled === null
              ? 'no issued invoices yet'
              : `${stats.paidInvoices.toLocaleString()} of ${live.toLocaleString()} fully paid`}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3.5">
        <PanelLink to="/billing/invoices">Review invoices</PanelLink>
        <PanelLink to="/billing/payments">Payments ledger</PanelLink>
      </div>
    </div>
  );
}
