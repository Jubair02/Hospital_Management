import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPayments, formatMoney } from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import {
  PAYMENT_METHODS,
  type BillingPayment,
  type Pagination as PaginationInfo,
} from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { PaymentRecordBadge, methodLabel } from '../../components/billing/BillingBadges';
import PageHeader from '../../components/ui/PageHeader';
import BackLink from '../../components/ui/BackLink';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPayments({
        page,
        limit: 10,
        search: search || undefined,
        method: method || undefined,
        status: status || undefined,
        dateFrom: date || undefined,
        dateTo: date || undefined,
      });
      setPayments(data.payments);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load payments.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, method, status, date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtered = Boolean(search || method || status || date);

  const clearFilters = () => {
    setSearchInput('');
    setMethod('');
    setStatus('');
    setDate('');
    setPage(1);
  };

  const columns: Column<BillingPayment>[] = [
    {
      key: 'paymentId',
      header: 'Payment',
      render: (p) => (
        <div className="min-w-0">
          <p className="font-semibold tabular-nums text-slate-900">{p.paymentId}</p>
          <p className="mt-0.5 text-xs text-slate-500">{formatDate(p.paidAt)}</p>
        </div>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (p) =>
        p.patientId ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">
              {p.patientId.firstName} {p.patientId.lastName}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">{p.patientId.patientId}</p>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'invoice',
      header: 'Invoice',
      render: (p) =>
        typeof p.invoiceId === 'object' && p.invoiceId ? (
          <Link
            to={`/billing/invoices/${p.invoiceId._id}`}
            className="tabular-nums font-medium text-brand-800 transition-colors hover:text-brand-900 hover:underline"
          >
            {p.invoiceId.invoiceId}
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (p) => (
        <span
          className={`font-semibold tabular-nums ${
            p.type === 'refund' ? 'text-rose-600' : 'text-slate-900'
          }`}
        >
          {p.type === 'refund' ? '−' : ''}
          {formatMoney(p.amount)}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => <span className="text-slate-600">{methodLabel(p.method)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <PaymentRecordBadge status={p.status} type={p.type} />,
    },
    {
      // Useful for reconciling a till, and not worth a column on a laptop —
      // the stacked card view below `md` shows it regardless of this class.
      key: 'receivedBy',
      header: 'Received by',
      className: 'hidden xl:table-cell',
      render: (p) =>
        p.receivedBy ? (
          `${p.receivedBy.firstName} ${p.receivedBy.lastName}`
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink to="/billing" label="Billing" />

        <PageHeader
          eyebrow="Billing"
          title="Payments"
          subtitle="The money ledger — every payment taken and every refund given back."
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search payment ID or patient…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search payments"
            className="lg:col-span-2"
          />
          <Select
            aria-label="Filter by method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setPage(1);
            }}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m) }))}
            placeholder="All methods"
          />
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ]}
            placeholder="All statuses"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by payment date"
          />
        </div>

        {filtered && (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
            <p className="text-xs text-slate-500">
              {loading
                ? 'Searching…'
                : `${pagination.total.toLocaleString()} matching record${
                    pagination.total === 1 ? '' : 's'
                  }`}
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      <Table
        columns={columns}
        rows={payments}
        loading={loading}
        emptyState={
          <EmptyState
            title={filtered ? 'No payments match these filters' : 'No payments yet'}
            description={
              filtered
                ? 'Widen the search, or clear the filters to see the whole ledger.'
                : 'Payments appear here as soon as one is recorded against an invoice.'
            }
            action={
              filtered ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/billing/invoices">
                  <Button size="sm" variant="secondary">
                    Open invoices
                  </Button>
                </Link>
              )
            }
          />
        }
        footer={
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        }
      />
    </div>
  );
}
