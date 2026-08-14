import { useCallback, useState } from 'react';
import { getBillingReport } from '../../services/analyticsService';
import { PAYMENT_METHODS, type BillingReportData, type ReportFilters } from '../../types';
import Card from '../../components/ui/Card';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import ReportShell from '../../components/analytics/ReportShell';
import StatGrid from '../../components/analytics/StatGrid';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';
import { formatMoneyShort } from '../../components/charts/chartTheme';
import { methodLabel } from '../../components/billing/BillingBadges';

type MethodRow = BillingReportData['byMethod'][number] & { id?: string };

export default function BillingReportPage() {
  const [method, setMethod] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');

  const load = useCallback(
    (filters: ReportFilters) =>
      getBillingReport({
        ...filters,
        method: method || undefined,
        invoiceStatus: invoiceStatus || undefined,
      }),
    [method, invoiceStatus]
  );

  const methodColumns: Column<MethodRow>[] = [
    { key: 'label', header: 'Method', render: (row) => methodLabel(row.label.replace(' ', '_')) },
    { key: 'count', header: 'Payments', render: (row) => row.count },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => <span className="font-semibold tabular-nums">{row.amount.toFixed(2)}</span>,
    },
  ];

  return (
    <ReportShell<BillingReportData>
      title="Billing report"
      description="Revenue and invoice status from live billing records. Amounts are computed server-side."
      report="billing"
      load={load}
      exportParams={{ method, invoiceStatus }}
      controls={
        <>
          <Select
            aria-label="Filter by payment method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m) }))}
            placeholder="All methods"
          />
          <Select
            aria-label="Filter by invoice status"
            value={invoiceStatus}
            onChange={(e) => setInvoiceStatus(e.target.value)}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'issued', label: 'Issued' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            placeholder="All invoice statuses"
          />
        </>
      }
    >
      {(report) => (
        <div className="space-y-6">
          <StatGrid
            stats={[
              { label: 'Revenue', value: report.summary.revenue, money: true, hint: 'Payments minus refunds' },
              { label: 'Paid', value: report.summary.paid, money: true, hint: 'Payments received' },
              { label: 'Refunds', value: report.summary.refunds, money: true, hint: 'Refunded amount', alert: true },
              {
                label: 'Outstanding',
                value: report.summary.outstanding,
                money: true,
                hint: 'Due across issued invoices',
                alert: true,
              },
            ]}
          />

          <StatGrid
            stats={[
              { label: 'Invoices', value: report.summary.invoices, hint: 'Created in this period' },
              { label: 'Paid invoices', value: report.summary.paidInvoices, hint: 'Fully settled' },
              {
                label: 'Partially paid',
                value: report.summary.partiallyPaidInvoices,
                hint: 'Balance remaining',
              },
              { label: 'Unpaid', value: report.summary.unpaidInvoices, hint: 'No payments yet', alert: true },
            ]}
          />

          <Card title="Payments over time" subtitle="Amount received per bucket">
            <TimeSeriesChart
              series={[{ name: 'Payments', points: report.series }]}
              format={formatMoneyShort}
              ariaLabel="Payment amounts collected over the selected period"
            />
          </Card>

          <Card title="Payments by method" subtitle="Count and amount">
            <Table
              columns={methodColumns}
              rows={report.byMethod.map((row, index) => ({ ...row, id: String(index) }))}
              emptyState={
                <p className="text-center text-sm text-slate-500">No payments in this period.</p>
              }
            />
          </Card>
        </div>
      )}
    </ReportShell>
  );
}
