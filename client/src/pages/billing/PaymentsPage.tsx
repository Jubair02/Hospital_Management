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
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { PaymentRecordBadge, methodLabel } from '../../components/billing/BillingBadges';
import PageHeader from '../../components/ui/PageHeader';

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

  const columns: Column<BillingPayment>[] = [
    {
      key: 'paymentId',
      header: 'Payment',
      render: (p) => <span className="font-medium text-brand-800">{p.paymentId}</span>,
    },
    {
      key: 'invoice',
      header: 'Invoice',
      render: (p) =>
        typeof p.invoiceId === 'object' && p.invoiceId ? (
          <Link
            to={`/billing/invoices/${p.invoiceId._id}`}
            className="text-brand-800 hover:underline"
          >
            {p.invoiceId.invoiceId}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (p) =>
        p.patientId ? `${p.patientId.firstName} ${p.patientId.lastName}` : '—',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => (
        <span className={p.type === 'refund' ? 'font-semibold text-rose-600' : 'font-semibold text-slate-800'}>
          {p.type === 'refund' ? '−' : ''}
          {formatMoney(p.amount)}
        </span>
      ),
    },
    { key: 'method', header: 'Method', render: (p) => methodLabel(p.method) },
    { key: 'status', header: 'Status', render: (p) => <PaymentRecordBadge status={p.status} type={p.type} /> },
    {
      key: 'receivedBy',
      header: 'Received by',
      render: (p) => (p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : '—'),
    },
    { key: 'paidAt', header: 'Date', render: (p) => formatDate(p.paidAt) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="The money ledger — payments and refunds."
      />

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
            aria-label="Filter by date"
          />
        </div>
      </Card>

      <Table
        columns={columns}
        rows={payments}
        loading={loading}
        emptyState={
          <EmptyState title="No payments found" description="Payments appear here once recorded." />
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
