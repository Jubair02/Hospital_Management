import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getInvoices, formatMoney } from '../../services/billingService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Invoice, Pagination as PaginationInfo } from '../../types';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { InvoicePaymentBadge, InvoiceStatusBadge } from '../../components/billing/BillingBadges';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getInvoices({
        page,
        limit: 10,
        search: search || undefined,
        invoiceStatus: invoiceStatus || undefined,
        paymentStatus: paymentStatus || undefined,
      });
      setInvoices(data.invoices);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load invoices.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, invoiceStatus, paymentStatus]);

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

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceId',
      header: 'Invoice',
      render: (i) => <span className="font-medium text-brand-800">{i.invoiceId}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (i) =>
        i.patientId ? (
          <div>
            <p className="font-medium text-slate-800">
              {i.patientId.firstName} {i.patientId.lastName}
            </p>
            <p className="text-slate-500">{i.patientId.patientId}</p>
          </div>
        ) : (
          '—'
        ),
    },
    { key: 'date', header: 'Date', render: (i) => formatDate(i.createdAt) },
    {
      key: 'total',
      header: 'Total',
      render: (i) => <span className="font-semibold">{formatMoney(i.totalAmount)}</span>,
    },
    { key: 'paid', header: 'Paid', render: (i) => formatMoney(i.amountPaid) },
    {
      key: 'due',
      header: 'Due',
      render: (i) => (
        <span className={i.dueAmount > 0 ? 'font-semibold text-rose-600' : 'text-slate-500'}>
          {formatMoney(i.dueAmount)}
        </span>
      ),
    },
    { key: 'invoiceStatus', header: 'Invoice', render: (i) => <InvoiceStatusBadge status={i.invoiceStatus} /> },
    { key: 'paymentStatus', header: 'Payment', render: (i) => <InvoicePaymentBadge status={i.paymentStatus} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (i) => (
        <Link to={`/billing/invoices/${i._id}`}>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">Patient invoices, newest first.</p>
        </div>
        <Link to="/billing/invoices/new">
          <Button>New invoice</Button>
        </Link>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input
            placeholder="Search invoice ID or patient…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search invoices"
            className="sm:col-span-2"
          />
          <Select
            aria-label="Filter by invoice status"
            value={invoiceStatus}
            onChange={(e) => {
              setInvoiceStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'issued', label: 'Issued' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            placeholder="All invoice statuses"
          />
          <Select
            aria-label="Filter by payment status"
            value={paymentStatus}
            onChange={(e) => {
              setPaymentStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'partially_paid', label: 'Partially paid' },
              { value: 'paid', label: 'Paid' },
              { value: 'refunded', label: 'Refunded' },
            ]}
            placeholder="All payment statuses"
          />
        </div>

        <Table
          columns={columns}
          rows={invoices}
          loading={loading}
          emptyState={
            <EmptyState
              title="No invoices found"
              description="Create the first invoice to get started."
              action={
                <Link to="/billing/invoices/new">
                  <Button size="sm">New invoice</Button>
                </Link>
              }
            />
          }
        />

        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        </div>
      </Card>
    </div>
  );
}
