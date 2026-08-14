import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBillingStats, formatMoney } from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import type { BillingStats } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';

const CARDS: Array<{
  key: keyof BillingStats;
  label: string;
  hint: string;
  money?: boolean;
  alert?: boolean;
}> = [
  { key: 'todaysRevenue', label: "Today's revenue", hint: 'Payments minus refunds today', money: true },
  { key: 'todaysPayments', label: "Today's payments", hint: 'Payment records today' },
  { key: 'outstandingAmount', label: 'Outstanding', hint: 'Due across issued invoices', money: true, alert: true },
  { key: 'totalInvoices', label: 'Total invoices', hint: 'All time' },
  { key: 'paidInvoices', label: 'Paid', hint: 'Fully settled invoices' },
  { key: 'unpaidInvoices', label: 'Unpaid', hint: 'No payments yet', alert: true },
  { key: 'partiallyPaidInvoices', label: 'Partially paid', hint: 'Balance remaining' },
];

export default function BillingDashboardPage() {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getBillingStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to load billing statistics.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
          <p className="mt-1 text-sm text-slate-500">Invoices, payments, and revenue.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/billing/invoices/new">
            <Button>New invoice</Button>
          </Link>
          <Link to="/billing/invoices">
            <Button variant="secondary">Invoices</Button>
          </Link>
          <Link to="/billing/payments">
            <Button variant="ghost">Payments</Button>
          </Link>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ key, label, hint, money, alert }) => (
          <Card key={key}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            {stats ? (
              <p
                className={`mt-3 text-3xl font-semibold ${
                  alert && stats[key] > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {money ? formatMoney(stats[key]) : stats[key].toLocaleString()}
              </p>
            ) : (
              <div className="mt-4 h-8 w-20 animate-pulse rounded bg-slate-200" aria-label="Loading" />
            )}
            <p className="mt-1 text-sm text-slate-400">{hint}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
